# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

inkover は Chrome MV3 拡張。Web 会議の画面共有中に、表示中のページへ直接描き込む。描いた線は既定で数秒後に消える（消えるインク）。[WXT](https://wxt.dev/) + vanilla TypeScript、描画は素の Canvas 2D。コメント・ドキュメント・コミットメッセージ（Conventional Commits）は日本語。

姉妹プロダクトの shotcraft（スクリーンショット編集）とは目的が違う。shotcraft は「撮った静止画をじっくり編集する」、inkover は「生きたページへリアルタイムに描く」。この違いがデータモデルの設計に効いている。

## コマンド

```bash
pnpm install       # 依存インストール（postinstall で wxt prepare が走る）
pnpm dev           # 専用プロファイルの Chrome を起動、ホットリロード
pnpm compile       # tsc --noEmit
pnpm test          # Vitest 全実行
pnpm test tests/shapes.test.ts   # 単一ファイル
pnpm build         # .output/chrome-mv3/
pnpm zip           # ストア提出用 zip
```

## アーキテクチャ

### 注入フロー

- アイコンクリック → `background.ts` が `scripting.executeScript` で `overlay.content.ts` を注入する。静的な `content_scripts` 登録はしない。これは `host_permissions` を要求しないための設計。
- 2 回目の注入は終了として扱う（`window.__inkoverOverlay` センチネルに dispose 関数を入れておき、既にあれば呼ぶ）。
- `chrome://` 系・Web ストア・PDF ビューアは注入できない。`isRestrictedUrl()` で先に弾き、バッジで知らせる。アラートは全ブラウザ操作をブロックするので使わない。

### 描画

- 図形は `Shape` 判別可能ユニオン（`lib/shapes.ts`）。`pen` / `arrow` / `line` / `rect` / `ellipse` / `text` / `spotlight` / `step`。
- 描画は `lib/draw.ts` の `drawShape()` に集約。ドラッグ中のプレビューも確定後も同じ関数を通すので見た目がずれない。
- **`pointermove` では描画しない**。点を積んで `requestAnimationFrame` に任せ、1 フレーム 1 回だけ描く。高頻度発火で描画が詰まるのを避けるため。
- `getCoalescedEvents()` でブラウザが間引いた座標も回収する。速く描いたときのカクつき対策。
- rAF ループは `hasAnimating()` が false になったら止める。アイドル時に CPU を使わない。

### 座標系（重要）

競合拡張のレビューで最多の不満が「ズームすると線がズレる」。原因は CSS px とデバイス px の取り違え。

- canvas のバッファは DPR 倍にする（`canvasSizeFor()`）
- 同時に `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` で描画座標系を CSS px に戻す
- **この 2 つは必ずセット**。片方だけだと表示がぼやけるか、座標が DPR 倍ずれる
- キャプチャ画像との合成では DPR ではなく実画像サイズ ÷ ビューポートで軸別に求める（`captureScale()`）。ブラウザズーム時に DPR と一致しないため

### 純粋計算とテスト

`lib/shapes.ts` `lib/tools.ts` `lib/geometry.ts` は DOM に依存しないのでユニットテストの対象。新しい計算ロジックはここへ書き、`tests/` にテストを足す。Canvas/DOM 依存は `lib/draw.ts` と `entrypoints/` に置く。

## 設計上の不変条件（プライバシー）

README で公約している。変更にはユーザーの明示的な判断が必要:

- 権限は `activeTab` / `scripting` / `storage` の 3 つのみ。`host_permissions` は要求しない
- 実行時の外部リクエストなし（テキスト注釈フォントも WOFF2 を同梱）
- 描いた内容はメモリ上のみ。ディスクにも外部にも書かない（設定値だけ `storage.local`）

`web_accessible_resources` の `matches` だけは `<all_urls>` を指定している。これは
同梱フォントを content script（ページ側の文脈）から読むために必要で、権限要求では
ない。公開対象はフォントファイルのみに限定すること。

## shotcraft との統一（勝手に変えない）

両拡張を並べて使ったときに違和感が出ないよう、以下を一致させている。
`tests/theme.test.ts` と `tests/tools.test.ts` が値を固定しているので、変えるなら
テストも直す＝意図的な変更であることを明示する。

- カラーパレット 7 色（コーラル / アンバー / エメラルド / スカイ / バイオレット / 黒 / 白）
- UI トークン（shotcraft の midnight テーマ）
- テキスト注釈フォント Mochiy Pop One
- ツールのショートカット（A=矢印, L=直線, R=矩形, E=楕円, O=スポットライト, T=テキスト, P=ペン, S=ステップ）

`E` と `S` をツールに使うため、全消去は `Delete` / `Backspace` に割り当てている
（shotcraft は単キーを別用途に使っていないが、inkover はページ上で動くので
単キーの取り合いが厳しい）。

## 過去に踏んだ罠（v0.1.0 が全く動かなかった原因）

どちらも「実機で一度も動かさずに公開した」ことで表面化した。**ストア提出前には
必ず `.output/chrome-mv3` を読み込んで実際に描けることを確認する。**

### 1. `activeTab` では `tab.url` が読めない

```js
if (!url) return true;   // ← これで全ページが「制限ページ」扱いになった
```

`action.onClicked` が渡す `tab.url` は、`tabs` 権限も `host_permissions` も無い
場合 `undefined` になる。`activeTab` は「クリック後にそのタブを触れる」権限で
あって「クリック前に URL を読める」権限ではない。

URL が読めないことを理由に弾いてはいけない。判定は `lib/restricted-url.ts` に
切り出してテスト済み。実際に注入できないページは `executeScript` が例外を
投げるので、そちらで捕捉する。

### 2. `setPointerCapture()` は例外を投げる

存在しない pointerId に対して `NotFoundError` を投げる。`onPointerDown` の
途中で投げられると `draft` が作られず、以降の `pointermove` が全て無視される
（＝線が一切描けない）。必ず try/catch で囲む。捕捉に失敗しても描画自体は
できるので、握りつぶしてよい。

## 注意

- ショートカットは修飾キーなしの単キーを使う。ページ側と衝突しうるので、テキスト入力中と `metaKey`/`ctrlKey`/`altKey` 押下時は必ず無視する。
- ツールのキーバインドは `e`（全消去）/ `h`（モード切替）/ `f`（フェード切替）と衝突させない。`tests/tools.test.ts` で検証している。
- バージョン更新時は `package.json` と README を両方更新する。
