FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts next-env.d.ts ./
COPY src ./src
RUN npm install && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/public ./public 2>/dev/null || true
EXPOSE 3000
CMD ["npm", "start"]
