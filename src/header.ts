/**
 * ヘッダー = ページ別（真ID<256=page0 / >=256=page1）×枚数クラス別の種類数。
 *
 * MSBビット列。先頭バイト（page0）とマーカーバイト（page1）はほぼ同構造:
 *   [先頭ビット : 1bit]        … page0 は「ページ1セクションが続くか」、page1 は常に 0
 *   [高位フラグ H : 1bit]      … そのページに ×3 または ×4 のカードが在るか (n3>0 || n4>0)
 *   [×1フラグ    : 1bit]      … そのページに ×1 のカードが在るか (n1>0)
 *   [×2の種類数  : 5bit]
 *   [×1の種類数  : 8bit]      （×1フラグのとき）
 *   [×4の種類数  : 4bit][×3の種類数 : 4bit]   （高位フラグ H のとき、この順でペア）
 *   → バイト境界まで0詰め（page1 が空なら page1 セクションは書かない＝可変長1〜6Bの正体。
 *     最短は {2:[20,0]} の `14` 1B＝実機エクスポートで確認）
 *
 * ×3 と ×4 は独立フラグを持たず「高位フラグ H」を共有し、H が立つと n4(4bit)+n3(4bit) の
 * 8bit ブロックを必ずペアで書く（片方0でも両方書く）。実機15本で確定:
 *   - S8 `{1:[5,1],2:[3,0],3:[4,0],4:[4,0]}`=`e3 05 44 20 01`: page1 は ×3/×4 とも無い
 *     (p3[1]=0,p4[1]=0) → H=0、marker `20 01` のみ。
 *   - NEWp1 `{1:[1,0],3:[0,1],4:[9,0]}`=`e0 01 90 40 01`: page1 に ×3 のみ → H=1、n4p1=0+n3p1=1。
 *
 * 先頭ビット（実機15本で確定）:
 *   - page0 先頭ビット = ページ1セクションが続くなら 1、ページ1が空（page1 の ×1〜×4 種類数が
 *     全て 0）なら 0。＝「次にページ1セクションがあるか」のマーカー。
 *     ページ1 が空で先頭 0 の実機例は 3 本: `60 01 0d`（NEWp0 {1:[1,0],3:[13,0]}）、
 *     `40 a0`（{4:[10,0]}）、`14`（{2:[20,0]}・1B）。他の12本（全て page1 あり）は 1。
 *     旧 beta.2 は「page0 が ×3 のみ（×4 なし）なら 0」としていたが、これは NEWp0 1本への
 *     過学習で誤り。{1:[16,10],2:[3,1],3:[1,1]}（page0 が ×3 のみ・page1 あり）で beta.2 の
 *     `63 10 01 61 0a 01` は実機に弾かれ、先頭ビットを立てた `e3 10 01 61 0a 01` が受理・内容一致
 *     した（2026-09-12）。
 *     「ページ1が空で page0 に ×4 がある／×3 が無い」構成（本規則の予測は先頭 0、旧規則なら 1 で
 *     両規則が食い違う唯一の構成）は、2026-09-12 の実機エクスポート `40 a0`（{4:[10,0]}）が先頭 0 を
 *     出して本規則で確定。同日の実機エクスポート `14`（{2:[20,0]}）も先頭 0。
 *   - page1 先頭ビット = 常に 0（ページ2は無いので）。×4 を含む page1（例 S1 {4:[9,1]} の
 *     marker `40`）でも 0。
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
    return Uint8Array.from(out);
  }
}

function pair(h: Histogram, c: 1 | 2 | 3 | 4): readonly [number, number] {
  return h[c] ?? [0, 0];
}

/** 1ページ分のビットを書く。lead は先頭ビット（page0 は「ページ1セクションが続くか」、
 * page1 は常に 0 のマーカー）。末尾でバイト境界まで0詰め。 */
function encodePage(w: BitWriter, n1: number, n2: number, n3: number, n4: number, lead: 0 | 1): void {
  const hi = n3 > 0 || n4 > 0; // ×3/×4 が在るか（高位フラグ H）
  w.push(lead, 1);
  w.push(hi ? 1 : 0, 1);
  w.push(n1 > 0 ? 1 : 0, 1);
  w.push(n2, 5);
  if (n1 > 0) w.push(n1, 8);
  if (hi) {
    w.push(n4, 4);
    w.push(n3, 4);
  }
  w.padToByte();
}

