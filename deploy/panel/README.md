# Деплой панели (один сервис Railway)

Ветка **`deploy/panel`**: в корне репозитория один `Dockerfile` + `railway.toml`.  
**Не нужно** указывать Root Directory `web-panel/apps/...`.

## Как устроено

| Процесс | Порт | Назначение |
|---------|------|------------|
| Express API | `3001` (только localhost) | `/auth`, `/panel`, `/static/capes` |
| Next.js | `PORT` (Railway) | UI + прокси API через `rewrites` |

Браузер ходит на один домен; `NEXT_PUBLIC_API_URL` не обязателен.

## Railway

1. Создайте сервис из репозитория, ветка **`deploy/panel`** (или merge в `main`).
2. **Root Directory** оставьте пустым / `.`
3. Builder подхватит `railway.toml` → `Dockerfile`.
4. Добавьте **Volume** mount: `/app/data` (плащи + audit).
5. Переменные:

| Variable | Пример |
|----------|--------|
| `JWT_SECRET` | длинная случайная строка |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | … |
| `MINECRAFT_API_URL` | `http://IP_СЕРВЕРА:8080` |
| `MINECRAFT_API_TOKEN` | как в `plugins/ClanCapes/config.yml` |
| `CDN_PUBLIC_URL` | `https://ВАШ-ДОМЕН.railway.app/static/capes` |
| `CORS_ORIGIN` | `https://ВАШ-ДОМЕН.railway.app` (опционально) |

Если `CDN_PUBLIC_URL` пустой, API попробует `https://${RAILWAY_PUBLIC_DOMAIN}/static/capes`.

## Локально

```bash
docker build -t clan-capes-panel .
docker run -p 3000:3000 -e JWT_SECRET=test -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=test \
  -e MINECRAFT_API_URL=http://host.docker.internal:8080 -e MINECRAFT_API_TOKEN=test \
  -v clan-capes-data:/app/data clan-capes-panel
```

Открыть http://localhost:3000
