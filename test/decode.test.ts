import { describe, expect, it } from "vitest";
import { bytesToCode, codeToBytes, decode, encodeHeader, parseHeader } from "../src/index.js";

describe("parseHeader round-trip", () => {
  // 実ヘッダー＋以前失敗した端ケース（薄い散らばり・×3のみ×4なし・全クラス両ページ）
  const cases: Array<Record<number, [number, number]>> = [
    { 4: [9, 1] }, { 2: [19, 1] }, { 1: [37, 3] },
    { 1: [6, 0], 2: [3, 0], 3: [4, 0], 4: [4, 0] },
    { 1: [1, 0], 2: [1, 0], 3: [1, 0], 4: [1, 0] },
    { 1: [1, 1], 2: [1, 0], 3: [1, 0] },
    { 1: [1, 1], 2: [1, 1], 3: [1, 1], 4: [1, 1] },
  ];
  it("エンコード→パースが往復する", () => {
    for (const hist of cases) {
      const enc = encodeHeader(hist as never);
      const withTail = new Uint8Array([...enc, 0, 1, 2, 3]);
      const { histogram, length } = parseHeader(withTail);
      expect(length).toBe(enc.length);
      expect(histogram).toEqual(hist);
    }
  });
});

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
    expect(book.aceCardByte).toBe(0);
    expect(book.cards).toHaveLength(10);
    expect(book.cards[0]?.name).toBe("ゴブリン");
    expect(book.cards.map((c) => c.id)).toEqual([
      0x07, 0x03, 0x19, 0x00, 0x0c, 0x16, 0x0e, 0x02, 0x0a, 0x4c,
    ]);
  });

  it("S17: Aカード2枚（ゴブリン=A1, ファイター=A2）", () => {
    const book = decode(
      "oCUg AwJH AQMF GhUP ER8g BBwn ?DU+ LR4S EAkT GQAM Fg4C CgsH Gw#G Fx#U AT@M TVM=",
    );
    expect(book.cards).toHaveLength(40);
    expect(book.aceCards).toEqual([
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

describe("ページ境界（0xff↔0x100）", () => {
  // BP1/BP2 は実機（Switch 2）で往復確認済みの40枚ブック
  it("BP1: 同一バイト0x00が page0=ジャイアントラット / page1=コラプション に割れる", () => {
    const book = decode(
      "oCcg AQAA AQ&D BAUG BwgJ CgsM DQ4P EBES ExQV FhcZ Ghsc HR4f &CEi &yQ@ JicA",
    );
    expect(book.cards).toHaveLength(40);
    const p0 = book.cards.find((c) => c.id === 0x00 && c.page === 0);
    const p1 = book.cards.find((c) => c.id === 0x00 && c.page === 1);
    expect(p0).toMatchObject({ trueId: 0x000, name: "ジャイアントラット" });
    expect(p1).toMatchObject({ trueId: 0x100, name: "コラプション" });
  });

  it("BP2: 境界を跨ぐ連続カード（0xfe,0xff | 0x100,0x101）が正しく振り分く", () => {
    const book = decode(
      "oCYg AgD+ /wEC AwQF Bgc& CQoL DA#? DxAR EhMU FRYX GRob HB#e HyAh &iMk JQAB",
    );
    expect(book.cards).toHaveLength(40);
    const name = (trueId: number) => book.cards.find((c) => c.trueId === trueId)?.name;
    expect(name(0x0fe)).toBe("グロースボディ"); // page0 末尾
    expect(name(0x0ff)).toBe("ゴブリンズレア"); // page0 最終
    expect(name(0x100)).toBe("コラプション"); // page1 先頭
    expect(name(0x101)).toBe("サイレンス"); // page1
  });
});

describe("Aカード参照（ページ内インデックス形式）", () => {
  // すべて実機（Switch 2）で単独/複数Aカードを付けてエクスポートした10種×4ブック。
  // ID列 = ウルフ,ゴブリン,キングトータス,ゼラチンウォール,ブラッドプリン,オーロラ(page0)
  //        | キングバラン,ファイアーシフト,ファインド,ドレインマジック(page1)
  it("page0のカード1枚（ゴブリン=ページ0の1番目）", () => {
    const book = decode("wGBA QEEA AwdL T1X4 U38i Gg==");
    expect(book.aceCards).toEqual([
      expect.objectContaining({ slot: 1, page: 0, pageIndex: 1, cardName: "ゴブリン" }),
    ]);
  });

  it("page1のカード1枚（ドレインマジック=ページ1の3番目）＝旧×4では表現不能だった", () => {
    const book = decode("wGBA QMUA AwdL T1X4 U38i Gg==");
    expect(book.aceCards).toEqual([
      expect.objectContaining({ slot: 1, page: 1, pageIndex: 3, cardName: "ドレインマジック" }),
    ]);
  });

  it("ページ跨ぎ3枚（A1=ゴブリンp0 / A2=ドレインマジックp1 / A3=キングバランp1）", () => {
    const book = decode("wGBA QFsw AAMH S#9V +FN/ &ho=");
    expect(book.aceCards).toEqual([
      expect.objectContaining({ slot: 1, page: 0, pageIndex: 1, cardName: "ゴブリン" }),
      expect.objectContaining({ slot: 2, page: 1, pageIndex: 3, cardName: "ドレインマジック" }),
      expect.objectContaining({ slot: 3, page: 1, pageIndex: 0, cardName: "キングバラン" }),
    ]);
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
