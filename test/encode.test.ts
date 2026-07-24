import { describe, expect, it } from "vitest";
import { codeToBytes, decode, encodeBook } from "../src/index.js";

function hex(code: string): string {
  return [...codeToBytes(code)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("encodeBook", () => {
  it("S1を正準形でバイト再現する", () => {
    const cards = [
      "ゴブリン", "ウルフ", "ファイター", "ジャイアントラット", "スタチュー",
      "バルダンダース", "ゾンビ", "アンバーモス", "ジャイアントスパイダー", "シーフ",
    ].map((name) => ({ name, count: 4 }));
    expect(hex(encodeBook(cards))).toBe(hex("wJBA EAAH AxkA DBY? AgpM"));
  });

  it("S18を正準形でバイト再現する（アイテム13種・混在枚数）", () => {
    const x4 = ["バックラー", "ナイトシールド", "マジックシールド", "タワーシールド",
      "アーメット", "ペトリフストーン", "ニュートラルクローク", "アビサルトーム",
      "スリング"].map((name) => ({ name, count: 4 }));
    const x1 = ["ガセアスフォーム", "スモークトーチ", "グレムリンアムル",
      "スティンクボトル"].map((name) => ({ name, count: 1 }));
    expect(hex(encodeBook([...x4, ...x1]))).toBe(
      hex("4ASA QBAA sL+1 us7& 4sKm 3cnA dQ=="),
    );
  });

  it("S23を再現する（衝突ペア同居・0x1aが2回）", () => {
    const cards = [
      ...["ゴブリン", "ウルフ", "ファイター", "ジャイアントラット", "スタチュー",
        "バルダンダース", "ゾンビ"].map((name) => ({ name, count: 4 })),
      { name: "アンバーモス", count: 3 },
      { name: "ボージェス", count: 1 },
      { name: "ドレインマジック", count: 4 },
      { name: "ライフストリーム", count: 4 },
    ];
    expect(hex(encodeBook(cards))).toBe(hex("4AFx QCAA Gg&H AxkA DBY? Gj#="));
  });

  it("エンコード→デコードの往復が一致する（マーク付き）", () => {
    const cards = [
      ...["ゴブリン", "ウルフ", "ファイター", "ボージェス"].map((name) => ({ name, count: 3 })),
      ...["ジャイアントラット", "スタチュー", "バルダンダース", "ゾンビ",
        "アンバーモス", "シーフ", "ジャイアントスパイダー"].map((name) => ({ name, count: 4 })),
    ];
    const code = encodeBook(cards, ["ゴブリン", "ジャイアントラット"]);
    const book = decode(code);
    expect(book.cards).toHaveLength(11);
    expect(book.marks.map((m) => m.cardName)).toEqual(["ゴブリン", "ジャイアントラット"]);
  });
});
