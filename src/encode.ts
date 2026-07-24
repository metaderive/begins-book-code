import { bytesToCode } from "./alphabet.js";
import { CARD_DB } from "./carddb.js";
import { encodeHeader } from "./header.js";
import type { Histogram } from "./types.js";

export interface BookCard {
  name: string;
  count: number;
}

/**
 * ブック定義からコードを生成する。
 * cards: 合計40枚・枚数1〜4。aceCards: A（エース）カードのカード名（A1,A2,A3の順、最大3つ）。
 * 並びは正準形（枚数クラス昇順 → グループ内はページ0→ページ1、各カタログ順）で出力する。
 */
export function encodeBook(cards: readonly BookCard[], aceCards: readonly string[] = []): string {
  const total = cards.reduce((s, c) => s + c.count, 0);
  if (total !== 40) {
    throw new Error(`合計枚数 ${total} ≠ 40`);
  }
  const entries = cards.map(({ name, count }) => {
    const info = CARD_DB.get(name);
    if (!info) throw new Error(`IDが未確定のカード: ${name}`);
    if (count < 1 || count > 4) throw new Error(`枚数が不正: ${name} ×${count}`);
    return { name, count, ...info };
  });

  const hist: Record<number, [number, number]> = {};
  for (const e of entries) {
    const pair = (hist[e.count] ??= [0, 0]);
    pair[e.page1 ? 1 : 0]++;
  }
  const header = encodeHeader(hist as Histogram);

  // ID列 = [ページ0: クラス昇順][ページ1: クラス昇順]、各カタログ順
  const stream: typeof entries = [];
  for (const page1 of [false, true]) {
    for (const count of [1, 2, 3, 4]) {
      stream.push(
        ...entries
          .filter((e) => e.count === count && Boolean(e.page1) === page1)
          .sort((a, b) => a.sortNo - b.sortNo || a.id - b.id),
      );
    }
  }

  if (aceCards.length > 3) throw new Error("Aカードは3つまで");
  const aceBytes: number[] = [aceCards.length];
  if (aceCards.length > 0) {
    let value = 0n;
    aceCards.forEach((name, i) => {
      const pos = stream.findIndex((e) => e.name === name);
      if (pos < 0) throw new Error(`Aカード対象がブックにない: ${name}`);
      if (pos % 4 !== 0) {
        throw new Error(`Aカード対象 ${name} の位置${pos}が4の倍数でない（既知の参照形式では表現不可）`);
      }
      value |= BigInt(pos / 4) << BigInt(6 * i);
    });
    const len = aceCards.length === 1 ? 1 : 2;
    for (let i = 0; i < len; i++) {
      aceBytes.push(Number((value >> BigInt(8 * i)) & 0xffn));
    }
  }

  return bytesToCode(
    Uint8Array.from([...header, ...aceBytes, ...stream.map((e) => e.id)]),
  );
}
