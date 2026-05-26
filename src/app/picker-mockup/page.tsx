'use client';

/**
 * Visual mockup playground for the trim picker redesign.
 *
 * Pure visual comparison — no API calls, no save, no state plumbing
 * beyond local useState for the demo selections. Lives off the
 * /picker-mockup route so the operator can flip between variants on
 * the real Railway deploy without polluting /dashboard/clans.
 *
 * Each variant uses the same real vanilla textures the production
 * editor uses (color palettes, humanoid trim grayscales, smithing-
 * template item icons) so the look you see is the look you'd get.
 *
 * Three variants stacked vertically:
 *   1. Swatch dropdowns — palette gradient strip + recoloured pattern
 *      thumbnail beside each row.
 *   2. Smithing-template icon grid for patterns + palette tile grid
 *      for materials.
 *   3. Combined two-column panel — single "Pick trim" button opens a
 *      side-by-side material + pattern picker, both filterable.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

const MATERIALS = [
  'iron',
  'copper',
  'gold',
  'lapis',
  'emerald',
  'diamond',
  'netherite',
  'redstone',
  'amethyst',
  'quartz',
  'resin',
] as const;
type Material = (typeof MATERIALS)[number];

const PATTERNS = [
  'sentry',
  'dune',
  'coast',
  'wild',
  'ward',
  'eye',
  'vex',
  'tide',
  'snout',
  'rib',
  'spire',
  'wayfinder',
  'shaper',
  'silence',
  'raiser',
  'host',
  'flow',
  'bolt',
] as const;
type Pattern = (typeof PATTERNS)[number];

export default function PickerMockup() {
  return (
    <main className="mx-auto max-w-5xl space-y-12 px-6 py-12">
      <header>
        <h1 className="font-sans text-3xl font-extrabold uppercase tracking-wider text-white">
          Trim picker — variants
        </h1>
        <p className="mt-2 text-sm text-[var(--text-mute)]">
          Compare designs side-by-side with real vanilla assets. Use the
          armour preview anchor on the right of each row for context.
        </p>
      </header>

      <VariantSection
        n={1}
        title="Swatch dropdowns"
        blurb="Each material row carries an 8-step palette gradient. Each pattern row carries a recoloured thumbnail tinted by the currently picked material. Same dropdown UX as today — only the option rows gain visual cues."
      >
        <Variant1 />
      </VariantSection>

      <VariantSection
        n={2}
        title="Icon grid"
        blurb="Materials = 4×3 palette tile grid. Patterns = 6×3 grid of the vanilla smithing-template item icons. Click to pick — no chevron, no scrolling. Better recognition for veterans who already know the in-game template icons."
      >
        <Variant2 />
      </VariantSection>

      <VariantSection
        n={3}
        title="Combined panel"
        blurb="Single button per slot. Click opens a two-column popover (materials | patterns). Pick both, popover stays open until you tap Apply / outside. Half as many clicks for a full slot edit."
      >
        <Variant3 />
      </VariantSection>
    </main>
  );
}

function VariantSection({
  n,
  title,
  blurb,
  children,
}: {
  n: number;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="brutal-card p-6">
      <p className="label-mono mb-2 text-[var(--text-faint)]">
        Variant {n}
      </p>
      <h2 className="font-sans text-xl font-extrabold uppercase tracking-wider text-white">
        {title}
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-[var(--text-mute)]">{blurb}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

// ===== Variant 1: swatch dropdowns =====

function Variant1() {
  const [material, setMaterial] = useState<Material>('gold');
  const [pattern, setPattern] = useState<Pattern>('sentry');
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="label-mono mb-2 text-[var(--text-faint)]">Material</p>
        <SwatchDropdown
          value={material}
          options={MATERIALS as readonly string[] as string[]}
          onChange={(v) => setMaterial(v as Material)}
          renderRow={(name) => (
            <span className="flex items-center gap-3">
              <PaletteStrip material={name} />
              <span>{name}</span>
            </span>
          )}
        />
      </div>
      <div>
        <p className="label-mono mb-2 text-[var(--text-faint)]">Pattern</p>
        <SwatchDropdown
          value={pattern}
          options={PATTERNS as readonly string[] as string[]}
          onChange={(v) => setPattern(v as Pattern)}
          renderRow={(name) => (
            <span className="flex items-center gap-3">
              <PatternThumb material={material} pattern={name} />
              <span>{name}</span>
            </span>
          )}
        />
      </div>
    </div>
  );
}

// ===== Variant 2: icon grid =====

function Variant2() {
  const [material, setMaterial] = useState<Material>('gold');
  const [pattern, setPattern] = useState<Pattern>('sentry');
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="label-mono mb-2 text-[var(--text-faint)]">
          Material · {material}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {MATERIALS.map((m) => {
            const active = m === material;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMaterial(m)}
                className={`flex flex-col items-center gap-1 border-2 px-2 py-2 transition-colors ${
                  active
                    ? 'border-white bg-white/[0.08]'
                    : 'border-[var(--rule-strong)] hover:border-white'
                }`}
              >
                <PaletteStrip material={m} big />
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
                  {m}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="label-mono mb-2 text-[var(--text-faint)]">
          Pattern · {pattern}
        </p>
        <div className="grid grid-cols-6 gap-2">
          {PATTERNS.map((p) => {
            const active = p === pattern;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPattern(p)}
                title={p}
                className={`flex aspect-square items-center justify-center border-2 transition-colors ${
                  active
                    ? 'border-white bg-white/[0.1]'
                    : 'border-[var(--rule-strong)] hover:border-white'
                }`}
              >
                <img
                  src={`/mc/item/${p}_armor_trim_smithing_template.png`}
                  alt={p}
                  className="h-8 w-8"
                  style={{ imageRendering: 'pixelated' }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== Variant 3: combined panel =====

function Variant3() {
  const [material, setMaterial] = useState<Material>('gold');
  const [pattern, setPattern] = useState<Pattern>('sentry');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full max-w-md items-center gap-4 border-2 border-[var(--rule-strong)] bg-transparent px-4 py-3 text-left hover:border-white"
      >
        <PatternThumb material={material} pattern={pattern} />
        <span className="flex-1">
          <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Helmet trim
          </span>
          <span className="block font-sans text-sm font-bold uppercase tracking-wider text-white">
            {material} · {pattern}
          </span>
        </span>
        <span className="text-[var(--text-mute)]">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[640px] max-w-full border-2 border-white bg-[var(--bg-raise)] shadow-[6px_6px_0_0_rgba(255,255,255,0.18)]">
          <div className="grid grid-cols-2 gap-0">
            <div className="border-r-2 border-[var(--rule-strong)] p-4">
              <p className="label-mono mb-3">Material</p>
              <ul className="space-y-1">
                {MATERIALS.map((m) => {
                  const active = m === material;
                  return (
                    <li key={m}>
                      <button
                        type="button"
                        onClick={() => setMaterial(m)}
                        className={`flex w-full items-center gap-3 border border-transparent px-3 py-2 text-left ${
                          active ? 'bg-white text-black' : 'text-white hover:bg-white/[0.08]'
                        }`}
                      >
                        <PaletteStrip material={m} />
                        <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
                          {m}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="p-4">
              <p className="label-mono mb-3">Pattern</p>
              <div className="grid grid-cols-3 gap-2">
                {PATTERNS.map((p) => {
                  const active = p === pattern;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPattern(p)}
                      className={`flex flex-col items-center gap-1 border-2 px-1 py-1.5 transition-colors ${
                        active
                          ? 'border-white bg-white/[0.1]'
                          : 'border-[var(--rule-strong)] hover:border-white'
                      }`}
                    >
                      <PatternThumb material={material} pattern={p} />
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
                        {p}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 border-t-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-4 py-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-primary"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Shared atoms =====

/**
 * Generic dropdown with custom row renderer — keeps the trigger
 * button's structure consistent across material + pattern pickers
 * while letting each pass its own preview (palette strip vs
 * pattern thumb) into the row layout.
 */
