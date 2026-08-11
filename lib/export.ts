/**
 * 描画をページのスクリーンショットへ合成して書き出す。
 *
 * captureVisibleTab が返す画像は物理ピクセルで、その倍率は必ずしも
 * devicePixelRatio と一致しない（ブラウザズーム時にずれる）。そのため
 * 実画像サイズ ÷ ビューポートで軸別にスケールを求める（lib/geometry.ts）。
 */

/** 保存するファイル名を作る。shotcraft と同じ形式に揃えている。 */
export function exportFilename(now: Date, ext = "png"): string {
	const p = (n: number, len = 2) => String(n).padStart(len, "0");
	const stamp =
		`${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
		`-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
	return `inkover-${stamp}.${ext}`;
}

/**
 * Blob をダウンロードさせる。
 *
 * chrome.downloads は使わない。`<a download>` なら権限が要らず、
 * service worker の URL.createObjectURL 非対応問題も踏まない。
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.style.display = "none";
	document.body.appendChild(a);
	a.click();
	a.remove();
	// 解放は次のタスクで。即座に revoke するとダウンロードが始まらないことがある。
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** canvas を PNG の Blob にする。 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			blob ? resolve(blob) : reject(new Error("PNG への変換に失敗しました"));
		}, "image/png");
	});
}

/**
 * data URL の画像を読み込む。
 * createImageBitmap でなく Image を使うのは、content script 側（DOM あり）で
 * 動かすため。
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
		img.src = src;
	});
}
