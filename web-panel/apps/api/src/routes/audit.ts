import { Router } from 'express';
import fs from 'node:fs/promises';
import { requireAuth } from '../lib/auth.js';

export const auditRouter = Router();
auditRouter.use(requireAuth);

auditRouter.get('/', async (_req, res) => {
  const file = process.env.AUDIT_LOG ?? './data/audit.log';
  try {
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean).slice(-200).reverse();
    res.json({
      entries: lines.map((line) => {
        const [ts, ...rest] = line.split('\t');
        return { timestamp: ts, raw: rest.join('\t') };
      }),
    });
  } catch {
    res.json({ entries: [] });
  }
});
