import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDirs() {
  const uploadDir = process.env.UPLOAD_DIR ?? './data/capes';
  const dataDir = path.dirname(process.env.AUDIT_LOG ?? './data/audit.log');
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
}

export function capeFilePath(clanTag: string) {
  return path.join(process.env.UPLOAD_DIR ?? './data/capes', `${clanTag.toUpperCase()}.png`);
}

export async function appendAudit(line: string) {
  const file = process.env.AUDIT_LOG ?? './data/audit.log';
  await fs.appendFile(file, `${new Date().toISOString()}\t${line}\n`, 'utf8');
}
