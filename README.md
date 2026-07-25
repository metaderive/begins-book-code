# culdcept-book-code

『カルドセプト ビギンズ』のブック（デッキ）共有コードをデコード／エンコードする
非公式 TypeScript ライブラリ。

- 依存パッケージなし（実行時ランタイム依存ゼロ）
- ESM / TypeScript 型定義同梱
- ブラウザ・Node.js の両方で動作（標準の `atob`/`btoa` 相当を使わず自前実装）

協力: culdcept.club ／ 解読の経緯は [docs/DECODING.md](docs/DECODING.md)

> ⚠️ **無保証・自己責任でご利用ください。** 本ライブラリは公式仕様のない**非公式のリバースエンジニアリング**
> であり、フォーマットには未解明の部分が残っています。生成コードが実機で読めることを一部のケースで確認しては
> いますが、**全カード・全パターンを検証したわけではありません**。想定外の入力や仕様の穴により、
> **ブックデータが壊れる等の不具合が起きても、作者は一切の責任を負いません**。
> また『カルドセプト』の権利者・開発元とは無関係で、フォーマットは将来のアップデートで無効になる可能性があります。

## 動作を確認した環境

往復（本ライブラリ生成コード → 実機で読み込み → ブック復元）が通ることを、以下の環境の
**一部のケースで**確認しています（網羅的な検証ではありません）。

| 項目 | 値 |
|---|---|
| 対応ゲーム | カルドセプト ビギンズ（日本語版） |
| ゲームバージョン | Ver 1.0.3 |
| 動作ハード | Nintendo Switch 2（日本版） |


## インストール

```sh
npm install culdcept-book-code
# または
pnpm add culdcept-book-code
yarn add culdcept-book-code
```

Node.js 18 以降を推奨（ESM・`BigInt` を使用）。

## クイックスタート

### デコード（コード → ブック内容）

```ts
import { decode } from "culdcept-book-code";

const book = decode("wJBA EAAH AxkA DBY? AgpM");

book.header.histogram;        // { 4: [9, 1] } … ×4枚がページ0に9種＋ページ1に1種
book.aceCardByte;                // 0（Aカードなし）
book.cards.map((c) => c.name);
// ["ゴブリン", "ウルフ", "ファイター", "ジャイアントラット", "スタチュー",
//  "バルダンダース", "ゾンビ", "アンバーモス", "シーフ", "ジャイアントスパイダー"]
```

### エンコード（ブック内容 → コード）

```ts
import { encodeBook } from "culdcept-book-code";

const code = encodeBook(
  ["ゴブリン", "ウルフ", "ファイター", "ジャイアントラット", "スタチュー",
   "バルダンダース", "ゾンビ", "アンバーモス", "ジャイアントスパイダー", "シーフ"]
    .map((name) => ({ name, count: 4 })),
);
// => "wJBA EAAH AxkA DBY? AgpM"（実サンプルと同一バイト列）
```

### A（エース）カード付きのエンコード

```ts
const code = encodeBook(
  [
    ...["ゴブリン", "ウルフ", "ファイター", "ボージェス"].map((name) => ({ name, count: 3 })),
    ...["ジャイアントラット", "スタチュー", "バルダンダース", "ゾンビ",
        "アンバーモス", "シーフ", "ジャイアントスパイダー"].map((name) => ({ name, count: 4 })),
  ],
  ["ゴブリン", "ジャイアントラット"], // A1, A2 の順で指定
);
```

## API

### `decode(code: string): DecodedBook`
ブックコード（空白は無視）を構造体に復元する。

```ts
interface DecodedBook {
  header: { bytes: Uint8Array; histogram: Histogram };
  aceCardByte: number;      // Aカード数（下位7bit）
  aceCards: AceCard[];         // Aカードのスロット・対象
  cards: CardEntry[];    // ID列（コード内の並び順のまま）
}

interface CardEntry {
  id: number;            // コード上の1バイトID（真IDの下位バイト）
  trueId: number;        // 真ID（ページ1なら id + 0x100）
  page: 0 | 1;           // 0: 真ID<256, 1: 真ID>=256
  name: string;          // カード名。未確定は候補列挙、不明は "?"
}

interface AceCard {
  slot: number;          // A1〜A3（1始まり）
  position: number;      // ID列上の位置（参照値×4）
  cardId?: number;
  cardName?: string;
}

// Histogram: 枚数クラス(1〜4) → [ページ0種類数, ページ1種類数]
type Histogram = Partial<Record<1 | 2 | 3 | 4, readonly [number, number]>>;
```

