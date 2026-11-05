/** Route BGG images through our proxy so WebGL/canvas can read them (CORS). */
export const proxied = (url: string | undefined) =>
  url ? `/api/img?url=${encodeURIComponent(url)}` : undefined;

/** Run async jobs with bounded concurrency. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Colours are stored per box-art image, so a different version's art gets its own. */
export const colorKey = (g: { id: number; thumbnail?: string }) => g.thumbnail ?? `game:${g.id}`;

/**
 * The cover's most prominent colour. Pixels are binned by hue, each weighted by how
 * colourful it is, and the winning bin's average is returned, so a red-and-green
 * cover comes out red or green rather than a muddy average. The outer edge of the
 * image is skipped (borders, background), and covers that are mostly black, white
 * or grey get a neutral colour.
 */
export function dominantColor(img: HTMLImageElement): string {
  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);
  const inset = Math.round(size * 0.1);
  const { data } = ctx.getImageData(inset, inset, size - 2 * inset, size - 2 * inset);

  const BINS = 18; // 20° of hue each
  const weight = new Float64Array(BINS);
  const sums = Array.from({ length: BINS }, () => [0, 0, 0]);
  const neutral = [0, 0, 0];
  let colourful = 0;
  const pixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const chroma = (max - min) / 255;
    if (chroma < 0.15 || max < 35) {
      neutral[0] += r; neutral[1] += g; neutral[2] += b;
      continue;
    }
    let h = max === r ? (g - b) / (max - min) : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    h = ((h * 60) + 360) % 360;
    const bin = Math.floor(h / (360 / BINS)) % BINS;
    const w = chroma * chroma; // vivid pixels count much more than dull ones
    weight[bin] += w;
    sums[bin][0] += r * w; sums[bin][1] += g * w; sums[bin][2] += b * w;
    colourful++;
  }

  let rgb: number[];
  if (colourful < pixels * 0.12) {
    const n = pixels - colourful;
    rgb = neutral.map((v) => v / n);
  } else {
    // Smooth across neighbouring bins so a hue straddling a boundary isn't split.
    let best = 0, bestScore = -1;
    for (let i = 0; i < BINS; i++) {
      const score = weight[i] + 0.5 * (weight[(i + BINS - 1) % BINS] + weight[(i + 1) % BINS]);
      if (score > bestScore) { best = i; bestScore = score; }
    }
    // Average the winning hue together with half of each neighbour, matching the score.
    const near: [number, number][] = [[best, 1], [(best + BINS - 1) % BINS, 0.5], [(best + 1) % BINS, 0.5]];
    const total = near.reduce((s, [i, k]) => s + weight[i] * k, 0);
    rgb = [0, 1, 2].map((c) => near.reduce((s, [i, k]) => s + sums[i][c] * k, 0) / total);
  }
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
