# inkover

[![version](https://img.shields.io/badge/version-0.1.0-fb7185)](https://github.com/joe41203/inkover/releases)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

画面共有中のページに、そのまま描き込めるペン。

> Chrome ウェブストアで審査中です。承認され次第、インストールリンクを掲載します。

Web 会議で自分が画面共有しているとき、「ここです」を口頭ではなく線で示すための Chrome 拡張です。描いた線は数秒で自動的に消えるので、消す操作すら要りません。

- 権限は `activeTab` / `scripting` / `storage` の 3 つだけ
- 実行時の外部リクエストなし。描いた内容はどこにも送信しない
- ペン・矢印・直線・矩形・楕円・スポットライト・テキスト・ステップの 8 ツール
- 色・フォント・ショートカットは姉妹プロダクト [shotcraft](https://github.com/joe41203/shotcraft) と統一

## 使い方

拡張アイコンをクリック（または `Alt+Shift+D`）すると描画モードに入ります。もう一度押すか `Esc` で終了します。

### ショートカット

ツールのキーは shotcraft と同じ割り当てにしています。

| キー | 動作 |
|---|---|
| `P` | ペン |
| `A` | 矢印 |
| `L` | 直線 |
| `R` | 矩形 |
| `E` | 楕円 |
| `O` | スポットライト（周囲を暗くする） |
| `T` | テキスト |
| `S` | ステップ（連番バッジ） |
| `1`〜`7` | 色を切り替え |
| `Shift` + ドラッグ | 直線・矢印は 45 度刻み、矩形・楕円は正方形／正円 |
| `Cmd/Ctrl+Z` | 直前の描画を取り消し |
| `Delete` / `Backspace` | 全消去 |
| `F` | 消えるインクの ON/OFF |
| `H` | ページ操作モードへ切り替え（クリックがページに届く） |
| `Esc` | 終了 |

### テキスト入力

`T` を押してからクリックすると入力できます。`Enter` で確定、`Shift+Enter` で改行、`Esc` で取り消しです。

## 画面共有で相手に見えるか

**見えます。** `getDisplayMedia()` は選択領域のレンダリング結果をピクセルとしてキャプチャするため、拡張が挿入した canvas とページの内容は区別されません。タブ共有・ウィンドウ共有・画面全体共有のいずれでも映ります。

**描けない場所もあります。** ブラウザの外（PowerPoint、デスクトップアプリなど）には描けません。これはブラウザ拡張の原理的な制約で、実装で回避できるものではありません。ブラウザ外にも描きたい場合は Epic Pen（Windows）や Presentify（macOS）のようなデスクトップアプリが必要です。

## 動かない場所

Chrome の仕様により、以下のページには注入できません。アイコンに `✕` が出ます。

- `chrome://` で始まるページ（設定・拡張機能の管理など）
- Chrome ウェブストア
- Chrome 内蔵の PDF ビューア
- 他の拡張機能のページ

## 開発

```bash
pnpm install     # 依存インストール（postinstall で wxt prepare が走る）
pnpm dev         # 専用プロファイルの Chrome を起動、ホットリロード付き
pnpm compile     # tsc --noEmit
pnpm test        # Vitest
pnpm build       # .output/chrome-mv3/ にビルド
pnpm zip         # ストア提出用 zip
```

`pnpm dev` は普段使いの Chrome とは別のプロファイルで起動するので、開いているタブやログイン状態には影響しません。

手動で読み込む場合は `pnpm build` のあと、`chrome://extensions` で「パッケージ化されていない拡張機能を読み込む」から `.output/chrome-mv3/` を選びます。

### 構成

```
entrypoints/
  background.ts        アイコンクリックで content script を動的注入する
  overlay.content.ts   Shadow DOM + canvas。UI とポインタ操作
lib/
  shapes.ts            図形のデータモデルとフェード計算（テスト対象）
  draw.ts              Shape を Canvas 2D へ描く
  tools.ts             ツール定義・キーバインド・Shift 制約（テスト対象）
  geometry.ts          DPR と座標変換（テスト対象）
  theme.ts             色・太さ・デザイントークン
  messages.ts          service worker との通信契約
```

描画は素の Canvas 2D API で行い、手描き線の輪郭生成にのみ [perfect-freehand](https://github.com/steveruizok/perfect-freehand) を使っています。ランタイム依存はこれ 1 つです。

### リリース

```bash
pnpm compile && pnpm test && pnpm build && pnpm zip
```

`.output/inkover-<version>-chrome.zip` ができます。バージョンを上げるときは `package.json` を更新してください。

掲載画像は HTML から生成しています。文言やレイアウトを変えたら撮り直してください。

```bash
./docs/store/capture.sh
```

`docs/store/index.html` をブラウザで開くと、生成前のレイアウトを一覧で確認できます。ストアの入力欄に貼る文言は `docs/store/listing.md` にまとめてあります。

### 設計上の不変条件

変更にはユーザーの明示的な判断が必要です。

- 権限は `activeTab` / `scripting` / `storage` の 3 つのみ。`host_permissions` は要求しない
- 実行時の外部リクエストなし（テキスト注釈フォントも同梱の WOFF2 を参照）
- 描いた内容はメモリ上にのみ存在し、ディスクにも外部にも書かない（設定値だけ `storage.local`）

content script を静的登録せず `scripting.executeScript` で動的注入しているのは、`host_permissions` を不要にするためです。

`web_accessible_resources` には `<all_urls>` を指定していますが、これは権限要求ではなく、同梱フォントを content script から読むために必要な公開設定です。対象はフォントファイルのみに限定しています。

## クレジット

テキスト注釈のフォントに [Mochiy Pop One](https://fonts.google.com/specimen/Mochiy+Pop+One)（SIL Open Font License 1.1）を同梱しています。ライセンス全文は `public/fonts/mochiy-pop-one/OFL.txt` を参照してください。

## ライセンス

MIT
