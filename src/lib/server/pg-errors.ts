/**
 * Postgres error-code helpers.
 *
 * Drizzle surfaces raw `pg` errors with a `code` field — these are the
 * SQLSTATE strings from the libpq protocol. Two we care about today:
 *   - 23505 unique_violation: a partial-unique index caught a race
 *     between our application-layer pre-check and the actual write.
 *   - 23503 foreign_key_violation: a child row references a missing
 *     parent; shouldn't happen in steady state but worth a 409 rather
 *     than a 500 when it does.
 *
 * Both map to "client should retry or accept the existing state" — i.e.
 * 409 Conflict — rather than 500 Server Error, which keeps the panel UI
 * from screaming about server-side bugs that are really just
 * concurrency edge cases.
 */
export function isUniqueViolation(err: unknown): boolean {
  return isPgError(err) && err.code === '23505';
}

export function isForeignKeyViolation(err: unknown): boolean {
  return isPgError(err) && err.code === '23503';
}

export function isPgError(err: unknown): err is { code: string; message?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

/** Friendly hint from a constraint name; falls back to a generic message. */
export function uniqueConstraintHint(err: unknown): string {
  if (!isPgError(err)) return 'duplicate value rejected by database';
  const msg = err.message ?? '';
  if (msg.includes('clans_active_color_idx')) {
    return 'colour already in use by another active clan on this server';
  }
  if (msg.includes('clan_members_active_player_idx')) {
    return 'player is already an active member of a clan on this server';
  }
  if (msg.includes('clans_tag_per_server_idx')) {
    return 'clan tag already taken on this server';
  }
  return 'duplicate value rejected by database';
}
