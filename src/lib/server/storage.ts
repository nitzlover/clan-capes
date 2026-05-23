import fs from 'node:fs/promises';
import path from 'node:path';
import { AUDIT_LOG, UPLOAD_DIR } from './env';

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
