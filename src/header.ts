/**
 * ヘッダー = ページ別（真ID<256=page0 / >=256=page1）×枚数クラス別の種類数。
 *
 * MSBビット列。先頭バイト（page0）とマーカーバイト（page1）はほぼ同構造:
 *   [先頭ビット : 1bit]        … page0 は下記規則、page1 は常に 0（マーカー）
 *   [高位フラグ H : 1bit]      … そのページに ×3 または ×4 のカードが在るか (n3>0 || n4>0)
 *   [×1フラグ    : 1bit]      … そのページに ×1 のカードが在るか (n1>0)
 *   [×2の種類数  : 5bit]
 *   [×1の種類数  : 8bit]      （×1フラグのとき）
 *   [×4の種類数  : 4bit][×3の種類数 : 4bit]   （高位フラグ H のとき、この順でペア）
 *   → バイト境界まで0詰め（page1側は末尾の全0バイトを切り詰め＝可変長2〜6Bの正体）
 *
 * ×3 と ×4 は独立フラグを持たず「高位フラグ H」を共有し、H が立つと n4(4bit)+n3(4bit) の
 * 8bit ブロックを必ずペアで書く（片方0でも両方書く）。実機12本（既知10＋新規2）で確定:
 *   - S8 `{1:[5,1],2:[3,0],3:[4,0],4:[4,0]}`=`e3 05 44 20 01`: page1 は ×3/×4 とも無い
 *     (p3[1]=0,p4[1]=0) → H=0、marker `20 01` のみ。
 *   - NEWp1 `{1:[1,0],3:[0,1],4:[9,0]}`=`e0 01 90 40 01`: page1 に ×3 のみ → H=1、n4p1=0+n3p1=1。
 *
 * 先頭ビット（page0 のみ可変・実機12本で確定）:
 *   - page0 先頭ビット = 0 ⇔ そのページが「×3 のみ」（×3 あり・×4 なし）。それ以外は 1。
 *     ＝ (p4[0]>0) || (p3[0]==0)。高位ブロックが ×3 単独か（0）×4 を含むか（1）の区別で、
 *     高位ブロックが無い（H=0）なら 1。実機 `60 01 0d …`（NEWp0 {1:[1,0],3:[13,0]}＝×4無し・
 *     ×3のみ）の先頭 `60` がこれを示す。旧実装は定数1（`e0`）で実機と不一致、かつデコーダが
 *     先頭ビット0を弾いていた。
 *   - page1 先頭ビット = 常に 0。×4 を含む page1（例 S1 {4:[9,1]} の marker `40`）でも 0 なので、
 *     これは page0 規則の対称適用ではなく独立した「ページ1マーカー」。
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

/** 1ページ分のビットを書く。isPage0=true は page0（先頭ビットは ×3のみ判定）、false は page1
 * （先頭ビットは常に 0 のマーカー）。末尾でバイト境界まで0詰め。 */
function encodePage(w: BitWriter, n1: number, n2: number, n3: number, n4: number, isPage0: boolean): void {
  const hi = n3 > 0 || n4 > 0; // ×3/×4 が在るか（高位フラグ H）
  // 先頭ビット: page0 は「×3 のみ（×3 あり・×4 なし）」で 0、それ以外 1。page1 は常に 0。
  const lead = isPage0 ? (n3 > 0 && n4 === 0 ? 0 : 1) : 0;
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
  encodePage(w, p1[0], p2[0], p3[0], p4[0], true);
  encodePage(w, p1[1], p2[1], p3[1], p4[1], false);
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

/** bits[pos] から1ページ分を読む。末尾でバイト境界まで進める。
 * page1（isPage0=false）は先頭ビットが 0（マーカー）でなければ null。
 * page0（isPage0=true）の先頭ビットは ×3のみ判定フラグなので構造には使わず読み飛ばす
 *（値はヒストグラムから一意に定まり、再エンコード一致検証で担保する）。 */
function parsePage(bits: string, pos: number, isPage0: boolean): PageCounts | null {
  if (pos + 8 > bits.length) return null;
  if (!isPage0 && bits[pos] !== "0") return null;
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

/** page1 は全ゼロだと encodeHeader で切り詰められる → マーカー有無の両仮説を試す。 */
function parseBranch(bits: string, markerPresent: boolean): Histogram | null {
  const p0 = parsePage(bits, 0, true);
  if (p0 === null) return null;
  let n1p1 = 0;
  let n2p1 = 0;
  let n3p1 = 0;
  let n4p1 = 0;
  if (markerPresent) {
    const p1 = parsePage(bits, p0.pos, false);
    if (p1 === null) return null;
    n1p1 = p1.n1;
    n2p1 = p1.n2;
    n3p1 = p1.n3;
    n4p1 = p1.n4;
  }
  const hist: Histogram = {};
  if (p0.n1 + n1p1 > 0) hist[1] = [p0.n1, n1p1];
  if (p0.n2 + n2p1 > 0) hist[2] = [p0.n2, n2p1];
  if (p0.n3 + n3p1 > 0) hist[3] = [p0.n3, n3p1];
  if (p0.n4 + n4p1 > 0) hist[4] = [p0.n4, n4p1];
  return hist;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** ヒストグラムが表すデッキの総枚数 = Σ 枚数クラス × (page0種類数 + page1種類数)。 */
function deckTotal(h: Histogram): number {
  let t = 0;
  for (const c of [1, 2, 3, 4] as const) {
    const p = h[c];
    if (p) t += c * (p[0] + p[1]);
  }
  return t;
}

/** コード先頭からヘッダーを解釈する。page1 マーカーの有無（全0なら切り詰め）だけが曖昧なので、
 * 両仮説で読み、再エンコードが入力先頭と一致する候補を集める。複数一致したら、ビギンズの
 * ブックが常に40枚である不変条件（Σ 枚数クラス×種類数 = 40）で絞り、無ければ全候補から
 * 最長（最も特定的＝page1を含む）を採る。×1〜×4 が page0/page1 のどの分布でも一意に復元できる
 * （実機一致。SPEC §3 参照）。
 * 注意: page0 先頭ビットは「×3のみ」で 0 になり得るため、先頭ビット=1 を要求してはならない
 *（実機 `60 01 0d …` 等）。正当性は再エンコード一致で担保する。 */
export function parseHeader(data: Uint8Array): { histogram: Histogram; length: number } {
  if (data.length === 0) {
    throw new Error("ヘッダーが空");
  }
  const bits = bitsOf(data, 10);
  const candidates: Array<{ histogram: Histogram; length: number }> = [];
  for (const markerPresent of [true, false]) {
    const hist = parseBranch(bits, markerPresent);
    if (hist === null) continue;
    const enc = encodeHeader(hist);
    if (bytesEqual(data.slice(0, enc.length), enc)) {
      candidates.push({ histogram: hist, length: enc.length });
    }
  }
  if (candidates.length === 0) throw new Error("ヘッダー解釈失敗");
  const valid = candidates.filter((c) => deckTotal(c.histogram) === 40);
  const pool = valid.length > 0 ? valid : candidates;
  let best = pool[0]!;
  for (const c of pool) {
    if (c.length > best.length) best = c;
  }
  return best;
}
