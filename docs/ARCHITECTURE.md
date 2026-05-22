# Clan Capes — Architecture

## Overview

```
┌─────────────┐     GET /api/player/{uuid}      ┌──────────────────┐
│ Fabric Mod  │ ──────────────────────────────► │ Paper Plugin     │
│ (client)    │                                 │ REST :8080       │
└─────────────┘                                 │ SQLite / JSON    │
       │                                        │ PowerClans hook  │
       │ async PNG download                     └────────┬─────────┘
       ▼                                                 │
┌─────────────┐         POST /api/clan/{tag}/cape        │
│ Local cache │ ◄────────────────────────────────────────┤
│ + GPU tex   │         CDN URL in response              │
└─────────────┘                                          ▼
                                                ┌──────────────────┐
                                                │ Web Panel API    │
                                                │ Express :3001    │
                                                └────────┬─────────┘
                                                         │
                                                ┌────────▼─────────┐
                                                │ Next.js Panel    │
                                                │ Upload / audit   │
                                                └──────────────────┘
```

## Design goals (Essential / Lunar / OptiFine style)

| Goal | Implementation |
|------|----------------|
| Native cape look | Mixin into `CapeLayer` texture lookup — vanilla physics & Elytra unchanged |
| Client-only cosmetics | No server world changes; EULA-safe cosmetic layer |
| Non-blocking IO | `HttpClient` + thread pool; texture register on client thread |
| Scale | Per-URL disk cache, TTL, concurrent download limit |
| Hot reload | `updatedAt` bump invalidates cache; 60s polling + plugin sync channel |

## Fabric mod (26.1)

- **Mappings**: Mojang official (26.1 unobfuscated, no Yarn)
- **Loom**: `net.fabricmc.fabric-loom` (no remap)
- **Java**: 25 (Gradle + compile target for MC 26.1)

Modules:

- `CapeManager` — orchestration, refresh loop
- `CapeApiClient` — player metadata
- `CapeDownloader` — PNG fetch + validation
- `CapeTextureCache` — disk + `DynamicTexture`
- `CapeLayerMixin` — render hook

## Paper plugin

- Embedded **Javalin** REST on port 8080 (configurable)
- **SQLite** default storage (+ JSON fallback)
- **PowerClans** reflective API for clan tag
- **PlaceholderAPI** `%clancapes_*%`
- **Plugin channel** `clancapes:sync` for optional instant reload push

## Web panel

- **Next.js** admin UI (login, list, upload, preview, audit)
- **Express** validates PNG via `sharp`, re-encodes, syncs to Paper API
- Static capes at `/static/capes/{CLAN}.png`

## Cache invalidation

1. Server sets new `updatedAt` on cape change
2. Client poll sees `updatedAt` change → invalidate URL cache → re-download
3. Plugin message `reload` (optional) forces immediate refetch for online players

## EULA note

Custom clan capes are **client-side cosmetics** visible only to players using the mod. They do not grant gameplay advantages and do not modify Mojang account capes.