### `encodeBook(cards, aceCards?): string`
ブック定義からコードを生成する。

- `cards: { name: string; count: number }[]` — 合計 40 枚・各カード 1〜4 枚
- `aceCards?: string[]` — Aカード対象のカード名（A1, A2, A3 の順・最大 3）
- 並びは正準形（枚数クラス昇順 → 各クラス内はページ0→ページ1、各カタログ順）で出力

### 低レベル API
| 関数 | 用途 |
|---|---|
| `codeToBytes(code)` / `bytesToCode(bytes)` | 記号置換 Base64 の変換 |
| `parseHeader(bytes)` / `encodeHeader(histogram)` | ヘッダーのビット文法 |
| `cardName(id, page1)` | ID → カード名の解決 |

### データ
`KNOWN_IDS`（ページ0）, `PAGE1_IDS`（ページ1）, `CANDIDATE_IDS`, `PAGE1_CANDIDATE_IDS`,
`CARD_DB`（エンコード用: 名前 → { id, sortNo, page1 }）。

## フォーマット概要

記号置換 Base64（`I→& O→? 0→# l→@`）でエンコードされたバイト列：

```
[ヘッダー 2〜6B]      ページ別（真ID<256 / ≥256）× 枚数クラス別の種類数をビット詰め
[Aカード数 1B]         Aカードの個数
[Aカードデータ 0〜2B]   A1〜A3 スロットの6bit参照をリトルエンディアンのビット列で格納
[カードID 1B × 種類数] 真IDの下位1バイト。ID列は[ページ0][ページ1]の2部構成
```

- **真ID** = バイト値 + 0x100 ×（ID列のページ1部にいるか）。ページ境界はヘッダーが与える
- カード総数は約 400 種 > 256 のため 1 バイトでは足りず、同じバイト値が別カードを指す**衝突**がある
- **バイナリ仕様の詳細（ビット文法・実例つき）は [SPEC.md](SPEC.md) を参照**
- **解読の経緯・手法・Hearthstone 方式との比較は [docs/DECODING.md](docs/DECODING.md) を参照**

## 既知の制限

- カード ID 表は全 398 種を確定（page0 254・page1 144）。未使用の ID 枠（歯抜け）に当たった場合のみ `"?"` を返す
- エンコーダは正準形（カタログ順）で出力するため、実機が出力する編集履歴依存の並びとは
  文字列が一致しないことがある（デッキ内容としては等価。`encode(decode(code))` で同一の正準コードに収束する）
- 同一ページ内ではバイト値とカードは 1 対 1（真 ID = ページ + バイト値が一意）
- A（エース）カードの参照形式は未完成。実機ではどのカードも A カードに指定できるが、
  本ライブラリが再現できるのは観測済みの `参照値 × 4 = 位置` に当てはまるケースのみ
  （`SPEC.md` §4 参照）。当てはまらない指定はエンコード時に安全側でエラーにしている
- 対応はビギンズ・Ver 1.0.3 の範囲。ゲームのアップデートで無効になる可能性あり

## 開発

```sh
npm install
npm test        # vitest（デコード・エンコードの往復テスト）
npm run build   # tsc → dist/
```

## ライセンス / 免責

MIT License（`LICENSE` 参照）。

本ライブラリは非公式のリバースエンジニアリング成果物であり、権利者とは関係のない
ファン制作物です。利用は自己責任で行ってください。

- 『カルドセプト』の著作権・商標は **大宮ソフト** に帰属します
- 『カルドセプト ビギンズ』（2026-07-16 / Switch 2・Switch）は **開発: グランディング／監修: 大宮ソフト／発売: ネオス株式会社**

ゲーム名・カード名などの固有名詞は各権利者に帰属します。
