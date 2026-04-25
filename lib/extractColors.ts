export interface BookColors {
  coverGradient: string;
  glowColor: string;
  spineColor: string;
  accentColor: string;
}

/**
 * Extracts dominant colour from a cover image by drawing a tiny 8×8 canvas
 * sample through our /api/cover-color proxy (avoids CORS on Google Books URLs).
 * Returns null on any failure so callers can fall back gracefully.
 */
export function extractColorsFromCover(coverUrl: string): Promise<BookColors | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const proxyUrl = `/api/cover-color?url=${encodeURIComponent(coverUrl)}`;

  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) { resolve(null); return; }

    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, 8, 8);
        const { data } = ctx.getImageData(0, 0, 8, 8);

        let r = 0, g = 0, b = 0;
        const n = 64; // 8×8
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2];
        }
        r = Math.round(r / n);
        g = Math.round(g / n);
        b = Math.round(b / n);

        // Helpers
        const dk = (v: number, f: number) => Math.max(0,   Math.round(v * f));
        const lt = (v: number, f: number) => Math.min(255, Math.round(v + (255 - v) * f));

        resolve({
          spineColor: `rgb(${dk(r,.42)},${dk(g,.42)},${dk(b,.42)})`,
          coverGradient: [
            `linear-gradient(160deg,`,
            `rgb(${dk(r,.58)},${dk(g,.58)},${dk(b,.58)}) 0%,`,
            `rgb(${dk(r,.30)},${dk(g,.30)},${dk(b,.30)}) 40%,`,
            `rgb(${dk(r,.52)},${dk(g,.52)},${dk(b,.52)}) 100%)`,
          ].join(" "),
          glowColor:    `rgba(${r},${g},${b},0.68)`,
          accentColor:  `rgb(${lt(r,.48)},${lt(g,.48)},${lt(b,.48)})`,
        });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = proxyUrl;
  });
}
