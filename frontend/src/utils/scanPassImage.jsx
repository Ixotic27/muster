// ZXing occasionally misses a valid dense QR at one raster size. Retry two
// unsmoothed reductions locally; the decoded token still requires server checks.
export async function scanPassImage(reader, file) {
  try {
    return await reader.scanFile(file, false);
  } catch (originalError) {
    let image;
    try {
      if (typeof createImageBitmap === 'function') image = await createImageBitmap(file);else {
        const url = URL.createObjectURL(file);
        try {
          image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = reject;
            element.src = url;
          });
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      for (const scale of [0.5, 0.625]) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw originalError;
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw originalError;
        try {
          return await reader.scanFile(new File([blob], 'entry-pass-normalized.png', {
            type: 'image/png'
          }), false);
        } catch {/* Try the next raster size, without changing the encoded data. */}
      }
    } catch {/* Preserve the original decoder failure for the caller. */} finally {
      image?.close?.();
    }
    throw originalError;
  }
}
