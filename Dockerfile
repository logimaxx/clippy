FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .
RUN bun run build:assets && bun run build:static

FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY --from=build /app/dist ./dist
COPY --from=build /app/static ./static
COPY --from=build /app/src ./src
COPY --from=build /app/assets ./assets
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/bunfig.toml ./
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/drizzle ./drizzle
RUN mkdir -p /data/files
VOLUME /data
ENV DATA_DIR=/data
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
