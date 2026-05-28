/**
 * Default knobs for each event type. Used both by the plugin-facing
 * endpoint (when no DB row exists) and by the panel UI (when seeding
 * a fresh config row).
 *
 * Defaults come from events.txt:
 *   - Airdrop: 2 h cadence, 300-block circle, 35 min runtime
 *     (20 prep + 10 landing + 5 finale).
 *   - King of the Hill: 5 h cadence, ~200-block circle, 30 min run.
 *
 * Tweakable per-server via the admin /dashboard/events config form.
 */

export const EVENT_TYPES = ['airdrop', 'koth'] as const;
export type EventTypeName = (typeof EVENT_TYPES)[number];

export type EventConfigDto = {
  type: EventTypeName;
  enabled: boolean;
  intervalMinutes: number;
  durationMinutes: number;
  radiusBlocks: number;
  payload: Record<string, unknown>;
};

export const EVENT_DEFAULTS: Record<EventTypeName, EventConfigDto> = {
  airdrop: {
    type: 'airdrop',
    enabled: true,
    intervalMinutes: 120,
    durationMinutes: 35,
    radiusBlocks: 300,
    payload: {
      prepMinutes: 20,
      landingMinutes: 10,
      finaleMinutes: 5,
      spawnRadiusBlocks: 10_000,
      crashCommebackSeconds: 30,
      teammateCommebackMinutes: 3,
      lootCollectionMinutes: 5,
      minClansOnline: 2,
      minPlayersPerClanOnline: 2,
    },
  },
  koth: {
    type: 'koth',
    enabled: true,
    intervalMinutes: 300,
    durationMinutes: 30,
    radiusBlocks: 200,
    payload: {
      structureId: 'koth/default',
      minClansOnline: 2,
      minPlayersPerClanOnline: 2,
    },
  },
};

/**
 * Validates an event config body coming from a PUT request. Returns
 * a clean DTO on success, an error string on failure. Keeps the
 * route handler small + the validation rules visible in one place.
 */
export function validateEventConfig(
  body: unknown,
): { ok: true; value: EventConfigDto } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'body must be an object' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.type !== 'string' || !EVENT_TYPES.includes(b.type as EventTypeName)) {
    return { ok: false, error: `type must be one of: ${EVENT_TYPES.join(', ')}` };
  }
  const intInRange = (v: unknown, lo: number, hi: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

  if (typeof b.enabled !== 'boolean') {
    return { ok: false, error: 'enabled must be a boolean' };
  }
  if (!intInRange(b.intervalMinutes, 5, 7 * 24 * 60)) {
    return { ok: false, error: 'intervalMinutes must be 5..10080' };
  }
  if (!intInRange(b.durationMinutes, 1, 12 * 60)) {
    return { ok: false, error: 'durationMinutes must be 1..720' };
  }
  if (!intInRange(b.radiusBlocks, 10, 5_000)) {
    return { ok: false, error: 'radiusBlocks must be 10..5000' };
  }
  const payload =
    typeof b.payload === 'object' && b.payload !== null
      ? (b.payload as Record<string, unknown>)
      : {};

  return {
    ok: true,
    value: {
      type: b.type as EventTypeName,
      enabled: b.enabled,
      intervalMinutes: b.intervalMinutes,
      durationMinutes: b.durationMinutes,
      radiusBlocks: b.radiusBlocks,
      payload,
    },
  };
}
