/**
 * 文字レイヤー: 記号置換Base64。
 * 標準Base64のうち紛らわしい4文字を記号に置換したアルファベットを使う。
 *   I → &   O → ?   0 → #   l → @
 * `=` パディング・4文字=3バイト境界は標準Base64と同じ。
 */

const STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SUBST: Record<string, string> = { I: "&", O: "?", "0": "#", l: "@" };

const CHAR_TO_VAL = new Map<string, number>();
const VAL_TO_CHAR: string[] = [];
for (let i = 0; i < 64; i++) {
  const std = STD[i]!;
  const ch = SUBST[std] ?? std;
  CHAR_TO_VAL.set(ch, i);
  VAL_TO_CHAR.push(ch);
}

/** ブックコード文字列 → バイト列。空白は無視する。 */
export function codeToBytes(code: string): Uint8Array {
  const chars = [...code.replace(/[\s　]/g, "")].filter((c) => c !== "=");
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of chars) {
    const v = CHAR_TO_VAL.get(ch);
    if (v === undefined) {
      throw new Error(`不正な文字: "${ch}"`);
    }
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** バイト列 → ブックコード文字列（4文字区切り・パディング付き）。 */
export function bytesToCode(data: Uint8Array, group = 4): string {
  let out = "";
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i]!;
    const b1 = data[i + 1];
    const b2 = data[i + 2];
    out += VAL_TO_CHAR[b0 >> 2]!;
    out += VAL_TO_CHAR[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]!;
    out += b1 === undefined ? "=" : VAL_TO_CHAR[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]!;
    out += b2 === undefined ? "=" : VAL_TO_CHAR[b2 & 0x3f]!;
  }
  if (group > 0) {
    out = out.replace(new RegExp(`(.{${group}})`, "g"), "$1 ").trimEnd();
  }
  return out;
}
