# syntax=docker/dockerfile:1.7
# -------- Build stage --------
FROM node:22-alpine AS build
WORKDIR /app

# Railway service env vars are exposed as build args automatically, but we
# also declare a sensible local default so `docker build` works standalone.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json* tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts next-env.d.ts ./
RUN npm install --no-audit --no-fund

COPY src ./src
COPY public ./public
RUN npm run build

# -------- Runtime stage --------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Only ship what next start needs.
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3000
CMD ["npm", "start"]
