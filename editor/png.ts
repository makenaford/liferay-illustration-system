/**
 * PNG EXPORT — the rendered SVG, rasterised in the browser.
 *
 * The export SVG is drawn into a canvas as an image. That is the same path a
 * page takes when it shows the SVG in an `<img>`, so what the PNG captures is
 * exactly what the SVG file looks like in use: the embedded Source Sans 3,
 * the frosted-glass blur filters, the mesh — no second renderer to drift.
 *
 * `scale` multiplies the canvas size: 2 is the default because these sit on
 * marketing pages that are mostly viewed on high-density screens.
 */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const img = new Image();
  img.decoding = 'async';
  // A data URI rather than a blob URL: some browsers taint the canvas for
  // blob-URL SVGs, which would make `toBlob` throw.
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas is unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode the PNG'))), 'image/png'),
  );
}
