# Imagen de producción de NutriAR (servidor + frontend compilado).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npx tsc -p .

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/web/dist ./web/dist
COPY server ./server
COPY shared ./shared
COPY migrations ./migrations
COPY scripts ./scripts
COPY data ./data
RUN useradd -r -u 1001 nutriar && mkdir -p /data/storage && chown nutriar /data/storage
USER nutriar
ENV STORAGE_DIR=/data/storage PORT=3000
EXPOSE 3000
CMD ["node", "--import", "tsx", "server/index.ts"]
