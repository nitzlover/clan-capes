/**
 * Vanilla Minecraft banner data — single source of truth shared by the
 * editor (pattern picker), the preview (BannerPreview), the image→banner
 * fitter (imageToBanner), the NBT import/export, and the server-side
 * banner repo that feeds the plugin.
 *
 * ## The one rule (post-2026-06-03 unification)
 *
 * A pattern is ALWAYS identified by its **modern vanilla registry key**
 * (`stripe_downright`, `diagonal_left`, `creeper`, `mojang`, …). That is
 * exactly what:
 *   - the plugin resolves via `Registry.BANNER_PATTERN.get(minecraft(key))`,
 *   - the preview textures are named (`/public/mc/shield-patterns/<key>.png`),
 *   - real Minecraft 1.21 NBT uses.
 *
 * Earlier builds invented a private short-code scheme (`drs`, `ms`, `sc`,
 * `tl`, …) that COLLIDED with the real Bukkit legacy codes but assigned
 * different patterns. That made the editor preview, the in-game result,
 * and any pasted vanilla NBT disagree. The scheme is gone; the two legacy
 * tables below exist only to normalise old data:
 *
 *   - {@link PROJECT_CODE_TO_KEY} — the panel's OWN old short codes →
 *     modern key. Used to migrate banner specs already saved in the DB
 *     (and any in-flight read). Values mirror what the plugin actually
 *     painted in-game for those codes, so migrating is visually a no-op
 *     on the server — only the panel preview gets corrected to match.
 *   - {@link VANILLA_LEGACY_TO_KEY} — the REAL Bukkit pre-1.21 codes →
 *     modern key. Used ONLY inside {@link parseNbtSpec}, where the input
 *     is a vanilla NBT blob the user pasted from the game.
 *
 * Colours stay DyeColor ordinals (0..15); the plugin stores the same
 * numbers, so panel and server speak identical colour ids.
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
  /** Modern vanilla registry key — the storage key AND the texture name. */
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
 * Every selectable pattern, keyed by modern registry key. Order = order
 * shown in the picker (grouped: stripes → squares → triangles → diagonals
 * → halves → borders/shapes → charges). Every `code` MUST have a matching
 * `/public/mc/shield-patterns/<code>.png` texture.
 */
export const BANNER_PATTERNS: BannerPattern[] = [
  // Stripes
  { code: 'stripe_top', label: 'Stripe top' },
  { code: 'stripe_bottom', label: 'Stripe bottom' },
  { code: 'stripe_left', label: 'Stripe left' },
  { code: 'stripe_right', label: 'Stripe right' },
  { code: 'stripe_center', label: 'Stripe center (vertical)' },
  { code: 'stripe_middle', label: 'Stripe middle (horizontal)' },
  { code: 'stripe_downright', label: 'Stripe down-right' },
  { code: 'stripe_downleft', label: 'Stripe down-left' },
  { code: 'small_stripes', label: 'Small stripes' },
  // Squares (corners)
  { code: 'square_top_left', label: 'Square top-left' },
  { code: 'square_top_right', label: 'Square top-right' },
  { code: 'square_bottom_left', label: 'Square bottom-left' },
  { code: 'square_bottom_right', label: 'Square bottom-right' },
  // Crosses
  { code: 'cross', label: 'Cross (saltire)' },
  { code: 'straight_cross', label: 'Straight cross (+)' },
  // Triangles
  { code: 'triangle_top', label: 'Triangle top' },
  { code: 'triangle_bottom', label: 'Triangle bottom' },
  { code: 'triangles_top', label: 'Triangles top (sawtooth)' },
  { code: 'triangles_bottom', label: 'Triangles bottom (sawtooth)' },
  // Diagonals
  { code: 'diagonal_left', label: 'Diagonal left' },
  { code: 'diagonal_right', label: 'Diagonal right' },
  { code: 'diagonal_up_left', label: 'Diagonal up-left' },
  { code: 'diagonal_up_right', label: 'Diagonal up-right' },
  // Halves
  { code: 'half_vertical', label: 'Half vertical' },
  { code: 'half_vertical_right', label: 'Half vertical right' },
  { code: 'half_horizontal', label: 'Half horizontal' },
  { code: 'half_horizontal_bottom', label: 'Half horizontal bottom' },
  // Borders / fills / shapes
  { code: 'border', label: 'Border' },
  { code: 'curly_border', label: 'Curly border' },
  { code: 'bricks', label: 'Bricks (field masoned)' },
  { code: 'gradient', label: 'Gradient' },
  { code: 'gradient_up', label: 'Gradient up' },
  { code: 'circle', label: 'Circle (roundel)' },
  { code: 'rhombus', label: 'Rhombus (lozenge)' },
  // Charges (special)
  { code: 'creeper', label: 'Creeper charge' },
  { code: 'skull', label: 'Skull charge' },
  { code: 'flower', label: 'Flower charge' },
  { code: 'mojang', label: 'Mojang (thing)' },
  { code: 'globe', label: 'Globe' },
  { code: 'piglin', label: 'Snout (piglin)' },
  { code: 'flow', label: 'Flow' },
  { code: 'guster', label: 'Guster' },
];

