# Деплой веб-панели на Railway

**Актуально:** один сервис из корня репо — см. **`deploy/panel/README.md`** и ветку **`deploy/panel`**.

Корневые `Dockerfile` + `railway.toml` собирают API + Next.js вместе. Root Directory не меняйте.

## Устаревшая схема (2 сервиса)

При необходимости можно по-прежнему деплоить отдельно `web-panel/apps/api` и `web-panel/apps/web` с их локальными `railway.toml`.
