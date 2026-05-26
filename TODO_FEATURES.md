# Backlog — postponed features

Captured 2026-05-26 after the Wave 1–4 brainstorm. Order inside each
wave is roughly "small + cheap" → "large + invasive". Strike through
or move into `## Shipped` as items land.

---

## Wave 1 — Quick wins (frontend)

- **Toast notifications.** Provider in `src/app/layout.tsx`, `useToast()`
  hook, `<Toast kind="ok|err" text>` slide-in top-right via Framer
  Motion, auto-dismiss 3 s. Replaces inline `msg` state in
  ClanEditor / ArmorTrimEditor / BannerEditor.
- **Clan list search.** Text input above the clan table on
  `/dashboard/clans` filtering by tag + name (substring, case-
  insensitive). Live on `onChange`.
- **Pulse online dot animation.** CSS keyframe pulse 1 s on the
  online indicator when count changes. Framer Motion
  `<AnimatePresence>` `initial/exit` for slide-in on new member rows.
- **Welcome wizard.** Route `/dashboard/welcome`, 4 steps (intro →
  register server → wait heartbeat → configure defaults).
  `localStorage.cc_wizard_done` skip. Auto-redirect from `/dashboard`
  when `servers.length === 0` and no flag set.
- **Per-clan KPI strip.** Compact chip row under the clan tag in the
  expanded ClanEditor header: `[K/D 0.84] [12/18 67%] [4/4 trims]
  [banner ✓] [age 47d] [edit 2h]`. Data: stats cache, online cache,
  armor-trims fetch, banner cache, `clan.createdAt`, audit.

## Wave 1 — Plugin

- **Expanded PAPI placeholders.** Extend `PlaceholderExpansionImpl`:
  - `%clancapes_trim_<slot>_material%` / `%clancapes_trim_<slot>_pattern%`
  - `%clancapes_online_ratio%` → `12/45`
  - `%clancapes_online_percent%` → `26`
  - `%clancapes_clan_size%`
  - `%clancapes_clan_kd_season%` / `%clancapes_clan_kd_lifetime%`
  - `%clancapes_clan_kills_season%` / `%clancapes_clan_deaths_season%`
  - `%clancapes_clan_color_hex%`
  - `%clancapes_member_role%` → leader/deputy/member
  - `%clancapes_last_action%` → "2m ago" (latest audit row for clan)

---

## Wave 2 — DB-backed features

- **Migration 0008.** Three additions in one migration:
  - `clan_announcements (clan_id PK, body text, updated_at,
    updated_by)` — single row per clan.
  - `clan_member_trims (clan_id, player_uuid, slot, material,
    pattern, updated_at, updated_by)` composite PK.
  - `clans.friendly_fire boolean default true` (or
    `clans.settings.friendly_fire` JSON if we keep settings together).
- **Endpoints (6).** Admin + leader CRUD for announcement, per-
  member trim, friendly-fire toggle. Audit every write.
- **Plugin reads.**
  - `AnnouncementRepository` (new) polling
    `/api/plugin/announcements` every 5 min.
  - Extend `ArmorTrimRepository` resolver chain: per-member →
    clan-wide → none. ArmorTrimListener walks the chain.
  - `ClanRepository` exposes `friendlyFire` flag from `/api/plugin/
    clans`.
- **UI.**
  - Sticky announcement banner at the top of `/clan-panel/[tag]` +
    edit form for leader/deputy.
  - Per-member inline trim picker (mini Variant-4 panel) on the
    member row, gated behind an "Override" toggle.
  - Friendly-fire switch in the admin clan editor.

---

## Wave 3 — Plugin gameplay (Java)

- **Friendly-fire damage cancel.** `EntityDamageByEntityEvent`
  listener: both players in the same clan + `friendlyFire == true`
  → `event.setCancelled(true)`. Skip mob → mob damage.
- **Clan-aware death messages.** `PlayerDeathEvent` rewrites
  `event.deathMessage()` with bracketed clan tags prefixed to both
  victim + killer; red tinge if killer + victim share a clan.
- **In-game chest GUI.** `/clan menu` opens a 6-row inventory with
  named items per command (Members / Banner / Trims / Stats /
  Invite / Leave). Click handler routes into the existing
  `ClanCommand` paths.
- **Plugin self-update channel.** Plugin polls
  `/api/plugin/version` returning `{ latest, downloadUrl }`. If
  newer than `getDescription().getVersion()`, log warning + render a
  banner inside `/clan admin`. Manual download — never auto-replace
  (too risky for a Bukkit hot-swap).

---

## Wave 4 — Heavy frontend

- ~~**3D row members.**~~ (in progress — see `MemberCard3D`)
- **Cape preview with trim composited.** Skip — cape texture has
  no armour UV regions, so trims can't be composed onto a cape.
  Left here as a reminder so it doesn't get re-suggested.
- **Dashboard overview revamp.** New `/dashboard` index with KPI
  grid (servers count, total clans, members, kills MTD, capes
  assigned). Simple `<div>` cards — no recharts dep just for
  sparklines.
- **Audit log searchable UI.** New `/dashboard/audit` (or extend
  existing) with filters: action type / actor / target / date range
  / pagination. Endpoint already lives at `/api/panel/audit`.
- **Clan activity feed.** Component embedded in the expanded
  ClanEditor. Reads `/api/panel/audit?target={clan.tag}`. Chrono
  list with action-typed icons.
- **Mobile responsive pass.** Audit existing grids on
  `/dashboard/clans`, `/clan-panel/[tag]`, `/dashboard/capes`.
  Replace `md:` breakpoints with `sm:` where the layout collapses
  poorly.
- **WebSocket / SSE online state.** Replace the 30 s
  `/api/panel/online` poll with a server-sent event stream from the
  panel. Plugin → panel `POST /api/plugin/online-delta` on join /
  leave. ENV flag `ONLINE_STREAM=disabled` falls back to polling.

---

## Out of scope / explicitly skipped

- Auto-replace plugin jar on update — operator must approve.
- Recharts / Chart.js for dashboard sparklines — extra ~30 KB for
  visual sugar, build simple bar divs instead.
- Per-member trim has no current use case for the only live clan.
  Re-open when a clan asks for distinct member trims.
- Welcome wizard — single-server deployment doesn't need it.
