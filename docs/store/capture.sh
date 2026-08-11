#!/usr/bin/env bash
# 掲載画像の HTML を指定サイズちょうどで撮影して PNG 化する。
# ストア規定: スクリーンショット 1280x800 / 小プロモタイル 440x280。
#
# 使い方: ./capture.sh
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(cd "$(dirname "$0")" && pwd)"

# $1: HTML/PNG のベース名, $2: 幅, $3: 高さ, $4: 倍率（省略時 1）
shot() {
  local name="$1" w="$2" h="$3" scale="${4:-1}"
  "$CHROME" --headless --disable-gpu \
    --force-device-scale-factor="$scale" \
    --window-size="${w},${h}" \
    --screenshot="${DIR}/${name}.png" \
    --virtual-time-budget=4000 \
    --hide-scrollbars \
    "file://${DIR}/${name}.html" 2>/dev/null || true
  if [ -f "${DIR}/${name}.png" ]; then
    echo "  ${name}.png  $(file -b "${DIR}/${name}.png" | sed 's/PNG image data, //;s/,.*//')"
  else
    echo "  ${name}.png  撮影に失敗しました" >&2
    return 1
  fi
}

# 素材（shot-1 と LP に埋め込む注釈済み画面）。
# 埋め込み先で縮小されるので 2 倍で撮る。
echo "素材を撮影中..."
shot annotated-screen 1120 700 2

# 掲載画像本体。ストア規定サイズちょうどにするため倍率は 1。
echo "掲載画像を撮影中..."
for n in shot-1 shot-2 shot-3 shot-4 shot-5; do
  shot "$n" 1280 800
done
shot tile 440 280

# 番外（ストアは 5 枚までなので掲載していない）。LP や記事で使えるよう撮っておく。
shot _shot-2-fading 1280 800

# LP 側にも同じ素材を配る
cp "${DIR}/annotated-screen.png" "${DIR}/../../site/screen-annotated.png"
cp "${DIR}/shot-1.png" "${DIR}/../../site/og.png"
echo "site/ へ素材を配置しました"
echo "完了"
