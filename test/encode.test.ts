import { describe, expect, it } from "vitest";
import { bytesToCode, codeToBytes, decode, encodeBook, parseHeader } from "../src/index.js";

function hex(code: string): string {
  return [...codeToBytes(code)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** DecodedBook を encodeBook 入力へ。枚数はヒストグラム（ID列の2部×クラス構成）から復元する。 */
function toBookCards(book: ReturnType<typeof decode>): { name: string; count: number }[] {
  const out: { name: string; count: number }[] = [];
  let i = 0;
  for (const page of [0, 1] as const) {
    for (const count of [1, 2, 3, 4] as const) {
      const n = book.header.histogram[count]?.[page] ?? 0;
      for (let k = 0; k < n; k++) out.push({ name: book.cards[i++]!.name, count });
    }
  }
  return out;
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

  it("エンコード→デコードの往復が一致する（Aカード付き）", () => {
    const cards = [
      ...["ゴブリン", "ウルフ", "ファイター", "ボージェス"].map((name) => ({ name, count: 3 })),
      ...["ジャイアントラット", "スタチュー", "バルダンダース", "ゾンビ",
        "アンバーモス", "シーフ", "ジャイアントスパイダー"].map((name) => ({ name, count: 4 })),
    ];
    const code = encodeBook(cards, ["ゴブリン", "ジャイアントラット"]);
    const book = decode(code);
    expect(book.cards).toHaveLength(11);
    expect(book.aceCards.map((a) => a.cardName)).toEqual(["ゴブリン", "ジャイアントラット"]);
  });
});

describe("正準化：登録順を吸収する", () => {
  // 全て ×4・page0 の10種 → ヒストグラム {4:[10,0]}、ID列は単一グループなので入れ替え自由
  const DECK = [
    "ゴブリン", "ウルフ", "ファイター", "ジャイアントラット", "スタチュー",
    "バルダンダース", "ゾンビ", "アンバーモス", "シーフ", "スケルトン",
  ].map((name) => ({ name, count: 4 }));

  it("encodeBookは入力順に依存せず同一コードを出す（＝正準形を出力）", () => {
    const forward = encodeBook(DECK);
    const reversed = encodeBook([...DECK].reverse());
    expect(reversed).toBe(forward);
  });

  it("デコーダはID列順をそのまま保持し、正規化しない", () => {
    const canonical = encodeBook(DECK);
    const bytes = Uint8Array.from(codeToBytes(canonical));
    const { length: hl } = parseHeader(bytes);
    const idStart = hl + 1; // ヘッダー + Aカード数バイト(0x00) の次がID列
    const swapped = Uint8Array.from(bytes);
    [swapped[idStart], swapped[idStart + 1]] = [swapped[idStart + 1]!, swapped[idStart]!];
    const reordered = bytesToCode(swapped);

    expect(reordered).not.toBe(canonical); // 登録順が違えば文字列も違う
    const a = decode(canonical);
    const b = decode(reordered);
    expect(b.cards.map((c) => c.id)).not.toEqual(a.cards.map((c) => c.id)); // 並びは保持＝違う
    const multiset = (bk: typeof a) => bk.cards.map((c) => c.trueId).sort((x, y) => x - y);
    expect(multiset(b)).toEqual(multiset(a)); // 多重集合は同じ＝同じデッキ
  });

  it("decode→encode で登録順違いのコードは同一の正準コードに収束する", () => {
    const canonical = encodeBook(DECK);
    const bytes = Uint8Array.from(codeToBytes(canonical));
    const { length: hl } = parseHeader(bytes);
    const idStart = hl + 1;
    const swapped = Uint8Array.from(bytes);
    [swapped[idStart], swapped[idStart + 1]] = [swapped[idStart + 1]!, swapped[idStart]!];
    const reordered = bytesToCode(swapped);

    // 別々の並びのコードでも、往復すると両方とも正準コードに戻る（＝重複排除に使える）
    expect(encodeBook(toBookCards(decode(canonical)))).toBe(canonical);
    expect(encodeBook(toBookCards(decode(reordered)))).toBe(canonical);
  });
});
