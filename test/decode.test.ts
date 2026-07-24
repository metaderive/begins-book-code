import { describe, expect, it } from "vitest";
import { bytesToCode, codeToBytes, decode, encodeHeader } from "../src/index.js";

describe("alphabet", () => {
  it("コード⇄バイトの往復が一致する", () => {
    const code = "wJBA EAAH AxkA DBY? AgpM";
    const bytes = codeToBytes(code);
    expect(bytesToCode(bytes)).toBe(code);
  });
});

describe("decode", () => {
  it("S1: 無属性10種×4枚ブック", () => {
    const book = decode("wJBA EAAH AxkA DBY? AgpM");
    expect(book.header.histogram).toEqual({ 4: [9, 1] });
    expect(book.markByte).toBe(0);
    expect(book.cards).toHaveLength(10);
    expect(book.cards[0]?.name).toBe("ゴブリン");
    expect(book.cards.map((c) => c.id)).toEqual([
      0x07, 0x03, 0x19, 0x00, 0x0c, 0x16, 0x0e, 0x02, 0x0a, 0x4c,
    ]);
  });

  it("S17: マーク2個（ゴブリン=A1, ファイター=A2）", () => {
    const book = decode(
      "oCUg AwJH AQMF GhUP ER8g BBwn ?DU+ LR4S EAkT GQAM Fg4C CgsH Gw#G Fx#U AT@M TVM=",
    );
    expect(book.cards).toHaveLength(40);
    expect(book.marks).toEqual([
      expect.objectContaining({ slot: 1, position: 28, cardName: "ゴブリン" }),
      expect.objectContaining({ slot: 2, position: 20, cardName: "ファイター" }),
    ]);
  });

  it("S23: 同一バイト0x1aが2回出現し、ページで別カードに解決される", () => {
    const book = decode("4AFx QCAA Gg&H AxkA DBY? Gj#=");
    expect(book.header.histogram).toEqual({ 1: [1, 0], 3: [1, 0], 4: [7, 2] });
    const dup = book.cards.filter((c) => c.id === 0x1a);
    expect(dup.map((c) => c.name)).toEqual(["ボージェス", "ドレインマジック"]);
    expect(dup.map((c) => c.trueId)).toEqual([0x01a, 0x11a]);
  });
});

describe("encodeHeader", () => {
  it("既知ヘッダーを再現する", () => {
    const cases: Array<[Record<number, [number, number]>, string]> = [
      [{ 4: [9, 1] }, "c0904010"],
      [{ 2: [19, 1] }, "9301"],
      [{ 1: [37, 3] }, "a0252003"],
      [{ 1: [5, 1], 2: [3, 0], 3: [4, 0], 4: [4, 0] }, "e305442001"],
      [{ 3: [2, 2], 4: [1, 6] }, "c0124062"],
    ];
    for (const [hist, hex] of cases) {
      const got = [...encodeHeader(hist)].map((b) => b.toString(16).padStart(2, "0")).join("");
      expect(got).toBe(hex);
    }
  });
});
