import { codeToBytes } from "./alphabet.js";
import { cardName } from "./cards.js";
import { parseHeader } from "./header.js";
import type { AceCard, DecodedBook } from "./types.js";

/** Aカードフィールドの総バイト長（先頭バイト含む）。count = フィールド先頭2ビット。 */
const ACE_FIELD_LEN: Readonly<Record<number, number>> = { 0: 1, 1: 2, 2: 3, 3: 3 };

/**
 * Aカードフィールド（先頭を含むLEビット列）を解釈する。
 *   bit0-1   : count（Aカード数）
 *   bit2/3/4 : A1/A2/A3 のページフラグ（0=ページ0, 1=ページ1）
 *   bit6+6i  : Ai のページ内インデックス（同ページのID列で何番目か, 6bit）
 * 対象カード = そのページの ID 列で idx 番目（ページ1なら nPage0 + idx）。
 */
function parseAceCards(
  field: Uint8Array,
  count: number,
  cards: DecodedBook["cards"],
  nPage0: number,
): AceCard[] {
  if (count === 0) return [];
  let value = 0n;
  for (let i = field.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(field[i]!);
  }
  const aces: AceCard[] = [];
  for (let i = 0; i < count; i++) {
    const page = Number((value >> BigInt(2 + i)) & 1n) as 0 | 1;
    const pageIndex = Number((value >> BigInt(6 + 6 * i)) & 0x3fn);
    const position = page === 1 ? nPage0 + pageIndex : pageIndex;
    const target = cards[position];
    aces.push({
      slot: i + 1,
      page,
      pageIndex,
      position,
      cardId: target?.id,
      cardName: target?.name,
    });
  }
  return aces;
}

/** ブックコードをデコードする。 */
export function decode(code: string): DecodedBook {
  const data = codeToBytes(code);
  const { histogram, length } = parseHeader(data);
  const rest = data.slice(length);
  if (rest.length === 0) {
    throw new Error("Aカードフィールドがない");
  }
  const aceCardByte = rest[0]!;
  const aceCount = aceCardByte & 0x03;
  const aceLen = ACE_FIELD_LEN[aceCount]!;
  const aceField = rest.slice(0, aceLen);
  const ids = rest.slice(aceLen);

  // ID列 = [ページ0][ページ1] の2部構成。境界 = ヘッダーのページ0種類数合計
  const nPage0 = Object.values(histogram).reduce((s, pair) => s + (pair?.[0] ?? 0), 0);
  const cards = [...ids].map((id, i) => {
    const page1 = i >= nPage0;
    return {
      id,
      trueId: page1 ? id + 0x100 : id,
      page: page1 ? (1 as const) : (0 as const),
      name: cardName(id, page1),
    };
  });

  return {
    header: { bytes: data.slice(0, length), histogram },
    aceCardByte,
    aceCards: parseAceCards(aceField, aceCount, cards, nPage0),
    cards,
  };
}
