'use client';

/**
 * Vanilla-accurate armour-trim preview.
 *
 * Minecraft's renderer composes a worn trim by tinting the trim's
 * grayscale humanoid texture through a per-material 8-step colour
 * palette. We replicate that math on a canvas so the operator sees
 * the exact motif and shade their pick will produce in-game without
 * spinning up a 3D viewport.
 *
 * Pipeline:
 *   1. Load `trims/color_palettes/trim_palette.png` (8x1 grayscale)
 *      to get the reference grayscale value for each palette index.
 *      Cached process-wide — single fetch for the lifetime of the
 *      page.
 *   2. Load the material palette `trims/color_palettes/<mat>.png`
 *      (8x1 RGB) — the actual colours.
 *   3. Load the per-slot grayscale pattern (`humanoid/<pat>.png` for
 *      head/chest/feet, `humanoid_leggings/<pat>.png` for legs).
 *   4. For every opaque pixel of the pattern, look up its grayscale
 *      level in the reference palette → index, output the matching
 *      RGB from the material palette.
 *   5. Paint the recoloured pattern onto a hidden 64x32 backing
 *      canvas; the visible canvas upscales it with crisp pixel-art
 *      smoothing via CSS `image-rendering: pixelated`.
 *
 * The component is intentionally read-only and side-effect-free
 * outside its own canvas — caller drops it wherever a slot+material+
 * pattern triple is in scope.
 */

import { useEffect, useRef } from 'react';

type Slot = 'head' | 'chest' | 'legs' | 'feet';

type Props = {
  slot: Slot;
  material: string;
  pattern: string;
};

/**
 * Reference palette — grayscale anchors that map a source pattern
 * pixel's brightness to one of the 8 palette indices. Loaded once and
 * cached so every TrimPreview instance on the page shares the work.
 */
let referenceCache: Promise<Uint8ClampedArray> | null = null;
function loadReference(): Promise<Uint8ClampedArray> {
  if (referenceCache) return referenceCache;
  referenceCache = loadImageData('/mc/trims/color_palettes/trim_palette.png').then(
    (img) => {
      // 8x1 grayscale (or RGB) — read the red channel of each column.
      const out = new Uint8ClampedArray(8);
      for (let i = 0; i < 8; i++) out[i] = img.data[i * 4];
      return out;
    },
  );
  return referenceCache;
}

const paletteCache = new Map<string, Promise<Uint8ClampedArray>>();
function loadPalette(material: string): Promise<Uint8ClampedArray> {
  const cached = paletteCache.get(material);
  if (cached) return cached;
  const p = loadImageData(`/mc/trims/color_palettes/${material}.png`).then((img) => {
    // 8x1 RGB — flatten into [r,g,b,r,g,b,...] of length 24.
    const out = new Uint8ClampedArray(8 * 3);
    for (let i = 0; i < 8; i++) {
      out[i * 3 + 0] = img.data[i * 4 + 0];
      out[i * 3 + 1] = img.data[i * 4 + 1];
      out[i * 3 + 2] = img.data[i * 4 + 2];
    }
    return out;
  });
  paletteCache.set(material, p);
  return p;
}

const patternCache = new Map<string, Promise<ImageData>>();
function loadPattern(slot: Slot, pattern: string): Promise<ImageData> {
  const folder = slot === 'legs' ? 'humanoid_leggings' : 'humanoid';
  const key = `${folder}/${pattern}`;
  const cached = patternCache.get(key);
  if (cached) return cached;
  const p = loadImageData(`/mc/trims/entity/${folder}/${pattern}.png`);
  patternCache.set(key, p);
  return p;
}

function loadImageData(src: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) {
        reject(new Error('no 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/**
 * Pick the palette index whose reference grayscale is closest to the
 * source pixel's brightness. The reference palette is monotonic
 * (light-to-dark) so a linear scan is enough — 8 comparisons per
 * pixel is cheap and avoids hard-coding the exact grayscale anchors
 * Mojang ships (which have changed across versions).
 */
function nearestIndex(value: number, reference: Uint8ClampedArray): number {
  let best = 0;
  let bestDelta = Math.abs(value - reference[0]);
  for (let i = 1; i < 8; i++) {
    const d = Math.abs(value - reference[i]);
    if (d < bestDelta) {
      best = i;
      bestDelta = d;
    }
  }
  return best;
}

export function TrimPreview({ slot, material, pattern }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generation = useRef(0);

  useEffect(() => {
    const id = ++generation.current;
    let cancelled = false;
    (async () => {
      try {
        const [reference, palette, patternImg] = await Promise.all([
          loadReference(),
          loadPalette(material),
          loadPattern(slot, pattern),
        ]);
        if (cancelled || id !== generation.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = patternImg.width;
        const h = patternImg.height;
        const src = patternImg.data;

        // Pass 1 — find the bounding box of the actual trim pixels.
        // Vanilla humanoid textures are 64x32 / 64x32 with most of
        // the surface transparent (the trim is painted along armour
        // hems + arm bands), so blitting the full sheet leaves the
        // operator staring at empty space. Crop to the populated
        // region first, then upscale that crop into the preview box.
        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (src[(y * w + x) * 4 + 3] !== 0) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) {
          // All transparent — render a 1x1 transparent buffer rather
          // than 0x0 (which createImageData rejects).
          canvas.width = 1;
          canvas.height = 1;
          return;
        }
        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const out = ctx.createImageData(cw, ch);
        const dst = out.data;
        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            const si = ((y + minY) * w + (x + minX)) * 4;
            const di = (y * cw + x) * 4;
            const alpha = src[si + 3];
            if (alpha === 0) {
              dst[di + 3] = 0;
              continue;
            }
            const idx = nearestIndex(src[si], reference);
            dst[di + 0] = palette[idx * 3 + 0];
            dst[di + 1] = palette[idx * 3 + 1];
            dst[di + 2] = palette[idx * 3 + 2];
            dst[di + 3] = alpha;
          }
        }
        ctx.putImageData(out, 0, 0);
      } catch {
        // Texture missing → leave the canvas blank.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slot, material, pattern]);

  return (
    <span
      className="inline-flex h-14 w-28 shrink-0 items-center justify-center border-2 border-[var(--rule-strong)] bg-[#11110f] p-1"
      title={`${material} · ${pattern}`}
    >
      <canvas
        ref={canvasRef}
        className="block max-h-full max-w-full"
        style={{ imageRendering: 'pixelated', width: '100%', height: 'auto' }}
      />
    </span>
  );
}
