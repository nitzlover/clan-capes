/**
 * Vanilla Minecraft banner data — shared by the editor (selector dropdowns)
 * and the preview (CSS colour + mask composition).
 *
 * Colours are in DyeColor ordinal order, so `BANNER_COLORS[i].hex` is the
 * paint that DyeColor.values()[i] uses on a real banner in-game. The
 * plugin stores the same ordinal in `baseColor` and each pattern's
 * `color`, so the panel and the server are talking the same numbers.
 *
 * Pattern entries use the short NBT codes ("flo", "mc", ...) because that
 * is also what the user already had in their cape ZIP / asset bundle and
 * what the plugin's `BannerPatternCodes` resolver expects. Files live
 * under `public/banner/patterns/<code>.png` (20×40 alpha masks).
 */

export type BannerColor = {
  /** Vanilla DyeColor ordinal — store this in the plugin. */
  ordinal: number;
  /** Mojang enum name. */
  name: string;
  /** Hex colour used to paint cloth in vanilla MC. */
  hex: string;
};

export type BannerPattern = {
  /** Short NBT code used as the storage key (matches PNG filename). */
  code: string;
  /** Readable label for the editor dropdown. */
  label: string;
};

export const BANNER_COLORS: BannerColor[] = [
  { ordinal: 0, name: 'white', hex: '#f9fffe' },
  { ordinal: 1, name: 'orange', hex: '#f9801d' },
  { ordinal: 2, name: 'magenta', hex: '#c74ebd' },
  { ordinal: 3, name: 'light_blue', hex: '#3ab3da' },
  { ordinal: 4, name: 'yellow', hex: '#fed83d' },
  { ordinal: 5, name: 'lime', hex: '#80c71f' },
  { ordinal: 6, name: 'pink', hex: '#f38baa' },
  { ordinal: 7, name: 'gray', hex: '#474f52' },
  { ordinal: 8, name: 'light_gray', hex: '#9d9d97' },
  { ordinal: 9, name: 'cyan', hex: '#169c9c' },
  { ordinal: 10, name: 'purple', hex: '#8932b8' },
  { ordinal: 11, name: 'blue', hex: '#3c44aa' },
  { ordinal: 12, name: 'brown', hex: '#835432' },
  { ordinal: 13, name: 'green', hex: '#5e7c16' },
  { ordinal: 14, name: 'red', hex: '#b02e26' },
  { ordinal: 15, name: 'black', hex: '#1d1d21' },
];

/**
 * Short code → display label. Order = the order shown in the picker.
 * Every entry must have a matching `public/banner/patterns/<code>.png`.
 */
export const BANNER_PATTERNS: BannerPattern[] = [
  { code: 'bo', label: 'Border' },
  { code: 'bri', label: 'Bricks' },
  { code: 'bt', label: 'Per-Bend (triangle bottom)' },
  { code: 'bts', label: 'Triangles bottom' },
  { code: 'cbo', label: 'Curly border' },
  { code: 'cr', label: 'Cross' },
  { code: 'cra', label: 'Creeper charge' },
  { code: 'cre', label: 'Creeper (alt)' },
  { code: 'cs', label: 'Stripe centre' },
  { code: 'dls', label: 'Diagonal left' },
  { code: 'drs', label: 'Diagonal right' },
  { code: 'flo', label: 'Flower charge' },
  { code: 'glb', label: 'Globe' },
  { code: 'gra', label: 'Gradient' },
  { code: 'gru', label: 'Gradient up' },
  { code: 'hh', label: 'Half horizontal' },
  { code: 'hhb', label: 'Half horizontal bottom' },
  { code: 'ld', label: 'Diagonal left down' },
  { code: 'lud', label: 'Diagonal up left' },
  { code: 'mc', label: 'Mojang charge' },
  { code: 'mr', label: 'Rhombus' },
  { code: 'ms', label: 'Stripe down right' },
  { code: 'msb', label: 'Stripe middle' },
  { code: 'mss', label: 'Small stripes' },
  { code: 'rd', label: 'Diagonal right down' },
  { code: 'rs', label: 'Stripe right' },
  { code: 'rud', label: 'Diagonal up right' },
  { code: 'sc', label: 'Square top-left' },
  { code: 'sku', label: 'Skull charge' },
  { code: 'ss', label: 'Straight cross' },
  { code: 'tl', label: 'Stripe top' },
  { code: 'tr', label: 'Triangle top' },
  { code: 'ts', label: 'Stripe left' },
  { code: 'tts', label: 'Triangles top' },
];

export function colorForOrdinal(o: number): BannerColor {
  return BANNER_COLORS[Math.max(0, Math.min(15, o | 0))];
}

export function patternForCode(code: string): BannerPattern | null {
  return BANNER_PATTERNS.find((p) => p.code === code) ?? null;
}

export type BannerSpec = {
  baseColor: number;
  patterns: Array<{ color: number; pattern: string }>;
};

export const EMPTY_SPEC: BannerSpec = { baseColor: 0, patterns: [] };

/**
 * Parse a vanilla-style NBT blob like:
 *
 *   {BlockEntityTag:{Base:14,Patterns:[
 *     {Color:15,Pattern:"gra"},
 *     {Color:15,Pattern:"cbo"}
 *   ]}}
 *
 * into a BannerSpec. The parser is deliberately permissive — vanilla NBT
 * isn't strict JSON (unquoted keys, double-or-no quotes around values)
 * so we extract Base and each {Color, Pattern} block with regex rather
 * than fighting a strict parser. Returns null when no valid spec can be
 * recovered (no Base, or zero patterns and the input clearly wasn't a
 * banner NBT).
 */
export function parseNbtSpec(input: string): BannerSpec | null {
  if (!input || !input.trim()) return null;
  const baseMatch = input.match(/Base\s*:\s*(\d+)/i);
  if (!baseMatch) return null;
  const baseColor = clampOrdinal(parseInt(baseMatch[1], 10));

  const patterns: Array<{ color: number; pattern: string }> = [];
  const blockRe = /\{[^{}]+\}/g;
  for (const block of input.matchAll(blockRe)) {
    const c = block[0].match(/Color\s*:\s*(\d+)/i);
    const p = block[0].match(/Pattern\s*:\s*"?([A-Za-z0-9_]+)"?/i);
    if (!c || !p) continue;
    patterns.push({
      color: clampOrdinal(parseInt(c[1], 10)),
      pattern: p[1].toLowerCase(),
    });
  }
  return { baseColor, patterns };
}

/** Round-trip a BannerSpec back to the vanilla NBT format. */
export function specToNbt(spec: BannerSpec): string {
  const layers = spec.patterns
    .map((p) => `{Color:${p.color},Pattern:"${p.pattern}"}`)
    .join(',');
  return `{BlockEntityTag:{Base:${spec.baseColor},Patterns:[${layers}]}}`;
}

function clampOrdinal(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(15, Math.trunc(n)));
}
