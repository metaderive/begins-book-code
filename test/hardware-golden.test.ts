import { describe, expect, it } from "vitest";
import { codeToBytes, decode, encodeBook, encodeHeader, parseHeader } from "../src/index.js";
import type { Histogram } from "../src/index.js";

const hex = (code: string) => [...codeToBytes(code)].map((b) => b.toString(16).padStart(2, "0")).join("");
const hexU8 = (u8: Uint8Array) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");

describe("実機ゴールデン（ヘッダー page1 の ×3/×4 共有フラグ）", () => {
  // 実機（Switch 2）でエクスポートした本物のブックコード。
  // 11種40枚: ジャイアントスパイダー(page1)×3 / page0の9種×4 / ホーンカメレオン×1。
  // ヒストグラム {1:[1,0], 3:[0,1], 4:[9,0]}。page1 に ×3 のみ・×4 無し という、
  // これまで実機サンプルが無く旧エンコーダが誤っていた構成。
  const REAL_CODE = "4AGQ QAEA GwcD GQAM Fg4L Ckw=";
  // e0 01 90 40 01 | 00 | 1b 07 03 19 00 0c 16 0e 0b 0a 4c
  const REAL_BYTES = "e001904001001b070319000c160e0b0a4c";

  const book = [
    { name: "ジャイアントスパイダー", count: 3 },
    ...["ゴブリン", "ウルフ", "ファイター", "ジャイアントラット", "スタチュー",
      "バルダンダース", "ゾンビ", "スケルトン", "シーフ"].map((name) => ({ name, count: 4 })),
    { name: "ホーンカメレオン", count: 1 },
  ];

  it("encodeBook が実機コードとバイト完全一致する", () => {
    expect(hex(encodeBook(book))).toBe(hex(REAL_CODE));
    expect(hexU8(codeToBytes(encodeBook(book)))).toBe(REAL_BYTES);
  });

  it("decode(実機コード) が {1:[1,0],3:[0,1],4:[9,0]}・40枚・正しいID列に復元する", () => {
    const d = decode(REAL_CODE);
    expect(d.header.histogram).toEqual({ 1: [1, 0], 3: [0, 1], 4: [9, 0] });
    expect(d.cards).toHaveLength(11); // 種類数11（総枚数40はヒストグラムが保証）
    expect(d.cards.map((c) => c.id)).toEqual([
      0x1b, 0x07, 0x03, 0x19, 0x00, 0x0c, 0x16, 0x0e, 0x0b, 0x0a, 0x4c,
    ]);
    expect(d.cards.at(-1)).toMatchObject({ trueId: 0x14c, page: 1, name: "ジャイアントスパイダー" });
  });
});

describe("実機ゴールデン（ヘッダー page0 先頭ビット＝ページ1セクションなしで 0）", () => {
  // 実機（Switch 2）でエクスポートした本物のブックコード。
  // 14種40枚: 全て page0、×4 を1枚も使わない。×3 を13種（各×3＝39枚）＋ ミノタウロス ×1。
  // ヒストグラム {1:[1,0], 3:[13,0]}。page1 が空（ページ1セクションが続かない）→ 先頭バイト `60`（MSB=0）。
  // 実機13本中、先頭ビット 0 はこの1本だけ（他12本は全て page1 あり）。
  // beta.1 は先頭を定数1（`e0`）で出し、かつ decoder が先頭0を弾いていた。
  const REAL_CODE = "YAEN AD4H AxkA DBY? Cwob Bhct";
  // 60 01 0d | 00 | 3e 07 03 19 00 0c 16 0e 0b 0a 1b 06 17 2d
  const REAL_BYTES = "60010d003e070319000c160e0b0a1b06172d";

  const book = [
    ...["ゴブリン", "ウルフ", "ファイター", "ジャイアントラット", "スタチュー", "バルダンダース",
      "ゾンビ", "スケルトン", "シーフ", "ホーンカメレオン", "ゴールドトーテム", "バンディット",
      "コボルド"].map((name) => ({ name, count: 3 })),
    { name: "ミノタウロス", count: 1 },
  ];

  it("encodeBook が実機コードとバイト完全一致する（先頭 60）", () => {
    expect(hex(encodeBook(book))).toBe(hex(REAL_CODE));
    expect(hexU8(codeToBytes(encodeBook(book)))).toBe(REAL_BYTES);
  });

  it("decode(実機コード) が {1:[1,0],3:[13,0]}・14種で復元する（先頭ビット0を受理）", () => {
    const d = decode(REAL_CODE);
    expect(d.header.histogram).toEqual({ 1: [1, 0], 3: [13, 0] });
    expect(d.cards).toHaveLength(14);
    expect(d.cards.every((c) => c.page === 0)).toBe(true);
    expect(d.cards[0]).toMatchObject({ id: 0x3e, name: "ミノタウロス" });
  });
});

