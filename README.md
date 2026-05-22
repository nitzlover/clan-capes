# Clan Capes

Production-ready система **кастомных плащей кланов** для Minecraft **26.1** (Fabric client + Paper/Spigot server + Web panel).

Плащи рендерятся через vanilla `CapeLayer` (физика плаща, совместимость с элитрами), видны только игрокам с установленным Fabric-модом. Это **косметика на клиенте** — без изменения аккаунтных плащей Mojang (EULA-safe).

## Структура репозитория

```
clan-capes/
├── fabric-mod/          # Fabric client mod (MC 26.1, Mojang mappings, Java 25)
├── paper-plugin/        # Paper/Purpur plugin (REST API, SQLite, PowerClans)
├── web-panel/           # Next.js + Express (upload, preview, audit)
├── deploy/nginx/        # Опциональный CDN для PNG
├── docker-compose.yml
└── docs/ARCHITECTURE.md
```

## Требования

| Компонент | Версия |
|-----------|--------|
| Minecraft | **26.1** |
| Fabric Loader | ≥ 0.19.2 |
| Fabric Loom | 1.16+ (`net.fabricmc.fabric-loom`) |
| Java (mod) | **25** |
| Java (plugin) | **21+** |
| Paper/Purpur | **26.1** (или совместимый 1.21.x API) |
| Node.js (panel) | 22+ |

> **Важно:** Minecraft 26.1 **не обфусцирован** — Yarn не используется. Мод собирается с **официальными Mojang mappings**.

## Быстрый старт

### 1. Paper plugin

```bash
cd paper-plugin
gradle shadowJar
# JAR: build/libs/clan-capes-paper-1.0.0.jar → plugins/
```

Настройте `plugins/ClanCapes/config.yml`:

- `api.port` — REST для клиента (по умолчанию **8080**)
- `api.token` — секрет для POST/DELETE и web panel
- `api.cdn-base-url` — публичный URL PNG (например `http://your-cdn/capes`)

Команды (top-level, чтобы не конфликтовать с `/clan` от PowerClans):

| Команда | Permission |
|---------|------------|
| `/clancape` | `clan.cape` |
| `/clancape set <url>` | `clan.cape` |
| `/clancape remove` | `clan.cape` |
| `/clancape reload` | `clan.cape.admin` |

Aliases: `/clancapes`, `/ccape`.

### 2. Fabric mod

```bash
cd fabric-mod
gradle build
# JAR: build/libs/clan-capes-fabric-1.0.0.jar → .minecraft/mods/
```

Конфиг клиента: `config/clancapes.json` (см. `fabric-mod/config/clancapes.example.json`)

```json
{
  "apiBaseUrl": "http://YOUR_SERVER:8080",
  "refreshIntervalSeconds": 60,
  "cacheTtlSeconds": 300
}
```

### 3. Web panel

```bash
cd web-panel
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm install
npm run dev
```

- UI: http://localhost:3000  
- API: http://localhost:3001  

Логин по умолчанию (`.env`): `admin` / `change-me`

### 4. Docker

```bash
docker compose up panel-api panel-web -d
# CDN (опционально):
docker compose --profile cdn up nginx-cdn -d
```

## REST API (Paper :8080)

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/api/player/{uuid}` | — |
| GET | `/api/clan/{tag}` | — |
| GET | `/api/powerclans/clans` | Header `X-ClanCapes-Token` — список кланов PowerClans |
| POST | `/api/clan/{tag}/cape` | Header `X-ClanCapes-Token` |
| DELETE | `/api/clan/{tag}/cape` | Header `X-ClanCapes-Token` |

**Ответ игрока:**

```json
{
  "hasCape": true,
  "capeUrl": "https://cdn.example.com/capes/VOID.png",
  "clan": "VOID",
  "updatedAt": 1716300000000
}
```

## Формат PNG

- Только **PNG**
- Размер: **64×32** или **128×64**
- Макс. размер файла: настраивается (256 KB по умолчанию)
- Web panel перекодирует через `sharp` (sanitization)

## Загрузка плаща (web panel)

**Workflow:**

1. Клан рисует или скачивает готовую текстуру **64×32** (формат UV плаща Minecraft, как в SkinMC / MinecraftCapes).
2. Клан передаёт PNG админу сервера.
3. Админ в панели: тег клана → файл PNG → **Upload** → синхронизация с Paper (`capeUrl`).

Шаблон UV для скачивания (публично, без JWT):

`GET http://localhost:3001/static/templates/template_64x32.png`

**Panel API (JWT):**

| Method | Path | Описание |
|--------|------|----------|
| GET | `/panel/clans/options` | Список кланов из PowerClans (`data.yml` на сервере) для выпадающего списка |
| POST | `/panel/clans/{tag}/cape` | `multipart/form-data`, поле `cape` — PNG 64×32 или 128×64 (тег должен быть в PowerClans) |
| DELETE | `/panel/clans/{tag}/cape` | Удалить плащ клана |

**Paper API:** `GET /api/powerclans/clans` (header `X-ClanCapes-Token`) — те же кланы, поле `tag` из `data.yml` (например `king`, `vi`).

Плагин и Fabric-мод по-прежнему используют только `capeUrl` на PNG.

## Интеграции

- **PowerClans** — определение клана игрока (reflective API)
- **PlaceholderAPI** — `%clancapes_has_cape%`, `%clancapes_cape_url%`, `%clancapes_clan%`, `%clancapes_updated_at%`

## Hot reload

1. При смене плаща сервер обновляет `updatedAt`
2. Клиент каждые **60 с** опрашивает API и инвалидирует кеш при изменении
3. Plugin channel `clancapes:sync` уведомляет онлайн-игроков (ускоренное обновление)

## Сборка production

```bash
# Plugin
cd paper-plugin && gradle shadowJar

# Mod
cd fabric-mod && gradle build

# Panel
cd web-panel && npm run build
```

## Mixin note (26.1)

После первой сборки проверьте имена методов в `CapeLayerMixin` — в 26.1 сигнатура `CapeLayer#getCapeTexture` может отличаться. Используйте IDE + официальные mappings для уточнения target.

## Лицензия

MIT — см. `LICENSE` в подпроектах.
