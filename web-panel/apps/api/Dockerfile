FROM node:22-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY assets ./assets
RUN npm install && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/assets ./assets
COPY package.json ./
RUN npm install --omit=dev
RUN mkdir -p /app/data/capes
VOLUME ["/app/data"]
EXPOSE 3001
CMD ["node", "dist/index.js"]