/** Fast membership test — every valid modern key. */
export const MODERN_KEYS: ReadonlySet<string> = new Set(
  BANNER_PATTERNS.map((p) => p.code),
);

/**
 * The panel's OWN pre-unification short codes → modern key. Mirrors the
 * plugin's old `LEGACY_TO_MODERN_KEY`, so migrating a saved spec through
 * this table reproduces exactly what the server already painted in-game
 * for that code — the in-game banner does not change, only the panel
 * preview is corrected to match it.
 */
export const PROJECT_CODE_TO_KEY: Record<string, string> = {
  bo: 'border',
  bri: 'bricks',
  bt: 'triangle_bottom',
  bts: 'triangles_bottom',
  cbo: 'curly_border',
  cr: 'cross',
  cra: 'creeper',
  cre: 'creeper',
  cs: 'stripe_center',
  dls: 'diagonal_left',
  drs: 'diagonal_right',
  flo: 'flower',
  flw: 'flow',
  glb: 'globe',
  gra: 'gradient',
  gru: 'gradient_up',
  gus: 'guster',
  hh: 'half_horizontal',
  hhb: 'half_horizontal_bottom',
  ld: 'diagonal_up_left',
  lud: 'diagonal_up_left',
  mc: 'mojang',
  moj: 'mojang',
  mr: 'rhombus',
  ms: 'stripe_downright',
  msb: 'stripe_middle',
  mss: 'small_stripes',
  pig: 'piglin',
  rd: 'diagonal_right',
  rs: 'stripe_right',
  rud: 'diagonal_up_right',
  sc: 'square_top_left',
  sku: 'skull',
  ss: 'straight_cross',
  tl: 'stripe_top',
  tr: 'triangle_top',
  ts: 'stripe_left',
  tt: 'triangle_top',
  tts: 'triangles_top',
  vh: 'half_vertical',
  vhr: 'half_vertical_right',
  bl: 'square_bottom_left',
  br: 'square_bottom_right',
};

/**
 * The REAL Bukkit / vanilla pre-1.21 short codes → modern key. Sourced
 * from the Bukkit `PatternType` legacy identifiers + the Minecraft Wiki
 * banner-pattern table (2026-06-03). Used ONLY by {@link parseNbtSpec}
 * when the user pastes an NBT blob copied out of the game, where the
 * codes carry their vanilla meaning (NOT the panel's old scheme).
 */
export const VANILLA_LEGACY_TO_KEY: Record<string, string> = {
  b: 'base',
  bs: 'stripe_bottom',
  ts: 'stripe_top',
  ls: 'stripe_left',
  rs: 'stripe_right',
  cs: 'stripe_center',
  ms: 'stripe_middle',
  drs: 'stripe_downright',
  dls: 'stripe_downleft',
  ss: 'small_stripes',
  cr: 'cross',
  sc: 'straight_cross',
  bt: 'triangle_bottom',
  tt: 'triangle_top',
  bts: 'triangles_bottom',
  tts: 'triangles_top',
  ld: 'diagonal_left',
  rd: 'diagonal_right',
  lud: 'diagonal_up_left',
  rud: 'diagonal_up_right',
  vh: 'half_vertical',
  vhr: 'half_vertical_right',
  hh: 'half_horizontal',
  hhb: 'half_horizontal_bottom',
  bl: 'square_bottom_left',
  br: 'square_bottom_right',
  tl: 'square_top_left',
  tr: 'square_top_right',
  mc: 'circle',
  mr: 'rhombus',
  bo: 'border',
  cbo: 'curly_border',
  gra: 'gradient',
  gru: 'gradient_up',
  bri: 'bricks',
  cre: 'creeper',
  sku: 'skull',
  flo: 'flower',
  moj: 'mojang',
  glb: 'globe',
  pig: 'piglin',
  flw: 'flow',
  gus: 'guster',
};

