# Clan Capes

A three-part Minecraft clan-management system for Paper servers. A web panel
owns all data; a Paper plugin consumes it on the game server; a Fabric client
mod paints clan cosmetics onto other players.

> Repo: <https://github.com/nitzlover/clan-capes>

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │   WEB PANEL (Next.js 15)     │
                    │   Railway · Postgres · JWT   │
                    │   = SOURCE OF TRUTH          │
                    └──────────────┬──────────────┘
        /api/plugin/*  ▲           │           ▲  /api/player/* (public)
       (Bearer api-key)│           │           │  (cape + trim specs)
                       │           │           │
            ┌──────────┴─────┐     │     ┌──────┴───────────┐
            │  PAPER PLUGIN  │     │     │   FABRIC MOD     │
            │  (server-side) │     │     │   (each client)  │
            │  Java 25       │     │     │  capes + trims   │
            │  poll + heartbt│     │     │  via mixins      │
            └────────────────┘     │     └──────────────────┘
                          ┌────────┴────────┐
                          │  ADMIN browser  │  Bearer JWT (localStorage)
                          │  LEADER browser │  clp_session cookie
                          └─────────────────┘
```

**The one rule:** the panel owns all data. The plugin holds no DB — it polls
the panel and caches in memory. The mod reads two public endpoints to render
cosmetics client-side. The schema is multi-tenant (`server_id` everywhere) so
one panel hosts many MC servers.

---

## Components

### 1. Web panel — `src/` (Next.js 15, App Router)
- **Stack:** Next.js 15.1 / React 19, Tailwind 3.4, Postgres via `pg` + Drizzle
  ORM, `jsonwebtoken` (HS256) + `bcryptjs`, `sharp` (cape PNG validate/re-encode),
  `skinview3d` + Three.js (3D previews).
- **Surfaces:** admin dashboard (overview, servers, clans, capes, banners,
  events, audit, leaderboard, settings) + leader self-service `/clan-panel`.
- **Hosting:** Railway, multi-stage Dockerfile on `node:22-slim`, port 3000,
  migrate-on-start (`tsx scripts/migrate.ts && exec next start`), persistent
  volume at `/app/data` for cape PNGs + audit log.
- **Live:** <https://clan-capes-production.up.railway.app>

### 2. Paper plugin — `paper-plugin/` (Java 25, Paper 26.1.2)
- Panel-consumer: 6 polling repos + heartbeat + `PanelClient`. No DB.
- Commands: `/clancape` (setup / link / reload / event / debug),
  `/clan` (create, info, list, leave, kick, promote, demote, transfer,
  color, disband, invite, accept, decline, panel, menu), `/clanc` (clan chat).
- Server-side cosmetics: armour trims + banner-shields written as real vanilla
  NBT (every viewer sees them, modded or not).
- PvP events: Airdrop + King-of-the-Hill with an operator test harness.
- Build: `./gradlew shadowJar` → `build/libs/ClanCapes-<ver>.jar`.

### 3. Fabric mod — `fabric-mod/` (client-side, MC 26.1.2)
- Paints custom clan capes + armour trims onto other players via mixins on the
  state-based render pipeline. Reads `GET /api/player/{uuid}` + `/trims`.
- Build: `./gradlew build` → `build/libs/clan-capes-fabric-<ver>.jar`.

---

## Auth model — four identities

| Identity | Mechanism | Used for |
|---|---|---|
| Admin | HS256 JWT in `localStorage` (12h) | `/dashboard/*`, `/api/panel/*` |
| Leader | `clp_session` HttpOnly cookie (12h) | `/clan-panel/[tag]`, `/api/leader/*` |
| Plugin | `Authorization: Bearer ck_live_…` | `/api/plugin/*` |
| Setup | one-time `setup_…` token (15 min) | server registration |

---

## Quick start

### Panel (local dev)
```bash
npm install
npm run dev            # http://localhost:3000
npm run db:generate    # new migration from schema diff
npm run db:migrate     # apply migrations
npm run build && npm start
```

### Register a new MC server
1. Install `ClanCapes-<ver>.jar` into the server's `plugins/`.
2. Set `panel.url` in `plugins/ClanCapes/config.yml`.
3. In-game: `/clancape setup <ServerName>` → click the printed `setup_` token to copy.
4. Panel → `/dashboard/servers` → Register → paste token → copy the `ck_live_` key.
5. In-game: `/clancape link ck_live_…`. Heartbeat + polling start.

### Deploy
- **Panel:** push `deploy/railway` → Railway auto-builds (migrate-on-start runs
  migrations before serving).
- **Plugin:** `./gradlew shadowJar`, upload jar to each server's `plugins/`,
  restart. Set Railway env `PLUGIN_LATEST_VERSION` to fire the in-game
  update nag; `PLUGIN_DOWNLOAD_URL` enables client-side auto-download to
  `plugins/update/`.
- **Mod:** distribute the jar to players (no auto-update channel yet).

---

## Branch map

| Branch | Role |
|---|---|
| `deploy/railway` | **LIVE panel** deployed to Railway. |
| `master` | Full repo incl. plugin source. |
| `work/1.0.1` … `work/1.1.0` | Per-release plugin work branches off master. |

---

## Versioning

Every plugin change bumps `version` in `paper-plugin/build.gradle.kts` **and**
`DEFAULT_VERSION` in `src/app/api/plugin/version/route.ts`. Semver-ish:
patch = fix, minor = new mechanic/command, major = breaking config/API change.

---

## Changelog — 2026-05-30 → 2026-05-31

### Plugin
- **1.0.1** — clickable chat (Adventure `ClickEvent`) for the setup token,
  leader URL, and update-download URL; token also mirrored to the console.
- **1.0.2** — `/clancape event start|stop|status|reset` operator test harness,
  `/clancape debug on|off|status` runtime toggle, `test:` config block
  (bypass-cooldown / bypass-online-threshold / fast-mode / zone overrides).
- **1.0.3** — 17-fix bug-and-UX pass from an independent review: event-aware
  scoreboard title + winner banner, declared `clancapes.admin`, FINALE timer
  on the scoreboard, both `crashComeback` spellings accepted, `EventBoundary`
  CAS, "?" winner guard, cooldown only consumed on launch, `/clanc` self-echo,
  `OfflinePlayer.hasPlayedBefore` gate, `CompletionException` unwrap,
  eliminated-participant chat broadcast, dead-code removal.
- **1.0.4** — un-stubbed `/clan promote|demote|color|disband` (panel routes
  already existed; wired `PanelClient.updateMemberRole/updateClan/deleteClan`).
- **1.0.5** — clan **invitation system** end-to-end: `/clan invite|accept|decline`
  with clickable hints + on-join pending-invite nag, four panel routes,
  migration 0010 (partial indexes on `clan_invitations`).
- **1.0.6** — **server-side trim NBT** + `/clan shield` banner branding written
  as real vanilla components; `ClanArmorListener` reconciles trims on equip.
- **1.0.7** — shield **auto-branding** on hotbar/swap/pickup/join via
  `ClanShieldStamper` + `ClanShieldListener`.
- **1.0.8** — hotfix: `PlayerArmorChangeEvent` is deprecated in Paper 26.1.2 →
  switched to `EntityEquipmentChangedEvent`; explicit inventory write-back
  (Paper returns defensive copies).
- **1.0.9** — white-shield root fix: panel sends legacy Bukkit pattern short
  codes, MC 26 registry needs full snake-case keys → `LEGACY_TO_MODERN_KEY`
  map + refuse-stamp-on-empty; plus a 10-item audit batch.
- **1.0.10** — 4-subagent audit synthesis, 8 production blockers (shield
  content+marker short-circuit, offline-participant elimination, KotH glowstone
  restore, setup-token chat-relay leak, cross-tenant invite wipe, disband cape
  cleanup, tag-regex consistency, overview activity card).
- **1.0.11** — semver-aware update check (was firing on downgrade) +
  auto-download to Paper's `plugins/update/`.
- **1.0.12** — `/clan create` NPE: panel built its response DTO from a fresh
  connection inside the insert tx (read-committed isolation hid the rows) →
  build the DTO from `RETURNING` instead.
- **1.1.0** — **shared clan cure discount**: when a member cures a zombie
  villager, the `MAJOR_POSITIVE` trade gossip is mirrored onto every clan
  member's UUID on that villager, so the whole clan gets the cheaper prices.
  `ClanCureListener` + `clan-perks.shared-cure-discount` config.

### Fabric mod
- **1.0.1** — fixed the baked stale API URL (retired embedded REST endpoint) →
  points at the Railway panel; auto-migrates old configs.
- **1.0.2** — dropped split-environment source sets that made loom 1.16 emit a
  `Fabric-Loom-Client-Only-Entries` manifest header older loaders misread,
  stripping every mixin class (startup `ClassNotFoundException`).
- **1.0.3** — fixed trims not rendering on MC 26.1's state-based pipeline:
  re-targeted the hook from the deleted `HumanoidArmorLayer.renderArmorPiece`
  signature to `AvatarRenderer.extractRenderState`, mutating the render state's
  equipment stacks.

### Panel
- **1.0.13** — multi-server unification: `SelectedServerContext` +
  `useSelectedServer()` hook, global `<ServerPicker>`, URL `?server=` sync +
  localStorage persistence, every dashboard route scope-aware with explicit
  "select a server" empty states + "all servers" aggregation option.
- **1.0.14** — redesign to a modern dark aesthetic (rounded cards, soft
  shadows, lowercase semibold type, pill buttons, backdrop-blur topbar) while
  keeping the strict B&W palette.
- **1.0.15** — form-control redesign: iOS-style toggle switch, popover
  primitives, soft inputs; fixed undefined `brutal-input`/`brutal-btn` classes
  that were rendering bare.
- **1.0.16** — replaced every native `<select>` (whose OS-painted option list
  broke the monochrome theme with a blue highlight) with a custom B&W
  `<Select>` listbox component (full keyboard + ARIA).
- **1.0.16b** — fixed `/api/panel/clans/options` and `/api/panel/clans` (the
  banner-editor + cape-page clan dropdowns and roster) ignoring the server
  picker and always showing the newest server's clans; threaded `serverId`
  through `UploadSection`.

### Removed
- Experimental UI prototype trees (`src/app/{login-preview,studio,avagen,p}`,
  `src/app/api/skin`) excluded from the build — WIP routes with type errors
  that were accidentally swept into the repo.

---

## Project notes

Internal docs (architecture deep-dives, event mechanics, deploy quirks,
versioning process, known issues) live in an Obsidian vault outside the repo,
not committed here.
