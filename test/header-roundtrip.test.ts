import { describe, expect, it } from "vitest";
import { CARD_DB, decode, encodeBook, encodeHeader, parseHeader } from "../src/index.js";
import type { Histogram } from "../src/index.js";

/** encodeHeader→parseHeader が入力ヒストグラムへ完全復元するか（末尾にダミーのID列を付けて検証）。 */
function headerRoundTrips(hist: Histogram): boolean {
  const enc = encodeHeader(hist);
  const tail = [0x00];
  for (let i = 0; i < 40; i++) tail.push(i & 0xff);
  const stream = new Uint8Array([...enc, ...tail]);
  try {
    const { histogram, length } = parseHeader(stream);
    return length === enc.length && JSON.stringify(histogram) === JSON.stringify(hist);
  } catch {
    return false;
  }
}

function mkHist(n1: [number, number], n2: [number, number], n3: [number, number], n4: [number, number]): Histogram {
  const h: Histogram = {};
  if (n1[0] + n1[1] > 0) h[1] = n1;
  if (n2[0] + n2[1] > 0) h[2] = n2;
  if (n3[0] + n3[1] > 0) h[3] = n3;
  if (n4[0] + n4[1] > 0) h[4] = n4;
  return h;
}

describe("ヘッダー往復（回帰: page1のみ構成）", () => {
  // いずれも「ある枚数クラスが page1 にしか存在しない（page0=0）」構成。
  // かつて ×3 の page1のみ（例: {1:[24,7],2:[3,0],3:[0,1]}）は ×1 の page1 分まで巻き込んで
  // 壊れていた。ここでは各クラスの page1のみを明示的に押さえる。
  const cases: Array<[string, Histogram]> = [
    ["課題の再現ケース {1:[24,7],2:[3,0],3:[0,1]}", mkHist([24, 7], [3, 0], [0, 1], [0, 0])],
    ["×3 page1のみ（最小）", mkHist([0, 0], [0, 0], [0, 1], [0, 0])],
    ["×3 page1のみ + ×4 page0", mkHist([0, 0], [0, 0], [0, 2], [5, 0])],
    ["×2 page1のみ", mkHist([0, 0], [0, 3], [0, 0], [0, 0])],
    ["×4 page1のみ", mkHist([0, 0], [0, 0], [0, 0], [0, 3])],
    ["×1 page1のみ", mkHist([0, 5], [0, 0], [0, 0], [0, 0])],
    ["全クラス page1のみ", mkHist([0, 4], [0, 3], [0, 2], [0, 4])],
    ["×3 が両ページ", mkHist([0, 0], [0, 0], [2, 2], [1, 6])],
  ];
  for (const [label, hist] of cases) {
    it(label, () => {
      expect(headerRoundTrips(hist)).toBe(true);
    });
  }

  it("課題の再現ケースは ×1 page1=7 と ×3=[0,1] を保持する（巻き込み消失しない）", () => {
    const hist = mkHist([24, 7], [3, 0], [0, 1], [0, 0]);
    const enc = encodeHeader(hist);
    const stream = new Uint8Array([...enc, 0x00, 1, 2, 3]);
    const { histogram } = parseHeader(stream);
    expect(histogram).toEqual(hist);
  });
});

describe("ヘッダー往復（網羅: 妥当な全40枚ブック）", () => {
  // 1*(n1p0+n1p1) + 2*(n2p0+n2p1) + 3*(n3p0+n3p1) + 4*(n4p0+n4p1) = 40 を満たす
  // すべての (page0/page1 × 枚数クラス) 分布を列挙し、encode→parse が完全一致するか検証する。
  // 40枚デッキでは各クラス合計がフィールド幅に収まるため、分割を総当たりするだけでよい。
  it("すべての妥当な40枚ヒストグラムが往復する", () => {
    let tested = 0;
    const failures: string[] = [];
    for (let d = 0; d <= 10; d++) {
      for (let c = 0; 4 * d + 3 * c <= 40; c++) {
        for (let b = 0; 4 * d + 3 * c + 2 * b <= 40; b++) {
          const a = 40 - 4 * d - 3 * c - 2 * b;
          if (a < 0) continue;
          for (let a0 = 0; a0 <= a; a0++) {
            for (let b0 = 0; b0 <= b; b0++) {
              for (let c0 = 0; c0 <= c; c0++) {
                for (let d0 = 0; d0 <= d; d0++) {
                  const hist = mkHist([a0, a - a0], [b0, b - b0], [c0, c - c0], [d0, d - d0]);
                  tested++;
                  if (!headerRoundTrips(hist)) {
                    if (failures.length < 20) failures.push(JSON.stringify(hist));
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(tested).toBeGreaterThan(250000);
    expect(failures).toEqual([]);
  });
});

describe("ブック往復（実カード・×3がpage1のみ）", () => {
  it("×3 が page1 のカードだけのデッキが encodeBook→decode で完全一致する", () => {
    const p1 = [...CARD_DB].filter(([, i]) => i.page1).slice(0, 4).map(([n]) => n);
    const p0 = [...CARD_DB].filter(([, i]) => !i.page1).slice(0, 28).map(([n]) => n);
    const deck = [
      ...p0.map((name) => ({ name, count: 1 })),
      ...p1.map((name) => ({ name, count: 3 })),
    ];
    expect(deck.reduce((s, c) => s + c.count, 0)).toBe(40);

    const code = encodeBook(deck);
    const book = decode(code);

    expect(book.header.histogram).toEqual({ 1: [28, 0], 3: [0, 4] });
    expect(book.cards).toHaveLength(32);
    // ×3クラスは全て page1 のカードで、名前が一致する
    expect(book.cards.filter((c) => c.page === 1).map((c) => c.name)).toEqual(p1);

    // 既定順へ揃える往復（登録順吸収）でも同一コードへ収束する
    const toBookCards = (bk: typeof book) => {
      const out: { name: string; count: number }[] = [];
      let i = 0;
      for (const page of [0, 1] as const) {
        for (const count of [1, 2, 3, 4] as const) {
          const n = bk.header.histogram[count]?.[page] ?? 0;
          for (let k = 0; k < n; k++) out.push({ name: bk.cards[i++]!.name, count });
        }
      }
      return out;
    };
    expect(encodeBook(toBookCards(book))).toBe(code);
  });
});
