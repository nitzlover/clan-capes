import fs from 'node:fs/promises';
import path from 'node:path';
import { AUDIT_LOG, MOD_DIR, PLUGIN_DIR, UPLOAD_DIR } from './env';

let ensured = false;

export async function ensureDirs() {
  if (ensured) return;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(path.dirname(AUDIT_LOG), { recursive: true });
  ensured = true;
}

export function capeFilePath(clanTag: string) {
  return path.join(UPLOAD_DIR, `${clanTag.toUpperCase()}.png`);
}

// ---- Client-mod jar distribution (Railway Volume, no CDN) ----

export type ModLatest = {
  version: string;
  filename: string;
  size: number;
  uploadedAt: string;
};

export async function ensureModDir() {
  await fs.mkdir(MOD_DIR, { recursive: true });
}

/** Resolve a jar path inside MOD_DIR, basename-only to block traversal. */
export function modJarPath(filename: string) {
  return path.join(MOD_DIR, path.basename(filename));
}

function modLatestJsonPath() {
  return path.join(MOD_DIR, 'latest.json');
}

export async function readModLatest(): Promise<ModLatest | null> {
  try {
    const raw = await fs.readFile(modLatestJsonPath(), 'utf8');
    const meta = JSON.parse(raw) as ModLatest;
    return meta && typeof meta.version === 'string' && typeof meta.filename === 'string'
      ? meta
      : null;
  } catch {
    return null;
  }
}

export async function writeModLatest(meta: ModLatest) {
  await ensureModDir();
  await fs.writeFile(modLatestJsonPath(), JSON.stringify(meta), 'utf8');
}

// ---- Paper plugin jar distribution (same Volume, direct-200 download) ----

/** Same shape as ModLatest — version + on-disk filename + size + timestamp. */
export type PluginLatest = ModLatest;

export async function ensurePluginDir() {
  await fs.mkdir(PLUGIN_DIR, { recursive: true });
}

/** Resolve a jar path inside PLUGIN_DIR, basename-only to block traversal. */
export function pluginJarPath(filename: string) {
  return path.join(PLUGIN_DIR, path.basename(filename));
}

function pluginLatestJsonPath() {
  return path.join(PLUGIN_DIR, 'latest.json');
}

export async function readPluginLatest(): Promise<PluginLatest | null> {
  try {
    const raw = await fs.readFile(pluginLatestJsonPath(), 'utf8');
    const meta = JSON.parse(raw) as PluginLatest;
    return meta && typeof meta.version === 'string' && typeof meta.filename === 'string'
      ? meta
      : null;
  } catch {
    return null;
  }
}

export async function writePluginLatest(meta: PluginLatest) {
  await ensurePluginDir();
  await fs.writeFile(pluginLatestJsonPath(), JSON.stringify(meta), 'utf8');
}

export async function appendAudit(line: string) {
  await ensureDirs();
  await fs.appendFile(AUDIT_LOG, `${new Date().toISOString()}\t${line}\n`, 'utf8');
}

export async function readAudit(limit = 200) {
  try {
    const raw = await fs.readFile(AUDIT_LOG, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean).slice(-limit).reverse();
    return lines.map((line) => {
      const [ts, ...rest] = line.split('\t');
      return { timestamp: ts, raw: rest.join('\t') };
    });
  } catch {
    return [];
  }
}