describe("実機ゴールデン（ヘッダー page0 先頭ビット＝ページ1セクションありで 1。×3のみ判定の否定）", () => {
  // 2026-09-12 実機（Switch 2）で往復確認したコード（実機エクスポート品ではなく、自作コードを
  // 実機が受理し 40枚の中身が完全一致したもの）。
  // 32種40枚: ×3 が2種（page0/page1 に1種ずつ）・×2 が4種・×1 が26種。
  // ヒストグラム {1:[16,10], 2:[3,1], 3:[1,1]}。page0 は「×3 のみ・×4 なし」だが page1 セクションが
  // 続くので先頭バイトは `e3`（MSB=1）。beta.2 の規則（page0 が ×3 のみなら 0）はここで `63` を出し、
  // 実機に弾かれた。先頭ビットは「ページ1セクションが続くか」のマーカーである。
  const REAL_CODE = "4xAB YQoB ABYC HDhA SGh5 fJCZ nuji prdS T3tg KCci JTo+ F5&V @R@g";
  // e3 10 01 61 0a 01 | 00 | 16 02 1c 38 40 48 68 79 7c 90 99 9e e8 e2 a6 b7 52 4f 7b 60 28 27 22 25 3a 3e 17 92 15 95 19 60
  const REAL_BYTES =
    "e31001610a01" + "00" +
    "16021c3840486879" + "7c90999ee8e2a6b7" + "524f7b6028272225" + "3a3e179215951960";
  // beta.2 が出していた実機に弾かれたコード（先頭 `63`、本体は同一）
  const REJECTED_BETA2_CODE = "YxAB YQoB ABYC HDhA SGh5 fJCZ nuji prdS T3tg KCci JTo+ F5&V @R@g";

  const book = [
    ...["アクアアコライト", "ウッドフォーク"].map((name) => ({ name, count: 3 })),
    ...["ゼラチンウォール", "パイレート", "バロン", "ドリームテレイン"].map((name) => ({ name, count: 2 })),
    ...["アンバーモス", "バルダンダース", "リトルグレイ", "ピラーフレイム", "アンダイン",
      "ジャイアントアメーバ", "グリーンモールド", "ノーム", "バンパイア", "スペクター", "プッシュプル",
      "マスターモンク", "アーメット", "サキュバスリング", "マジックシールド", "ロックバイター",
      "テレグノーシス", "テンプテーション", "トライアンフ", "ファインド", "フォーサイト",
      "フォレストリープ", "フライ", "マナ", "ランドトランス", "リキッドフォーム"].map((name) => ({ name, count: 1 })),
  ];

  it("encodeBook が実機受理コードとバイト完全一致する（先頭 e3）", () => {
    expect(hex(encodeBook(book))).toBe(hex(REAL_CODE));
    expect(hexU8(codeToBytes(encodeBook(book)))).toBe(REAL_BYTES);
  });

  it("beta.2 の旧出力（先頭 63）は実機に弾かれた: encodeHeader/encodeBook がそれを出さない", () => {
    expect(hexU8(encodeHeader({ 1: [16, 10], 2: [3, 1], 3: [1, 1] }))).not.toMatch(/^63/);
    expect(hexU8(encodeHeader({ 1: [16, 10], 2: [3, 1], 3: [1, 1] }))).toBe("e31001610a01");
    expect(encodeBook(book)).not.toBe(REJECTED_BETA2_CODE);
    expect(hex(REJECTED_BETA2_CODE).slice(2)).toBe(hex(REAL_CODE).slice(2)); // 本体は同一＝差は先頭ビットのみ
  });

  it("decode(実機受理コード) が {1:[16,10],2:[3,1],3:[1,1]}・32種・正しいID列に復元する", () => {
    const d = decode(REAL_CODE);
    expect(d.header.histogram).toEqual({ 1: [16, 10], 2: [3, 1], 3: [1, 1] });
    expect(d.header.bytes.length).toBe(6);
    expect(d.aceCards).toEqual([]);
    expect(d.cards).toHaveLength(32);
    expect(d.cards.map((c) => c.id)).toEqual([
      0x16, 0x02, 0x1c, 0x38, 0x40, 0x48, 0x68, 0x79, 0x7c, 0x90, 0x99, 0x9e, 0xe8, 0xe2, 0xa6, 0xb7,
      0x52, 0x4f, 0x7b, 0x60, 0x28, 0x27, 0x22, 0x25, 0x3a, 0x3e, 0x17, 0x92, 0x15, 0x95, 0x19, 0x60,
    ]);
    // page0: ×1 16種 → ×2 3種 → ×3 1種 / page1: ×1 10種 → ×2 1種 → ×3 1種
    expect(d.cards.slice(0, 20).every((c) => c.page === 0)).toBe(true);
    expect(d.cards.slice(20).every((c) => c.page === 1)).toBe(true);
    expect(d.cards[19]).toMatchObject({ page: 0, name: "ウッドフォーク" });
    expect(d.cards[31]).toMatchObject({ page: 1, trueId: 0x160, name: "アクアアコライト" });
    const names = new Set(d.cards.map((c) => c.name));
    for (const c of book) expect(names.has(c.name)).toBe(true);
  });
});

