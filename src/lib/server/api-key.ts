/**
 * API-key utilities for plugin ↔ panel auth.
 *
 * Two tokens flow through Phase 1's one-time-pass setup:
 *
 *   1. setup_token — short-lived (15 min), single-use. The plugin's
 *      `/clancapes setup` command generates one, POSTs it to the panel
 *      so the panel knows it exists, and prints the plaintext to the
 *      operator's chat exactly once. An admin then pastes it into
 *      the panel's "Register server" modal to consume it.
 *
 *   2. api_key — long-lived, per-server credential issued by the
 *      panel when a setup_token is consumed. The plugin stores it in
 *      config.yml and sends it as `Authorization: Bearer <api_key>`
 *      on every subsequent request.
 *
 * Both are stored as bcrypt hashes — the plaintext is shown to the
 * operator exactly once at creation time and never persisted.
 *
 * The format is identical (a URL-safe base64 of 32 random bytes), but
 * the prefix tells humans which is which at a glance:
 *
 *   setup_<43 chars>     <- one-time-pass
 *   ck_live_<43 chars>   <- long-lived API key
 */

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const SETUP_PREFIX = 'setup_';
const API_KEY_PREFIX = 'ck_live_';
const BCRYPT_ROUNDS = 10;

/** Generate a fresh one-time-pass setup token. */
export function generateSetupToken(): string {
  return SETUP_PREFIX + base64UrlRandom(32);
}

/** Generate a fresh long-lived API key. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + base64UrlRandom(32);
}

/** True iff `token` matches the setup-token shape. */
export function isSetupToken(token: string): boolean {
  return token.startsWith(SETUP_PREFIX) && token.length === SETUP_PREFIX.length + 43;
}

/** True iff `token` matches the API-key shape. */
export function isApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX) && token.length === API_KEY_PREFIX.length + 43;
}

/** Bcrypt hash for storage. */
export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Constant-time compare via bcrypt. */
export async function verifySecret(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

function base64UrlRandom(bytes: number): string {
  return randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
