# culdcept-book-code

『カルドセプト ビギンズ』のブック（デッキ）共有コードをデコード／エンコードする
非公式 TypeScript ライブラリ。フォーマットは 26 個のサンプルブックの差分解析で
リバースエンジニアリングして実装した。

**本ライブラリのエンコーダで生成したコード（枚数混在・マーク付きを含む）を実機が正しく
復元することを往復テストで確認済み**（検証環境は下記）。

協力: culdcept.club

- 依存パッケージなし（実行時ランタイム依存ゼロ）
- ESM / TypeScript 型定義同梱
- ブラウザ・Node.js の両方で動作（標準の `atob`/`btoa` 相当を使わず自前実装）

> ⚠️ 非公式のファン制作物です。『カルドセプト』の権利者・開発元とは一切関係ありません。
> フォーマットは将来の変更で無効になる可能性があります。

## 検証環境

往復テスト（本ライブラリ生成コード → 実機で読み込み → ブック復元）を以下で確認：

| 項目 | 値 |
|---|---|
| 対応ゲーム | カルドセプト ビギンズ（日本語版） |
| ゲームバージョン | Ver 1.0.3 |
| 動作ハード | Nintendo Switch 2（日本版） |
| 対象カードプール | ビギンズ（シリーズ識別子はコード外） |

他シリーズ（セカンド、サーガ等）や他バージョンのカードプールには未対応。
シリーズはコードに含まれず URL パラメータ側で決まるため、ビギンズ専用の ID 表を同梱している。

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
book.markByte;                // 0（マークなし）
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

### マーク（A カード）付きのエンコード

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
  markByte: number;      // マーク数（下位7bit）
  marks: Mark[];         // A カードのスロット・対象
  cards: CardEntry[];    // ID列（コード内の並び順のまま）
}

interface CardEntry {
  id: number;            // コード上の1バイトID（真IDの下位バイト）
  trueId: number;        // 真ID（ページ1なら id + 0x100）
  page: 0 | 1;           // 0: 真ID<256, 1: 真ID>=256
  name: string;          // カード名。未確定は候補列挙、不明は "?"
}

interface Mark {
  slot: number;          // A1〜A3（1始まり）
  position: number;      // ID列上の位置（参照値×4）
  cardId?: number;
  cardName?: string;
}

// Histogram: 枚数クラス(1〜4) → [ページ0種類数, ページ1種類数]
type Histogram = Partial<Record<1 | 2 | 3 | 4, readonly [number, number]>>;
```

### `encodeBook(cards, marks?): string`
ブック定義からコードを生成する。

- `cards: { name: string; count: number }[]` — 合計 40 枚・各カード 1〜4 枚
- `marks?: string[]` — マーク対象のカード名（A1, A2, A3 の順・最大 3）
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
[マーク数 1B]         A カードの個数
[マークデータ 0〜2B]   A1〜A3 スロットの6bit参照をリトルエンディアンのビット列で格納
[カードID 1B × 種類数] 真IDの下位1バイト。ID列は[ページ0][ページ1]の2部構成
```

- **真ID** = バイト値 + 0x100 ×（ID列のページ1部にいるか）。ページ境界はヘッダーが与える
- カード総数は約 400 種 > 256 のため 1 バイトでは足りず、同じバイト値が別カードを指す**衝突**がある
- **バイナリ仕様の詳細（ビット文法・実例つき）は [SPEC.md](SPEC.md) を参照**
- **解読の経緯・手法・Hearthstone 方式との比較は [docs/DECODING.md](docs/DECODING.md) を参照**

## 既知の制限

- カード ID 表は部分的（確定 43 種 / 約 400 種）。未知 ID は `"?"`、名前未確定カードはエンコード不可
- エンコーダは正準形で出力するため、サイト側の編集履歴依存の並びとは文字列が一致しない
  ことがある（デッキ内容としては等価。実機の往復テストで復元を確認済み）
- 同一ページ内ではバイト値とカードは 1 対 1 に対応する（真 ID = ページ + バイト値が一意なため、
  ページ判定できれば曖昧さはない）。デコード結果に「A or B」の候補表示が残るのは、
  ID 表の未確定部分（収穫実験で集合までしか絞れていない値）によるもので、形式上の制約ではない
- サイト上ではどのカードにもマークを付けられるが、既知の参照形式（6bit 参照値 × 4 = 位置）で
  表現できるのは「ID 列上の位置が 4 の倍数」のカードのマークのみ。非整列位置のマークを含む
  コードは実在する（旧世代サンプル）が形式が未解読のため、本ライブラリでは扱えない
  （エンコード時はエラーになる）
- 対応はビギンズ・Ver 1.0.3 の範囲。サイト仕様変更で無効になる可能性あり

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
- 『カルドセプト ビギンズ』の発売元は **ネオス株式会社** です（大宮ソフト全面監修）

ゲーム名・カード名などの固有名詞は各権利者に帰属します。
