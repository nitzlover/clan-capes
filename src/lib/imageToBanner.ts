/**
 * Image → BannerSpec converter, inspired by MARSTeamMC/Image2Banners.
 *
 * Pipeline:
 *   1. Downsample the user-supplied image to 20×40 RGBA (matches the
 *      native vanilla banner resolution).
 *   2. Quantise every pixel to the nearest of the 16 vanilla DyeColors
 *      (Euclidean distance in RGB). The result is the "target" image we
 *      want the banner to approximate.
 *   3. Pre-render every (pattern × dye colour) combination as a 20×40
 *      RGBA "layer-on-empty" image — i.e. apply the pattern's alpha mask
 *      with that colour against a transparent background. This is the
 *      search space: at any moment a layer added to the banner paints
 *      these pixels on top of whatever was there before.
 *   4. Pick the base colour with the lowest total pixel distance to the
 *      target. This is "layer 0".
 *   5. Greedy refinement: for up to MAX_LAYERS iterations, find the
 *      (pattern, colour) pair that minimises the total distance when
 *      composited on top of the current banner. Commit it, repeat.
 *      Stop early if no candidate improves the score.
 *
 * Everything runs in the browser via Canvas — no server round trip, no
 * external deps. Pre-loading the 34 pattern PNGs happens once per page
 * load (~50 KB total) and the rest is pure ImageData math.
 */

import {
  BANNER_COLORS,
  BANNER_PATTERNS,
  type BannerSpec,
} from './banners';

const BANNER_WIDTH = 20;
const BANNER_HEIGHT = 40;
const PIXEL_COUNT = BANNER_WIDTH * BANNER_HEIGHT;
const MAX_LAYERS_DEFAULT = 6;

type Rgb = { r: number; g: number; b: number };

const DYE_RGB: Rgb[] = BANNER_COLORS.map((c) => hexToRgb(c.hex));

/** Decoded pattern mask: 800-entry Uint8 array, 0..255 alpha. */
type PatternMask = { code: string; alpha: Uint8Array };

let cachedMasks: Promise<PatternMask[]> | null = null;

