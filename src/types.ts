/** 枚数クラス(1〜4) → [ページ0種類数, ページ1種類数]。
 * ページ0 = 真ID < 256、ページ1 = 真ID >= 256 のカード。 */
export type Histogram = Partial<Record<1 | 2 | 3 | 4, readonly [number, number]>>;

/** A（エース）カードの指定。1 ブックにつき A1〜A3 の 3 スロットまで。 */
export interface AceCard {
  /** A1〜A3 のスロット番号（1始まり） */
  slot: number;
  /** ID列上の位置（参照値×4） */
  position: number;
  /** 対象カードのバイトID（位置がID列内のとき） */
  cardId?: number;
  /** 対象カード名（判明しているとき） */
  cardName?: string;
}

export interface CardEntry {
  /** コード上の1バイトID（真IDの下位バイト） */
  id: number;
  /** 真ID（ページ1なら id + 0x100） */
  trueId: number;
  /** 0 = 真ID < 256, 1 = 真ID >= 256（ID列の2部構成の位置から復元） */
  page: 0 | 1;
  /** カード名。未確定は候補列挙、不明は "?" */
  name: string;
}

export interface DecodedBook {
  header: {
    bytes: Uint8Array;
    histogram: Histogram;
  };
  /** Aカード数バイト（下位7bit = 指定数。0x80フラグの意味は未解明） */
  aceCardByte: number;
  /** Aカードの指定（A1〜A3） */
  aceCards: AceCard[];
  /** ID列（コード内の並び順のまま） */
  cards: CardEntry[];
}