export function encodeHeader(hist: Histogram): Uint8Array {
  const w = new BitWriter();
  const [p1, p2, p3, p4] = [pair(hist, 1), pair(hist, 2), pair(hist, 3), pair(hist, 4)];
  const hasPage1 = p1[1] + p2[1] + p3[1] + p4[1] > 0;
  // page0 先頭ビット = ページ1セクションが続くか。page1 が空ならセクション自体を書かない。
  encodePage(w, p1[0], p2[0], p3[0], p4[0], hasPage1 ? 1 : 0);
  if (hasPage1) {
    encodePage(w, p1[1], p2[1], p3[1], p4[1], 0);
  }
  return w.toBytes();
}

function bitsOf(data: Uint8Array, upTo: number): string {
  let s = "";
  for (let i = 0; i < Math.min(data.length, upTo); i++) {
    s += data[i]!.toString(2).padStart(8, "0");
  }
  return s + "0".repeat(64);
}

interface PageCounts {
  n1: number;
  n2: number;
  n3: number;
  n4: number;
  pos: number;
}

/** bits[pos] から1ページ分を読む（先頭ビットは呼び出し側で解釈済みなので読み飛ばす）。
 * 末尾でバイト境界まで進める。 */
function parsePage(bits: string, pos: number): PageCounts | null {
  if (pos + 8 > bits.length) return null;
  const hi = bits[pos + 1] === "1";
  const hasN1 = bits[pos + 2] === "1";
  const n2 = parseInt(bits.slice(pos + 3, pos + 8), 2);
  pos += 8;
  let n1 = 0;
  let n3 = 0;
  let n4 = 0;
  if (hasN1) {
    n1 = parseInt(bits.slice(pos, pos + 8), 2);
    pos += 8;
  }
  if (hi) {
    n4 = parseInt(bits.slice(pos, pos + 4), 2);
    pos += 4;
    n3 = parseInt(bits.slice(pos, pos + 4), 2);
    pos += 4;
  }
  pos += (8 - (pos % 8)) % 8;
  return { n1, n2, n3, n4, pos };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** コード先頭からヘッダーを解釈する。page0 の先頭ビットが「ページ1セクションが続くか」の
 * マーカーなので、それに従って page1 を読むか決め（page1 の先頭ビットは 0 でなければならない）、
 * 得たヒストグラムを再エンコードして入力先頭とバイト一致することを検証する。
 * ×1〜×4 が page0/page1 のどの分布でも一意に復元できる（実機一致。SPEC §3 参照）。 */
export function parseHeader(data: Uint8Array): { histogram: Histogram; length: number } {
  if (data.length === 0) {
    throw new Error("ヘッダーが空");
  }
  const bits = bitsOf(data, 10);
  const hasPage1 = bits[0] === "1";
  const p0 = parsePage(bits, 0);
  if (p0 === null) throw new Error("ヘッダー解釈失敗");
  let p1: PageCounts = { n1: 0, n2: 0, n3: 0, n4: 0, pos: p0.pos };
  if (hasPage1) {
    if (bits[p0.pos] !== "0") throw new Error("ヘッダー解釈失敗（page1 マーカー不正）");
    const parsed = parsePage(bits, p0.pos);
    if (parsed === null) throw new Error("ヘッダー解釈失敗");
    p1 = parsed;
  }
  const hist: Histogram = {};
  if (p0.n1 + p1.n1 > 0) hist[1] = [p0.n1, p1.n1];
  if (p0.n2 + p1.n2 > 0) hist[2] = [p0.n2, p1.n2];
  if (p0.n3 + p1.n3 > 0) hist[3] = [p0.n3, p1.n3];
  if (p0.n4 + p1.n4 > 0) hist[4] = [p0.n4, p1.n4];
  const enc = encodeHeader(hist);
  if (!bytesEqual(data.slice(0, enc.length), enc)) {
    throw new Error("ヘッダー解釈失敗（再エンコード不一致）");
  }
  return { histogram: hist, length: enc.length };
}