function hexToRgb(hex: string): Rgb {
  const s = hex.replace('#', '');
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

/** Squared Euclidean distance in RGB — fine for this kind of matching. */
function distSq(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Pick the closest DyeColor for an arbitrary RGB pixel. Returns ordinal. */
function nearestDyeOrdinal(px: Rgb): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < DYE_RGB.length; i++) {
    const d = distSq(px, DYE_RGB[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Load + decode every pattern PNG into its 20×40 alpha mask. */
async function loadPatternMasks(): Promise<PatternMask[]> {
  if (cachedMasks) return cachedMasks;
  cachedMasks = (async () => {
    const canvas = document.createElement('canvas');
    canvas.width = BANNER_WIDTH;
    canvas.height = BANNER_HEIGHT;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const out: PatternMask[] = [];
    for (const p of BANNER_PATTERNS) {
      // Modern-key shield-projected texture — the same set the preview and
      // the plugin use, so the fitter only ever searches over patterns the
      // server can actually render. Drawn into a 20×40 canvas below.
      const img = await loadImage(`/mc/shield-patterns/${p.code}.png`);
      ctx.clearRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
      ctx.drawImage(img, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
      const data = ctx.getImageData(0, 0, BANNER_WIDTH, BANNER_HEIGHT).data;
      const alpha = new Uint8Array(PIXEL_COUNT);
      for (let i = 0; i < PIXEL_COUNT; i++) {
        alpha[i] = data[i * 4 + 3];
      }
      out.push({ code: p.code, alpha });
    }
    return out;
  })();
  return cachedMasks;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/** Downsample arbitrary image source to 20×40 RGB array (alpha pre-multiplied to white). */
async function imageToTarget(source: HTMLImageElement | HTMLCanvasElement): Promise<Rgb[]> {
  const canvas = document.createElement('canvas');
  canvas.width = BANNER_WIDTH;
  canvas.height = BANNER_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Paint white behind the image so transparent pixels read as white
  // instead of black — most user uploads are PNGs with transparent
  // backgrounds and we don't want them collapsing to "all black".
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  ctx.drawImage(source, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  const data = ctx.getImageData(0, 0, BANNER_WIDTH, BANNER_HEIGHT).data;
  const out: Rgb[] = new Array(PIXEL_COUNT);
  for (let i = 0; i < PIXEL_COUNT; i++) {
    out[i] = { r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] };
  }
  return out;
}

/** Total RGB distance between the current canvas and the target. */
function totalDistance(current: Rgb[], target: Rgb[]): number {
  let sum = 0;
  for (let i = 0; i < PIXEL_COUNT; i++) {
    sum += distSq(current[i], target[i]);
  }
  return sum;
}

/**
 * Convert a HTMLImageElement (or canvas — same call shape) into a banner
 * spec by greedy fit. `maxLayers` caps the pattern stack; vanilla shields
 * tolerate up to 6.
 */
export async function imageToBannerSpec(
  source: HTMLImageElement | HTMLCanvasElement,
  maxLayers: number = MAX_LAYERS_DEFAULT,
): Promise<BannerSpec> {
  const [target, masks] = await Promise.all([imageToTarget(source), loadPatternMasks()]);
  // Quantise target to DyeColor palette — matching at the palette level
  // gives far cleaner banner output than matching to raw photo pixels.
  const quantised: Rgb[] = target.map((p) => DYE_RGB[nearestDyeOrdinal(p)]);

  // 1) Pick the base colour with the lowest aggregate distance.
  let bestBase = 0;
  let bestBaseScore = Infinity;
  for (let c = 0; c < DYE_RGB.length; c++) {
    const colour = DYE_RGB[c];
    let score = 0;
    for (let i = 0; i < PIXEL_COUNT; i++) {
      score += distSq(colour, quantised[i]);
    }
    if (score < bestBaseScore) {
      bestBaseScore = score;
      bestBase = c;
    }
  }

  const current: Rgb[] = new Array(PIXEL_COUNT).fill(0).map(() => ({ ...DYE_RGB[bestBase] }));
  const patterns: Array<{ color: number; pattern: string }> = [];
  let currentScore = bestBaseScore;

  // 2) Greedy layer search. Each iteration evaluates 16×|masks| candidates
  //    and keeps the best one. The alpha threshold treats any non-fully-
  //    transparent pixel as "this pattern paints here" — mirroring how
  //    Minecraft itself composites pattern layers.
  for (let layer = 0; layer < maxLayers; layer++) {
    let bestScore = currentScore;
    let bestMaskIdx = -1;
    let bestColour = -1;

    for (let m = 0; m < masks.length; m++) {
      const mask = masks[m];
      for (let c = 0; c < DYE_RGB.length; c++) {
        const colour = DYE_RGB[c];
        let score = 0;
        for (let i = 0; i < PIXEL_COUNT; i++) {
          const a = mask.alpha[i];
          // Pre-mix the candidate colour against the existing pixel by
          // mask alpha — same as Bukkit/MC compositing the pattern on
          // top of the running banner. Saves us a separate temp buffer.
          const aw = a / 255;
          const r = colour.r * aw + current[i].r * (1 - aw);
          const g = colour.g * aw + current[i].g * (1 - aw);
          const b = colour.b * aw + current[i].b * (1 - aw);
          const tp = quantised[i];
          const dr = tp.r - r;
          const dg = tp.g - g;
          const db = tp.b - b;
          score += dr * dr + dg * dg + db * db;
        }
        if (score < bestScore) {
          bestScore = score;
          bestMaskIdx = m;
          bestColour = c;
        }
      }
    }

    if (bestMaskIdx < 0) break; // no candidate improved the fit — stop.

    // Commit the winning layer into `current` for the next iteration's
    // candidate scoring.
    const mask = masks[bestMaskIdx];
    const colour = DYE_RGB[bestColour];
    for (let i = 0; i < PIXEL_COUNT; i++) {
      const a = mask.alpha[i];
      if (a === 0) continue;
      const aw = a / 255;
      current[i] = {
        r: Math.round(colour.r * aw + current[i].r * (1 - aw)),
        g: Math.round(colour.g * aw + current[i].g * (1 - aw)),
        b: Math.round(colour.b * aw + current[i].b * (1 - aw)),
      };
    }
    patterns.push({ color: bestColour, pattern: mask.code });
    currentScore = bestScore;
  }

  return { baseColor: bestBase, patterns };
}

/** Convenience: take a File from <input type="file">, return a BannerSpec. */
export async function fileToBannerSpec(file: File, maxLayers?: number): Promise<BannerSpec> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  return imageToBannerSpec(img, maxLayers);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}