export type BannerSpec = {
  baseColor: number;
  patterns: Array<{ color: number; pattern: string }>;
};

export const EMPTY_SPEC: BannerSpec = { baseColor: 0, patterns: [] };

export function colorForOrdinal(o: number): BannerColor {
  return BANNER_COLORS[Math.max(0, Math.min(15, o | 0))];
}

/**
 * Normalise any stored / inbound pattern identifier to a modern key.
 *
 *   1. already a modern key            → return as-is
 *   2. a `minecraft:foo` namespaced id → strip namespace, recheck
 *   3. one of the panel's OLD codes    → map via PROJECT_CODE_TO_KEY
 *   4. anything else                   → null (caller skips the layer)
 *
 * This is the DB / read-path normaliser: every banner spec already saved
 * by this panel used a project code, and new specs use modern keys, so
 * those two cases cover all stored data. (Vanilla NBT import is handled
 * separately by {@link parseNbtSpec}, which knows the codes are vanilla.)
 */
export function normalizePatternKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let k = String(raw).trim().toLowerCase();
  if (k.startsWith('minecraft:')) k = k.slice('minecraft:'.length);
  if (MODERN_KEYS.has(k)) return k;
  const mapped = PROJECT_CODE_TO_KEY[k];
  return mapped && MODERN_KEYS.has(mapped) ? mapped : null;
}

/** Normalise a whole spec's pattern layers to modern keys, dropping unknowns. */
export function normalizeSpec(spec: BannerSpec): BannerSpec {
  return {
    baseColor: clampOrdinal(spec.baseColor),
    patterns: spec.patterns
      .map((p) => {
        const key = normalizePatternKey(p.pattern);
        return key ? { color: clampOrdinal(p.color), pattern: key } : null;
      })
      .filter((p): p is { color: number; pattern: string } => p !== null),
  };
}

/**
 * Parse a vanilla-style NBT blob copied from the game, e.g.
 *
 *   {BlockEntityTag:{Base:14,Patterns:[
 *     {Color:15,Pattern:"drs"},
 *     {Color:15,Pattern:"minecraft:creeper"}
 *   ]}}
 *
 * into a BannerSpec with modern keys. Permissive on syntax (vanilla NBT
 * isn't strict JSON) — extracts Base and each {Color,Pattern} block with
 * regex. Each pattern is resolved as a VANILLA code (or modern key, or
 * `minecraft:`-prefixed id). Returns null when no Base is recoverable.
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
    const p = block[0].match(/Pattern\s*:\s*"?([A-Za-z0-9_:]+)"?/i);
    if (!c || !p) continue;
    const key = resolveVanillaPattern(p[1]);
    if (!key) continue;
    patterns.push({ color: clampOrdinal(parseInt(c[1], 10)), pattern: key });
  }
  return { baseColor, patterns };
}

/** Vanilla NBT pattern token → modern key (modern › namespaced › vanilla legacy). */
function resolveVanillaPattern(raw: string): string | null {
  let k = raw.trim().toLowerCase();
  if (k.startsWith('minecraft:')) k = k.slice('minecraft:'.length);
  if (MODERN_KEYS.has(k)) return k;
  const viaVanilla = VANILLA_LEGACY_TO_KEY[k];
  if (viaVanilla && MODERN_KEYS.has(viaVanilla)) return viaVanilla;
  return null;
}

/**
 * Round-trip a BannerSpec back to a vanilla NBT string. Emits modern
 * `minecraft:<key>` ids inside the legacy BlockEntityTag wrapper — the
 * format Minecraft 1.21 accepts and our own {@link parseNbtSpec} reads
 * back losslessly.
 */
export function specToNbt(spec: BannerSpec): string {
  const layers = spec.patterns
    .map((p) => `{Color:${p.color},Pattern:"minecraft:${p.pattern}"}`)
    .join(',');
  return `{BlockEntityTag:{Base:${spec.baseColor},Patterns:[${layers}]}}`;
}

function clampOrdinal(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(15, Math.trunc(n)));
}
