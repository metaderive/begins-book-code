/** エンコード用カードDB: 名前 → { バイトID, カタログ順(basicSortNo), ページ1か } */
export interface CardInfo {
  id: number;
  sortNo: number;
  /** 真ID = 0x100 + id のカード */
  page1?: boolean;
}

export const CARD_DB: ReadonlyMap<string, CardInfo> = new Map([
  ["ゴブリン", { id: 0x07, sortNo: 1 }],
  ["ウルフ", { id: 0x03, sortNo: 2 }],
  ["ファイター", { id: 0x19, sortNo: 3 }],
  ["ジャイアントラット", { id: 0x00, sortNo: 4 }],
  ["スタチュー", { id: 0x0c, sortNo: 5 }],
  ["バルダンダース", { id: 0x16, sortNo: 6 }],
  ["ゾンビ", { id: 0x0e, sortNo: 7 }],
  ["アンバーモス", { id: 0x02, sortNo: 8 }],
  ["ジャイアントスパイダー", { id: 0x4c, sortNo: 9, page1: true }],
  ["スケルトン", { id: 0x0b, sortNo: 10 }],
  ["シーフ", { id: 0x0a, sortNo: 11 }],
  ["ゴールドトーテム", { id: 0x06, sortNo: 14 }],
  ["バンディット", { id: 0x17, sortNo: 15 }],
  ["ルナティックヘア", { id: 0x1d, sortNo: 16 }],
  ["ボージェス", { id: 0x1a, sortNo: 17 }],
  ["ビーコンタワー", { id: 0x4d, sortNo: 18, page1: true }],
  ["トロージャンホース", { id: 0x12, sortNo: 20 }],
  ["ティラノサウルス", { id: 0x0f, sortNo: 27 }],
  ["ワンダーウォール", { id: 0x20, sortNo: 30 }],
  ["ケットシー", { id: 0x2a, sortNo: 44 }],
  ["ブリンクス", { id: 0x7f, sortNo: 130 }],
  ["グーバ", { id: 0x66, sortNo: 197 }],
  ["メイス", { id: 0xe3, sortNo: 200 }],
  ["バックラー", { id: 0xce, sortNo: 240 }],
  ["ナイトシールド", { id: 0xc8, sortNo: 241 }],
  ["マジックシールド", { id: 0xe2, sortNo: 242 }],
  ["タワーシールド", { id: 0xc2, sortNo: 243 }],
  ["アーメット", { id: 0xa6, sortNo: 247 }],
  ["ペトリフストーン", { id: 0xdd, sortNo: 248 }],
  ["ニュートラルクローク", { id: 0xc9, sortNo: 250 }],
  ["アビサルトーム", { id: 0x75, sortNo: 252, page1: true }],
  ["スリング", { id: 0xc0, sortNo: 253 }],
  ["ガセアスフォーム", { id: 0xb0, sortNo: 255 }],
  ["スモークトーチ", { id: 0xbf, sortNo: 257 }],
  ["グレムリンアムル", { id: 0xb5, sortNo: 262 }],
  ["スティンクボトル", { id: 0xba, sortNo: 263 }],
  ["ホーリーワード1", { id: 0x31, sortNo: 281, page1: true }],
  ["フライ", { id: 0x28, sortNo: 288, page1: true }],
  ["マウンテンリープ", { id: 0x36, sortNo: 289, page1: true }],
  ["レイクリープ", { id: 0x49, sortNo: 290, page1: true }],
  ["ドレインマジック", { id: 0x1a, sortNo: 314, page1: true }],
  ["ライフストリーム", { id: 0x3d, sortNo: 346, page1: true }],
  ["イレイジャー", { id: 0xf1, sortNo: 395 }],
]);