describe("実機ヘッダー回帰（既知10本 + 新規3本をバイト一致）", () => {
  // 出典: docs/book_code_format.md（S1/S8/S18..S24 等の実機採取ヘッダー）＋ 新規実機サンプル3本。
  const cases: Array<[Histogram, string]> = [
    [{ 4: [9, 1] }, "c0904010"],
    [{ 2: [19, 1] }, "9301"],
    [{ 1: [37, 3] }, "a0252003"],
    [{ 1: [5, 1], 2: [3, 0], 3: [4, 0], 4: [4, 0] }, "e305442001"], // S8
    [{ 1: [4, 0], 4: [8, 1] }, "e0048040 10".replace(/\s/g, "")], // S18/S19
    [{ 1: [7, 1], 4: [5, 3] }, "e007506001 30".replace(/\s/g, "")], // S20/S20A
    [{ 1: [8, 4], 4: [4, 3] }, "e008406004 30".replace(/\s/g, "")], // S21
    [{ 3: [2, 2], 4: [1, 6] }, "c0124062"], // S22
    [{ 1: [1, 0], 3: [1, 0], 4: [7, 2] }, "e0017140 20".replace(/\s/g, "")], // S23
    [{ 4: [7, 3] }, "c0704030"], // S24
    [{ 1: [1, 0], 3: [0, 1], 4: [9, 0] }, "e0019040 01".replace(/\s/g, "")], // NEWp1 実機サンプル
    [{ 1: [1, 0], 3: [13, 0] }, "60010d"], // NEWp0 実機サンプル（page1 なし・先頭 60）
    [{ 1: [16, 10], 2: [3, 1], 3: [1, 1] }, "e31001610a01"], // 2026-09-12 実機受理（page0 ×3のみでも page1 ありなら先頭 e3）
  ];

  for (const [hist, want] of cases) {
    it(`encodeHeader ${JSON.stringify(hist)} -> ${want}`, () => {
      expect(hexU8(encodeHeader(hist))).toBe(want);
    });
    it(`parseHeader <- ${want} 復元`, () => {
      const stream = new Uint8Array([
        ...want.match(/../g)!.map((h) => parseInt(h, 16)),
        0x00, 1, 2, 3, 4, 5,
      ]);
      const { histogram, length } = parseHeader(stream);
      expect(histogram).toEqual(hist);
      expect(length).toBe(want.length / 2);
    });
  }
});
