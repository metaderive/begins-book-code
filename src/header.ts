/**
 * ヘッダー = ページ別（真ID<256 / >=256）×枚数クラス別の種類数。
 * MSBビット列（既知10ヘッダーを完全再現する解読済み文法）:
 *   [1][×4あり][×1あり][×2のp0:5bit]
 *   [×1のp0:8bit]? [×4のp0:4bit]? [×3のp0:4bit]? → バイト境界まで0詰め
 *   [0][×4p1あり][×1p1あり][×2のp1:5bit]
 *   [×1のp1:8bit]? [×4のp1:4bit]? [×3のp1:4bit]? → 末尾の全0バイトは切り詰め
 */
import type { Histogram } from "./types.js";

class BitWriter {
  private bits = "";
  push(value: number, width: number): void {
    this.bits += value.toString(2).padStart(width, "0");
  }
  padToByte(): void {
    this.bits += "0".repeat((8 - (this.bits.length % 8)) % 8);
  }
  toBytes(): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      out.push(parseInt(this.bits.slice(i, i + 8), 2));
    }
    while (out.length > 0 && out[out.length - 1] === 0) {
      out.pop();
    }
    return Uint8Array.from(out);
  }
}

function pair(h: Histogram, c: 1 | 2 | 3 | 4): readonly [number, number] {
  return h[c] ?? [0, 0];
}

export function encodeHeader(hist: Histogram): Uint8Array {
  const w = new BitWriter();
  const [p1, p2, p3, p4] = [pair(hist, 1), pair(hist, 2), pair(hist, 3), pair(hist, 4)];
  w.push(1, 1);
  w.push(p4[0] + p4[1] > 0 ? 1 : 0, 1);
  w.push(p1[0] + p1[1] > 0 ? 1 : 0, 1);
  w.push(p2[0], 5);
  if (p1[0] + p1[1] > 0) w.push(p1[0], 8);
  if (p4[0] + p4[1] > 0) w.push(p4[0], 4);
  if (p3[0] + p3[1] > 0) w.push(p3[0], 4);
  w.padToByte();
  w.push(0, 1);
  w.push(p4[1] > 0 ? 1 : 0, 1);
  w.push(p1[1] > 0 ? 1 : 0, 1);
  w.push(p2[1], 5);
  if (p1[1] > 0) w.push(p1[1], 8);
  if (p4[1] > 0) w.push(p4[1], 4);
  if (p3[0] + p3[1] > 0) w.push(p3[1], 4);
  w.padToByte();
  return w.toBytes();
}

function bitsOf(data: Uint8Array, upTo: number): string {
  let s = "";
  for (let i = 0; i < Math.min(data.length, upTo); i++) {
    s += data[i]!.toString(2).padStart(8, "0");
  }
  return s + "0".repeat(64);
}

function parseBranch(bits: string, withN3: boolean, markerPresent: boolean): Histogram | null {
  const f4 = bits[1] === "1";
  const f1 = bits[2] === "1";
  const n2p0 = parseInt(bits.slice(3, 8), 2);
  let pos = 8;
  let n1p0 = 0;
  let n4p0 = 0;
  let n3p0 = 0;
  if (f1) {
    n1p0 = parseInt(bits.slice(pos, pos + 8), 2);
    pos += 8;
  }
  if (f4) {
    n4p0 = parseInt(bits.slice(pos, pos + 4), 2);
    pos += 4;
  }
  if (withN3) {
    n3p0 = parseInt(bits.slice(pos, pos + 4), 2);
    pos += 4;
    if (n3p0 === 0) return null;
  }
  pos += (8 - (pos % 8)) % 8;
  let n1p1 = 0;
  let n4p1 = 0;
  let n3p1 = 0;
  let n2p1 = 0;
  // マーカーバイトは page1 全ゼロだと encodeHeader で切り詰められる → 「無し」仮説も試す
  if (markerPresent) {
    if (pos + 8 > bits.length || bits[pos] !== "0") return null;
    const m4 = bits[pos + 1] === "1";
    const m1 = bits[pos + 2] === "1";
    n2p1 = parseInt(bits.slice(pos + 3, pos + 8), 2);
    pos += 8;
    if (m1) {
      n1p1 = parseInt(bits.slice(pos, pos + 8), 2);
      pos += 8;
    }
    if (m4) {
      n4p1 = parseInt(bits.slice(pos, pos + 4), 2);
      pos += 4;
    }
    if (withN3) {
      n3p1 = parseInt(bits.slice(pos, pos + 4), 2);
      pos += 4;
    }
  }
  const hist: Histogram = {};
  if (n1p0 + n1p1 > 0) hist[1] = [n1p0, n1p1];
  if (n2p0 + n2p1 > 0) hist[2] = [n2p0, n2p1];
  if (n3p0 + n3p1 > 0) hist[3] = [n3p0, n3p1];
  if (n4p0 + n4p1 > 0) hist[4] = [n4p0, n4p1];
  return hist;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** コード先頭からヘッダーを解釈する。全構造仮説（×3有無・マーカー切り詰め有無）を
 * 試し、再エンコードが入力と一致するものを選ぶ。
 * 既知の限界: ×3/×4が「page1のみ（page0=0）」の構成は復元不能（存在フラグが無いため）。 */
export function parseHeader(data: Uint8Array): { histogram: Histogram; length: number } {
  if (data.length === 0 || (data[0]! & 0x80) === 0) {
    throw new Error("ヘッダー先頭ビットが1でない");
  }
  const bits = bitsOf(data, 10);
  // 短い解釈が長い解釈の接頭辞になりうるので、マッチする中で最長（最も特定的）を選ぶ
  let best: { histogram: Histogram; length: number } | null = null;
  for (const withN3 of [false, true]) {
    for (const markerPresent of [true, false]) {
      const hist = parseBranch(bits, withN3, markerPresent);
      if (hist === null) continue;
      const enc = encodeHeader(hist);
      if (bytesEqual(data.slice(0, enc.length), enc)) {
        if (best === null || enc.length > best.length) {
          best = { histogram: hist, length: enc.length };
        }
      }
    }
  }
  if (best !== null) return best;
  throw new Error("ヘッダー解釈失敗");
}
