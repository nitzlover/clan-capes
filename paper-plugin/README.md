# ClanCapes — Paper plugin

Server-side companion to the ClanCapes panel. Polls the panel for
clan / banner / trim / settings state and exposes PlaceholderAPI
placeholders, three commands, and a heartbeat task so the panel
knows when the server is online.

- **MC target**: 26.1.2 (`api-version: 26.1`)
- **Runtime**: Paper, Java 25
- **Dependencies**: PlaceholderAPI (soft-required for placeholders)

## Build

```bash
cd paper-plugin
./gradlew shadowJar
# → build/libs/ClanCapes-1.0.0.jar
```

## Install

1. Drop `ClanCapes-1.0.0.jar` in `plugins/`
2. Start once → `plugins/ClanCapes/config.yml` is written
3. Edit `panel.url` + `panel.api-key` + `panel.server-name` (or run
   `/clancape setup` on the panel and `/clancape link <token>` in-game)
4. `/clancape reload`

## Commands

| Command | Permission | Description |
|---|---|---|
| `/clancape setup` | `clancapes.admin` | Start one-time-pass register flow with the panel |
| `/clancape link <token>` | `clancapes.admin` | Consume a setup token, store the long-term API key |
| `/clancape reload` | `clancapes.admin` | Re-read `config.yml`, rebuild HTTP client, refresh repos |
| `/clan create <tag> <name>` | — | Create a clan; caller becomes leader |
| `/clan info [tag]` | — | Show clan details + members + season K/D |
| `/clan list` | — | List all clans on this server |
| `/clan leave` | — | Leave your clan; leader must transfer first |
| `/clan kick <player>` | leader/deputy | Remove a member |
| `/clan transfer <player>` | leader | Promote member to leader (you demote to deputy) |
| `/clan panel` | leader | Issue a one-time panel hand-off URL/token |
| `/clanc <message>` | — | Broadcast to online clan members only |

## Config (`plugins/ClanCapes/config.yml`)

```yaml
panel:
  url: "https://your-panel.example.com"
  api-key: "ck_live_xxxxxxxxxxxx"
  server-name: "Crownless"

refresh:
  clans-seconds: 60
  banners-seconds: 120
  trims-seconds: 60
  settings-seconds: 300

heartbeat:
  seconds: 30

debug: false
```

## PlaceholderAPI

Identifier: `clancapes`. Placeholders resolve against the calling
player's active clan membership. Empty string when the player is
not in a clan or the data is not yet cached.

### Identity (5)

| Placeholder | Returns | Example |
|---|---|---|
| `%clancapes_clan_tag%` | Clan tag of the calling player | `KING` |
| `%clancapes_clan_name%` | Clan display name | `Kingdom of the Crown` |
| `%clancapes_clan_color_hex%` | Hex color string for the clan | `#FF8800` |
| `%clancapes_clan_role%` | `leader` / `deputy` / `member` | `leader` |
| `%clancapes_clan_size%` | Member count | `7` |

### Activity (1)

| Placeholder | Returns | Example |
|---|---|---|
| `%clancapes_online_ratio%` | `online/total` online of total members | `3/7` |

### Combat (2)

| Placeholder | Returns | Notes |
|---|---|---|
| `%clancapes_kd_season%` | Clan season K/D, two decimals | `1.42` |
| `%clancapes_kd_lifetime%` | Calling player's lifetime K/D | First call returns `0.00`; subsequent calls hit the cache populated by an async panel fetch |

### Armour trims (8)

Combinatorial: 4 slots × 2 fields. Returns the clan-wide trim spec
for that slot or empty if unset.

| Placeholder | Returns |
|---|---|
| `%clancapes_trim_head_material%` | Helmet trim material (iron/copper/gold/lapis/emerald/diamond/netherite/redstone/amethyst/quartz/resin) |
| `%clancapes_trim_head_pattern%` | Helmet trim pattern (sentry/dune/coast/wild/ward/eye/vex/tide/snout/rib/spire/wayfinder/shaper/silence/raiser/host/flow/bolt) |
| `%clancapes_trim_chest_material%` | Chestplate material |
| `%clancapes_trim_chest_pattern%` | Chestplate pattern |
| `%clancapes_trim_legs_material%` | Leggings material |
| `%clancapes_trim_legs_pattern%` | Leggings pattern |
| `%clancapes_trim_feet_material%` | Boots material |
| `%clancapes_trim_feet_pattern%` | Boots pattern |

**Total: 16 placeholders.**

### Quick test

```
/papi parse <player> %clancapes_clan_tag%
/papi parse <player> %clancapes_online_ratio%
/papi parse <player> %clancapes_trim_chest_pattern%
```

## Caveats

- `kd_lifetime` is async-cached because PAPI's `onRequest` is sync.
  First request after server start returns `0.00`; the panel fetch
  fires in the background and subsequent requests return the cached
  value. Refresh cadence: on every miss, no TTL.
- Trim placeholders return empty until the trim repo has refreshed
  (60 s default cadence after enable). Force a fresh load with
  `/clancape reload`.
- All scheduler tasks use `runTaskTimerAsynchronously`, so panel
  HTTP latency never blocks the main tick thread.

## TODO (planned)

Not yet implemented — see `TODO_FEATURES.md` Wave 1 plugin section:

- `%clancapes_online_percent%` → `26`
- `%clancapes_clan_kills_season%` / `%clancapes_clan_deaths_season%`
- `%clancapes_last_action%` → relative timestamp of the latest audit row for the clan
