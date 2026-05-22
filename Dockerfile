# Clan Capes — unified web panel (API + Next.js) for Railway / Docker
# Single public port (PORT): Next.js proxies /auth, /panel, /static, /health → API on 127.0.0.1:3001

FROM node:22-slim AS api-build
WORKDIR /build/api
COPY web-panel/apps/api/package.json web-panel/apps/api/tsconfig.json ./
COPY web-panel/apps/api/src ./src
COPY web-panel/apps/api/assets ./assets
RUN npm install && npm run build

FROM node:22-alpine AS web-build
WORKDIR /build/web
COPY web-panel/apps/web/package.json web-panel/apps/web/tsconfig.json web-panel/apps/web/next.config.ts web-panel/apps/web/postcss.config.mjs web-panel/apps/web/tailwind.config.ts web-panel/apps/web/next-env.d.ts ./
COPY web-panel/apps/web/src ./src
ENV NEXT_PUBLIC_API_URL=
ENV API_INTERNAL_URL=http://127.0.0.1:3001
RUN npm install && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV API_INTERNAL_PORT=3001
ENV UPLOAD_DIR=/app/data/capes
ENV AUDIT_LOG=/app/data/audit.log
ENV API_INTERNAL_URL=http://127.0.0.1:3001

# API runtime
WORKDIR /app/api
COPY --from=api-build /build/api/dist ./dist
COPY --from=api-build /build/api/assets ./assets
COPY web-panel/apps/api/package.json ./
RUN npm install --omit=dev && mkdir -p /app/data/capes

# Web runtime
WORKDIR /app/web
COPY --from=web-build /build/web/.next ./.next
COPY --from=web-build /build/web/node_modules ./node_modules
COPY --from=web-build /build/web/package.json ./

COPY deploy/panel/start.sh /app/start.sh
RUN chmod +x /app/start.sh && mkdir -p /app/data

VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app
CMD ["/app/start.sh"]
