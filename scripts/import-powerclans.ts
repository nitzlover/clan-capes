/**
 * One-shot PowerClans data.yml → Postgres import.
 *
 * Reads the PowerClans plugin's local data.yml off the game server
 * filesystem (or any path passed via --file) and seeds the clans +
 * clan_members tables with the existing roster. Idempotent: re-runs
 * are no-ops because we skip tags that already exist active on the
 * target server.
 *
 * Usage:
 *   DATABASE_URL=... \
 *   tsx scripts/import-powerclans.ts \
 *       --file /path/to/data.yml \
 *       --server <serverId>
 *
 * `--server` is the panel's servers.id, not the game server's name.
 * Pull it from `/dashboard/servers` or `SELECT id, name FROM servers`.
 *
 * data.yml shape (PowerClans 1.0):
 *   clans:
 *     KING:
 *       name: "King Clan"
 *       leader: "<uuid>"
 *       members:
 *         - uuid: "<uuid>"
 *           name: "Player1"
 *         - uuid: "<uuid>"
 *           name: "Player2"
 *
 * The parser is permissive — accepts {leader: <uuid>} or
 * {leader: {uuid: <uuid>, name: <name>}}, members as a list of
 * strings (uuids only) or objects with name. Anything it can't parse
 * gets logged and skipped per-clan; the rest still imports.
 */

import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, isNull } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from '../src/lib/server/db/schema';
import {
  allocateUnusedColor,
  isValidTag,
} from '../src/lib/server/clan-validators';

