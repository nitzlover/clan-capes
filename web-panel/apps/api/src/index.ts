import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { clansRouter } from './routes/clans.js';
import { auditRouter } from './routes/audit.js';
import { ensureDirs } from './lib/storage.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3001);

await ensureDirs();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'] }));
app.use(express.json({ limit: '32kb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// Request logger — every API hit logs method, path, status, latency (omits health spam).
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const ip = req.ip ?? req.socket.remoteAddress ?? '-';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms ip=${ip}`);
  });
  next();
});

const staticCapes = path.resolve(process.env.UPLOAD_DIR ?? './data/capes');
app.use('/static/capes', express.static(staticCapes, {
  maxAge: '7d',
  immutable: true,
  fallthrough: false,
}));

const staticTemplates = path.resolve(__dirname, '../assets/cape');
app.use('/static/templates', express.static(staticTemplates, {
  maxAge: '30d',
  immutable: true,
}));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRouter);
app.use('/panel/clans', clansRouter);
app.use('/panel/audit', auditRouter);

app.listen(port, () => {
  console.log(`Clan Capes API listening on http://localhost:${port}`);
});
