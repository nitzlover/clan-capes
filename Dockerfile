# syntax=docker/dockerfile:1.7
# -------- Build stage --------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json* tsconfig.json next.config.js postcss.config.mjs tailwind.config.ts next-env.d.ts ./
RUN npm install --no-audit --no-fund

COPY src ./src
COPY public ./public
# Drizzle migration files + runner script need to land in the runtime
# image, so they have to exist in the build stage too — multi-stage
# `COPY --from=build` can only pull paths that were present here.
COPY scripts ./scripts
COPY migrations ./migrations
RUN npm run build

# -------- Runtime stage --------
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# Copy build output and config needed at runtime
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/next.config.js ./
# `npm start` chains `npm run db:migrate` which is `tsx scripts/migrate.ts`
# — both the runner and the SQL files it reads need to be present at
# runtime. drizzle.config.ts is build-time only (drizzle-kit) and
# stays out of the runtime image.
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations

# Prod-only install (sharp + bcrypt + jwt still needed at runtime)
RUN npm install --omit=dev --no-audit --no-fund

# Persistent capes + audit log live here. On Railway, attach a disk
# via the dashboard with Mount Path = /app/data (configured at the
# service level). The mkdir below is a fallback for local Docker runs.
RUN mkdir -p /app/data/capes

EXPOSE 3000
# `exec` replaces the shell process with next.js so PID 1 inside the
# container is the Node server itself. Railway sends SIGTERM directly
# to PID 1 on stop/redeploy — without `exec` the signal lands on the
# npm wrapper, which logs "command failed signal SIGTERM" as an error
# even when Next shut down cleanly. The migration step runs first
# (idempotent, soft-skips when DATABASE_URL is unset).
CMD ["sh", "-c", "node_modules/.bin/tsx scripts/migrate.ts && exec node_modules/.bin/next start -p ${PORT:-3000} -H 0.0.0.0"]
