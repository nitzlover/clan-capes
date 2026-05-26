/**
 * Mirror of plugin-side {@code dev.clancapes.util.VanillaColor} —
 * snap an arbitrary {@code #RRGGBB} hex to the nearest of Minecraft's
 * 16 vanilla chat colours. Used by the admin UI to show operators
 * exactly which §-code their picked colour will collapse to in chat
 * + TAB.
 *
 * Snap is sRGB Euclidean. Match plugin implementation exactly so the
 * preview the dashboard shows is identical to what renders in-game.
 */

/**
 * The 16 vanilla §-codes Mojang ships, in code order. Names match
 * Adventure's {@code NamedTextColor} enum so the operator sees the
 * canonical Mojang label ("DARK_AQUA") not a localised one.
 */
export const VANILLA_COLORS = [
  { name: 'BLACK',        code: '0', hex: '#000000' },
  { name: 'DARK_BLUE',    code: '1', hex: '#0000AA' },
  { name: 'DARK_GREEN',   code: '2', hex: '#00AA00' },
  { name: 'DARK_AQUA',    code: '3', hex: '#00AAAA' },
  { name: 'DARK_RED',     code: '4', hex: '#AA0000' },
  { name: 'DARK_PURPLE',  code: '5', hex: '#AA00AA' },
  { name: 'GOLD',         code: '6', hex: '#FFAA00' },
  { name: 'GRAY',         code: '7', hex: '#AAAAAA' },
  { name: 'DARK_GRAY',    code: '8', hex: '#555555' },
  { name: 'BLUE',         code: '9', hex: '#5555FF' },
  { name: 'GREEN',        code: 'a', hex: '#55FF55' },
  { name: 'AQUA',         code: 'b', hex: '#55FFFF' },
  { name: 'RED',          code: 'c', hex: '#FF5555' },
  { name: 'LIGHT_PURPLE', code: 'd', hex: '#FF55FF' },
  { name: 'YELLOW',       code: 'e', hex: '#FFFF55' },
  { name: 'WHITE',        code: 'f', hex: '#FFFFFF' },
] as const;

export type VanillaColor = (typeof VANILLA_COLORS)[number];

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/**
 * Returns the {@link VanillaColor} whose sRGB Euclidean distance to
 * the input is smallest. Defaults to {@link VANILLA_COLORS} entry for
 * WHITE on malformed input so the UI always has something to draw.
 */
export function nearestVanilla(hex: string): VanillaColor {
  const match = HEX_RE.exec(hex);
  if (!match) return VANILLA_COLORS[15];
  const v = parseInt(match[1], 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  let best: VanillaColor = VANILLA_COLORS[15];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const candidate of VANILLA_COLORS) {
    const cv = parseInt(candidate.hex.slice(1), 16);
    const cr = (cv >> 16) & 0xff;
    const cg = (cv >> 8) & 0xff;
    const cb = cv & 0xff;
    const dr = r - cr;
    const dg = g - cg;
    const db = b - cb;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}