// Minimal YAML-ish parser scoped to PowerClans' specific shape — full
// YAML support is overkill and adds 100 KB of dependency for one
// nested map. PowerClans always writes the same indentation pattern.
function parsePowerClansYaml(text: string): Record<string, RawClan> {
  const out: Record<string, RawClan> = {};
  const lines = text.split(/\r?\n/);

  let inClans = false;
  let currentTag: string | null = null;
  let currentClan: RawClan | null = null;
  let inMembers = false;
  let currentMember: RawMember | null = null;

  const flushMember = () => {
    if (currentMember && currentClan) {
      currentClan.members.push(currentMember);
      currentMember = null;
    }
  };
  const flushClan = () => {
    flushMember();
    if (currentTag && currentClan) {
      out[currentTag] = currentClan;
    }
    currentTag = null;
    currentClan = null;
    inMembers = false;
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.trim().length === 0 || line.trim().startsWith('#')) continue;

    if (line.match(/^clans:\s*$/)) {
      inClans = true;
      continue;
    }
    if (!inClans) continue;

    // top-level tag row: "  KING:" at indent 2
    const tagMatch = line.match(/^\s{2}([A-Za-z0-9_]+):\s*$/);
    if (tagMatch) {
      flushClan();
      currentTag = tagMatch[1].toUpperCase();
      currentClan = { name: currentTag, leaderUuid: null, members: [] };
      inMembers = false;
      continue;
    }
    if (!currentClan) continue;

    if (/^\s{4}members:\s*$/.test(line)) {
      inMembers = true;
      continue;
    }
    if (inMembers) {
      // members entries either `- uuid: <uuid>` and `name: <name>` over
      // two lines, or `- <uuid>` on one line.
      const inlineUuid = line.match(/^\s{6}-\s*([0-9a-fA-F-]{36})\s*$/);
      if (inlineUuid) {
        flushMember();
        currentMember = { uuid: inlineUuid[1], name: null };
        continue;
      }
      const objStart = line.match(/^\s{6}-\s*uuid:\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (objStart) {
        flushMember();
        currentMember = { uuid: objStart[1], name: null };
        continue;
      }
      const nameField = line.match(/^\s{8}name:\s*['"]?([^'"]+)['"]?\s*$/);
      if (nameField && currentMember) {
        currentMember.name = nameField[1].trim();
        continue;
      }
      // anything else at indent 4 or less ends the members block
      if (/^\s{4}[A-Za-z]/.test(line)) {
        flushMember();
        inMembers = false;
        // fall through to the field parser below
      }
    }

    if (!inMembers) {
      const leaderObj = line.match(/^\s{4}leader:\s*$/);
      if (leaderObj) {
        // expect `      uuid: ...` next; we'll catch in subsequent line
        continue;
      }
      const leaderInline = line.match(
        /^\s{4}leader:\s*['"]?([0-9a-fA-F-]{36})['"]?\s*$/,
      );
      if (leaderInline) {
        currentClan.leaderUuid = leaderInline[1];
        continue;
      }
      const leaderNested = line.match(
        /^\s{6}uuid:\s*['"]?([0-9a-fA-F-]{36})['"]?\s*$/,
      );
      if (leaderNested && currentClan && !currentClan.leaderUuid) {
        currentClan.leaderUuid = leaderNested[1];
        continue;
      }
      const nameField = line.match(/^\s{4}name:\s*['"]?(.+?)['"]?\s*$/);
      if (nameField) {
        currentClan.name = nameField[1].trim();
      }
    }
  }
  flushClan();
  return out;
}

type RawClan = {
  name: string;
  leaderUuid: string | null;
  members: RawMember[];
};
type RawMember = { uuid: string; name: string | null };

function parseArgs(): { file: string; serverId: number } {
  let file = '';
  let serverId = 0;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') file = argv[++i];
    else if (a === '--server' || a === '-s') serverId = Number(argv[++i]);
  }
  if (!file || !serverId) {
    console.error('Usage: tsx scripts/import-powerclans.ts --file <data.yml> --server <id>');
    exit(1);
  }
  return { file, serverId };
}

async function main() {
  const { file, serverId } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL required');
    exit(1);
  }

  const text = readFileSync(file, 'utf8');
  const parsed = parsePowerClansYaml(text);
  const tags = Object.keys(parsed);
  console.log(`[import] parsed ${tags.length} clans from ${file}`);

  const pool = new Pool({
    connectionString: url,
    ssl:
      process.env.NODE_ENV === 'production'
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',
          }
        : false,
  });
  const db = drizzle(pool, { schema });

  let imported = 0;
  let skipped = 0;
  for (const tag of tags) {
    const raw = parsed[tag];
    if (!isValidTag(tag)) {
      console.warn(`[import] skip ${tag}: invalid tag shape`);
      skipped++;
      continue;
    }
    if (!raw.leaderUuid) {
      console.warn(`[import] skip ${tag}: no leader uuid`);
      skipped++;
      continue;
    }
    // Idempotency: skip if an active clan with this tag already exists
    // on the target server.
    const [existing] = await db
      .select({ id: schema.clans.id })
      .from(schema.clans)
      .where(
        and(
          eq(schema.clans.serverId, serverId),
          eq(schema.clans.tag, tag),
          isNull(schema.clans.disbandedAt),
        ),
      )
      .limit(1);
    if (existing) {
      console.log(`[import] skip ${tag}: already imported`);
      skipped++;
      continue;
    }

    const color = await allocateUnusedColor(serverId);
    if (!color) {
      console.warn(`[import] palette exhausted at ${tag}; stopping`);
      break;
    }

    const [clan] = await db
      .insert(schema.clans)
      .values({
        serverId,
        tag,
        name: raw.name || tag,
        colorHex: color,
        leaderUuid: raw.leaderUuid,
      })
      .returning();

    const leaderName =
      raw.members.find((m) => m.uuid === raw.leaderUuid)?.name ?? 'Leader';
    await db.insert(schema.clanMembers).values({
      clanId: clan.id,
      serverId,
      playerUuid: raw.leaderUuid,
      playerName: leaderName,
      role: 'leader',
    });
    for (const m of raw.members) {
      if (m.uuid === raw.leaderUuid) continue;
      await db.insert(schema.clanMembers).values({
        clanId: clan.id,
        serverId,
        playerUuid: m.uuid,
        playerName: m.name ?? 'Member',
        role: 'member',
      });
    }
    console.log(
      `[import] inserted ${tag}: leader ${raw.leaderUuid}, ${raw.members.length} members, color ${color}`,
    );
    imported++;
  }

  console.log(`[import] done: ${imported} imported, ${skipped} skipped`);
  await pool.end();
}

main().catch((err) => {
  console.error('[import] failed:', err);
  exit(1);
});
