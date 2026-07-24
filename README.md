# culdcept-book-code

[culdcept.club](https://culdcept.club/) のブックコード（カルドセプト ビギンズのデッキ共有コード）を
デコード/エンコードする非公式TypeScriptライブラリ。

フォーマットは26個のサンプルブックの差分解析によるリバースエンジニアリングで解読した。
**本ライブラリのエンコーダで生成したコード（枚数混在・マーク付き含む）を実サイトが
正しく復元することを往復テストで確認済み**。
仕様の詳細と解析の経緯は元リポジトリのドキュメント参照
（`book_code_format.md` / `analysis_journal.md`）。

## フォーマット概要

```
記号置換Base64（ I→& O→? 0→# l→@ ）でエンコードされたバイト列:
[ヘッダー 2〜6B]  ページ別（真ID<256 / ≥256）× 枚数クラス別の種類数をビット詰め
[マーク数 1B][マークデータ 0〜2B]  A1〜A3スロットの6bit参照をLEビット列で格納
[カードID 1B × 種類数]  真IDの下位1バイト（衝突あり）
```

## 使い方

```ts
import { decode } from "culdcept-book-code";

const book = decode("wJBA EAAH AxkA DBY? AgpM");
console.log(book.header.histogram); // { 4: [9, 1] } … ×4枚が ページ0に9種+ページ1に1種
console.log(book.cards.map((c) => c.name));
// ["ゴブリン", "ウルフ", "ファイター", ...]
```

## API

- `decode(code)` — ブックコードを構造体（ヘッダー/マーク/カード列）に復元
- `encodeBook(cards, marks?)` — ブック定義（カード名＋枚数、マーク）からコードを生成。
  実サンプル群をバイト単位で再現できることをテストで確認済み
- `codeToBytes(code)` / `bytesToCode(bytes)` — 文字レイヤーの変換
- `parseHeader(bytes)` / `encodeHeader(histogram)` — ヘッダーのビット文法
- `KNOWN_IDS` / `CANDIDATE_IDS` / `COLLISION_BYTES` / `CARD_DB` — カードID表

```ts
import { encodeBook } from "culdcept-book-code";

const code = encodeBook(
  ["ゴブリン", "ウルフ", "ファイター", "ジャイアントラット", "スタチュー",
   "バルダンダース", "ゾンビ", "アンバーモス", "ジャイアントスパイダー", "シーフ"]
    .map((name) => ({ name, count: 4 })),
);
// => "wJBA EAAH AxkA DBY? AgpM"（実サンプルと同一バイト列）
```

## 状態と既知の制限

- 構造（文字・ヘッダー・マーク・ID方式）は解読済み。既知の全サンプルをデコード可能
- エンコーダは正準形（枚数クラス昇順→ページ0→ページ1、各カタログ順）で出力する。
  サイト側は編集履歴依存の並びを持つため、同一ブックでも文字列は一致しないことがある
  （実サンプル中、正準形で作られた6件はバイト単位一致を確認）
- カードID表は部分的（確定45/398枚）。未知IDは `"?"`、名前未確定カードはエンコード不可
- 1バイトIDは衝突するため、`collision: true` のカードは別カードの可能性がある
- マークは「ID列上の位置が4の倍数」のカードにのみ付与可能（既知の参照形式の制約）
- 枚数の割当（どのカードが何枚か）の復元は未実装（ヘッダーのグループ情報から可能）

## 開発

```sh
npm install
npm test        # vitest
npm run build   # tsc → dist/
```

## ライセンス / 免責

MIT。本ライブラリは非公式であり、culdcept.club およびカルドセプト権利者とは無関係です。
