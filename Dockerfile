# syntax=docker/dockerfile:1.7
# -------- Build stage --------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json* tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts next-env.d.ts ./
RUN npm install --no-audit --no-fund

COPY src ./src
COPY public ./public
RUN npm run build

# -------- Runtime stage --------
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# Copy build output and config needed at runtime
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/next.config.ts ./

# Prod-only install (sharp + bcrypt + jwt still needed at runtime)
RUN npm install --omit=dev --no-audit --no-fund

# Persistent capes + audit log live here. Railway mounts a Volume to /app/data.
RUN mkdir -p /app/data/capes
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["npm", "start"]
