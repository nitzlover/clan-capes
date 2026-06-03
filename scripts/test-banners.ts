/**
 * Banner pattern-key regression tests. Run: npm test (tsx, no extra dep).
 *
 * Guards the 2026-06-03 banner unification: every pattern is identified by
 * its modern vanilla registry key. Two legacy tables resolve old data, and
 * the CONTEXT decides which:
 *   - normalizePatternKey(): stored DB specs / picker = the panel's OWN old
 *     project codes  (e.g. project "drs" -> diagonal_right).
 *   - parseNbtSpec():        pasted game NBT = REAL vanilla codes
 *     (e.g. vanilla  "drs" -> stripe_downright).
 * The same token "drs" therefore resolves differently per path — that is
 * the whole point, and this file locks it.
 */
import {
  normalizePatternKey,
  parseNbtSpec,
  specToNbt,
  MODERN_KEYS,
  type BannerSpec,
} from '../src/lib/banners';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -> ${JSON.stringify(actual)}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

// normalizePatternKey — stored specs use the panel's OLD project codes.
check('modern passthrough', normalizePatternKey('stripe_downright'), 'stripe_downright');
check('project drs -> diagonal_right', normalizePatternKey('drs'), 'diagonal_right');
check('project sc -> square_top_left', normalizePatternKey('sc'), 'square_top_left');
check('project ms -> stripe_downright', normalizePatternKey('ms'), 'stripe_downright');
check('namespaced strip', normalizePatternKey('minecraft:creeper'), 'creeper');
check('case-insensitive MC -> mojang', normalizePatternKey('MC'), 'mojang');
check('garbage -> null', normalizePatternKey('garbage'), null);
check('empty -> null', normalizePatternKey(''), null);

// parseNbtSpec — pasted VANILLA NBT carries vanilla code meaning, NOT project.
const nbt =
  '{BlockEntityTag:{Base:14,Patterns:[{Color:15,Pattern:"drs"},{Color:0,Pattern:"minecraft:creeper"}]}}';
const parsed = parseNbtSpec(nbt);
check('nbt base', parsed?.baseColor, 14);
// CRITICAL: vanilla "drs" = stripe_downright (project "drs" would be diagonal_right).
check('vanilla drs -> stripe_downright', parsed?.patterns[0], {
  color: 15,
  pattern: 'stripe_downright',
});
check('vanilla creeper', parsed?.patterns[1], { color: 0, pattern: 'creeper' });
check('no Base -> null', parseNbtSpec('garbage'), null);

// specToNbt round-trip.
const spec: BannerSpec = { baseColor: 14, patterns: [{ color: 15, pattern: 'stripe_downright' }] };
const nbtOut = specToNbt(spec);
check('export emits minecraft: key', nbtOut.includes('minecraft:stripe_downright'), true);
check('round-trip parse(export(spec)) === spec', parseNbtSpec(nbtOut), spec);

// Self-consistency: every picker code is itself a valid modern key.
check(
  'all picker codes are modern keys',
  [...MODERN_KEYS].every((k) => normalizePatternKey(k) === k),
  true,
);

if (failed > 0) {
  console.error(`\n${failed} banner check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll banner checks passed.');
