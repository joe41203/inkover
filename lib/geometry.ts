/**
 * 座標とスケールの計算。
 *
 * 競合拡張のレビューで最も多い不満が「ズームすると線がズレる」「スタイラスでズレる」。
 * 原因は CSS px とデバイス px を取り違えること。ここを純粋関数に切り出して
 * テストで固めておく。
 */

export type CanvasSize = {
	/** canvas 要素の属性値（デバイス px）。描画バッファの実サイズ。 */
	bufferWidth: number;
	bufferHeight: number;
	/** CSS 上の表示サイズ（CSS px）。 */
	cssWidth: number;
	cssHeight: number;
};

/**
 * ビューポートと devicePixelRatio から canvas のサイズを決める。
 *
 * バッファを DPR 倍にしないと Retina で線がぼやける。逆に ctx.scale を忘れると
 * 座標が 2 倍にズレる。両方を必ずセットで扱うためにここで一括計算する。
 */
export function canvasSizeFor(
	viewportWidth: number,
	viewportHeight: number,
	dpr: number,
): CanvasSize {
	// DPR は 0 や NaN が来ると描画が壊れる。1 未満は 1 に丸める。
	const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
	return {
		bufferWidth: Math.round(viewportWidth * ratio),
		bufferHeight: Math.round(viewportHeight * ratio),
		cssWidth: viewportWidth,
		cssHeight: viewportHeight,
	};
}

/**
 * キャプチャ画像へ描画を合成するときのスケール。
 *
 * captureVisibleTab は物理ピクセルで返るが、その倍率は必ずしも
 * window.devicePixelRatio と一致しない（ブラウザズーム時にずれる）。
 * そのため DPR ではなく「実際の画像サイズ ÷ ビューポート」で軸別に求める。
 * これは shotcraft の lib/geometry.ts と同じ考え方。
 */
export function captureScale(
	imageWidth: number,
	imageHeight: number,
	viewportWidth: number,
	viewportHeight: number,
): { x: number; y: number } {
	return {
		x: viewportWidth > 0 ? imageWidth / viewportWidth : 1,
		y: viewportHeight > 0 ? imageHeight / viewportHeight : 1,
	};
}

/**
 * ポインタ座標を canvas のローカル座標へ変換する。
 *
 * オーバーレイは position:fixed で全画面に敷くので通常 rect は原点だが、
 * ページ側の transform やスクロールバーの影響を受けうるため rect を引く。
 */
export function toCanvasPoint(
	clientX: number,
	clientY: number,
	rect: { left: number; top: number },
): { x: number; y: number } {
	return { x: clientX - rect.left, y: clientY - rect.top };
}