function SwatchDropdown({
  value,
  options,
  onChange,
  renderRow,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  renderRow: (name: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 border-2 border-[var(--rule-strong)] bg-transparent px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white hover:border-white"
      >
        {renderRow(value)}
        <span className="text-[var(--text-mute)]">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border-2 border-white bg-[var(--bg-raise)] shadow-[4px_4px_0_0_rgba(255,255,255,0.18)]">
          {options.map((opt) => {
            const active = opt === value;
            return (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] ${
                    active ? 'bg-white text-black' : 'text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {renderRow(opt)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Horizontal 8-step palette gradient pulled straight from
 * trims/color_palettes/<material>.png. Inline <img> with pixelated
 * scaling — no canvas processing, no fetch tracking; the browser's
 * own image cache deduplicates across rows.
 */
function PaletteStrip({ material, big }: { material: string; big?: boolean }) {
  return (
    <img
      src={`/mc/trims/color_palettes/${material}.png`}
      alt=""
      className={big ? 'h-3 w-16' : 'h-2 w-10'}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

/**
 * Pattern thumbnail re-tinted on a canvas using the same vanilla
 * compose the production ArmorPiece3D uses — grayscale humanoid
 * pattern, indexed into the material palette through the reference
 * trim_palette. Cropped to the bounding box of opaque pixels so the
 * 24x24 box doesn't render mostly empty.
 */
function PatternThumb({ material, pattern }: { material: string; pattern: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheKey = `${material}::${pattern}`;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [reference, palette, patternImg] = await Promise.all([
          loadReference(),
          loadPalette(material),
          loadPattern(pattern),
        ]);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = patternImg.width;
        const h = patternImg.height;
        const src = patternImg.data;
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
            const a = src[si + 3];
            if (a === 0) {
              dst[di + 3] = 0;
              continue;
            }
            const idx = nearestIndex(src[si], reference);
            dst[di + 0] = palette[idx * 3 + 0];
            dst[di + 1] = palette[idx * 3 + 1];
            dst[di + 2] = palette[idx * 3 + 2];
            dst[di + 3] = a;
          }
        }
        ctx.putImageData(out, 0, 0);
      } catch {
        /* missing texture — leave blank */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, material, pattern]);
  return (
    <span className="inline-flex h-6 w-10 shrink-0 items-center justify-center border border-[var(--rule)] bg-[#11110f] p-0.5">
      <canvas
        ref={canvasRef}
        className="block"
        style={{ imageRendering: 'pixelated', width: '100%', height: 'auto' }}
      />
    </span>
  );
}

// ===== Texture pipeline (lifted from ArmorPiece3D, light copy) =====

let referenceCache: Promise<Uint8ClampedArray> | null = null;
function loadReference(): Promise<Uint8ClampedArray> {
  if (referenceCache) return referenceCache;
  referenceCache = loadImageData('/mc/trims/color_palettes/trim_palette.png').then((d) => {
    const out = new Uint8ClampedArray(8);
    for (let i = 0; i < 8; i++) out[i] = d.data[i * 4];
    return out;
  });
  return referenceCache;
}

const paletteCache = new Map<string, Promise<Uint8ClampedArray>>();
function loadPalette(material: string): Promise<Uint8ClampedArray> {
  const cached = paletteCache.get(material);
  if (cached) return cached;
  const p = loadImageData(`/mc/trims/color_palettes/${material}.png`).then((d) => {
    const out = new Uint8ClampedArray(8 * 3);
    for (let i = 0; i < 8; i++) {
      out[i * 3 + 0] = d.data[i * 4 + 0];
      out[i * 3 + 1] = d.data[i * 4 + 1];
      out[i * 3 + 2] = d.data[i * 4 + 2];
    }
    return out;
  });
  paletteCache.set(material, p);
  return p;
}

const patternCache = new Map<string, Promise<ImageData>>();
function loadPattern(pattern: string): Promise<ImageData> {
  const cached = patternCache.get(pattern);
  if (cached) return cached;
  const p = loadImageData(`/mc/trims/entity/humanoid/${pattern}.png`);
  patternCache.set(pattern, p);
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

// silence "unused" for useMemo import if tree shaker complains
void useMemo;
