import { Router } from 'express';
import fs from 'node:fs/promises';
import multer from 'multer';
import { requireAuth } from '../lib/auth.js';
import { validateAndNormalizePng } from '../lib/capeValidate.js';
import * as mc from '../lib/minecraft.js';
import { getCdnPublicUrl } from '../lib/public-url.js';
import { appendAudit, capeFilePath } from '../lib/storage.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_KB) || 256) * 1024 },
});

export const clansRouter = Router();
clansRouter.use(requireAuth);

/** PowerClans clans for upload dropdown (tag = short tag from data.yml). */
clansRouter.get('/options', async (_req, res) => {
  const dir = process.env.UPLOAD_DIR ?? './data/capes';
  let capeTags = new Set<string>();
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.png'));
    capeTags = new Set(files.map((f) => f.replace(/\.png$/i, '').toUpperCase()));
  } catch {
    capeTags = new Set();
  }

  try {
    const powerClans = await mc.fetchPowerClans();
    const clans = powerClans.map((c) => ({
      id: c.id,
      tag: c.tag,
      leader: c.leader,
      level: c.level,
      hasCape: capeTags.has(c.tag.toUpperCase()),
    }));
    res.json({ clans });
  } catch (e) {
    res.status(502).json({
      error: e instanceof Error ? e.message : 'Failed to load PowerClans (is Paper API running?)',
    });
  }
});

clansRouter.get('/', async (_req, res) => {
  // Panel list: scan local CDN dir + optional Minecraft API enrichment
  const dir = process.env.UPLOAD_DIR ?? './data/capes';
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.png'));
  } catch {
    files = [];
  }
  const cdn = getCdnPublicUrl();
  const clans = await Promise.all(
    files.map(async (file) => {
      const tag = file.replace(/\.png$/i, '');
      const stat = await fs.stat(`${dir}/${file}`);
      let remote = null;
      try {
        remote = await mc.fetchClan(tag);
      } catch {
        /* ignore */
      }
      return {
        tag,
        capeUrl: `${cdn}/${file}`,
        updatedAt: remote?.updatedAt ?? stat.mtimeMs,
        updatedBy: remote?.updatedBy ?? 'panel',
      };
    })
  );
  res.json({ clans });
});

clansRouter.get('/:tag', async (req, res) => {
  const tag = String(req.params.tag).toUpperCase();
  const data = await mc.fetchClan(tag);
  if (!data) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(data);
});

clansRouter.post('/:tag/cape', upload.single('cape'), async (req, res) => {
  const tag = String(req.params.tag).toUpperCase();
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'cape file required' });
    return;
  }
  try {
    const powerClans = await mc.fetchPowerClans().catch(() => null);
    if (powerClans && powerClans.length > 0) {
      const known = powerClans.some((c) => c.tag.toUpperCase() === tag);
      if (!known) {
        res.status(400).json({
          error: `Clan tag "${tag}" is not in PowerClans. Choose a clan from the list.`,
        });
        return;
      }
    }

    const maxKb = Number(process.env.MAX_UPLOAD_KB) || 256;
    const normalized = await validateAndNormalizePng(file.buffer, maxKb);
    const outPath = capeFilePath(tag);
    await fs.writeFile(outPath, normalized);

    const cdn = getCdnPublicUrl();
    const publicUrl = `${cdn}/${tag}.png`;
    const actor = (req as typeof req & { user?: string }).user ?? 'panel';
    await mc.setClanCape(tag, publicUrl, actor);
    await appendAudit(`${actor}\tUPLOAD\t${tag}\t${publicUrl}`);

    res.json({ ok: true, tag, capeUrl: publicUrl });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'upload failed' });
  }
});

clansRouter.delete('/:tag/cape', async (req, res) => {
  const tag = String(req.params.tag).toUpperCase();
  try {
    await mc.deleteClanCape(tag);
    await fs.unlink(capeFilePath(tag)).catch(() => undefined);
    const actor = (req as typeof req & { user?: string }).user ?? 'panel';
    await appendAudit(`${actor}\tDELETE\t${tag}`);
    res.json({ ok: true, tag });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'delete failed' });
  }
});
