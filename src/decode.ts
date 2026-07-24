import { codeToBytes } from "./alphabet.js";
import { cardName } from "./cards.js";
import { parseHeader } from "./header.js";
import type { AceCard, DecodedBook } from "./types.js";

/** Aカード数バイト → データ長（経験則。0x80フラグはスロット関連とみられ未解明） */
const ACE_DATA_LEN: ReadonlyMap<number, number> = new Map([
  [0x00, 0],
  [0x01, 1],
  [0x02, 2],
  [0x03, 2],
  [0x81, 1],
]);

/** Aカードデータ = LEビット列に6bit参照をA1..An順で格納。参照×4 = ID列上の位置。 */
function parseAceCards(
  data: Uint8Array,
  count: number,
  cards: DecodedBook["cards"],
): AceCard[] {
  if (count === 0 || data.length === 0) return [];
  let value = 0n;
  for (let i = data.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(data[i]!);
  }
  const aces: AceCard[] = [];
  for (let i = 0; i < count; i++) {
    const ref = Number((value >> BigInt(6 * i)) & 0x3fn);
    const position = ref * 4;
    const target = cards[position];
    aces.push({
      slot: i + 1,
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
  const aceCount = aceCardByte & 0x7f;
  const dataLen = ACE_DATA_LEN.get(aceCardByte);
  if (dataLen === undefined) {
    throw new Error(`未解析のAカードバイト: 0x${aceCardByte.toString(16)}`);
  }
  const aceData = rest.slice(1, 1 + dataLen);
  const ids = rest.slice(1 + dataLen);

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
    aceCards: parseAceCards(aceData, aceCount, cards),
    cards,
  };
}
