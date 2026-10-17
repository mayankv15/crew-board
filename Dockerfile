# syntax=docker/dockerfile:1

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim AS api-deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY api/package.json api/
RUN npm ci --omit=dev --workspace=@crew-board/api --include-workspace-root=false

FROM node:24-slim AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/crewboard.db
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY --from=build /app/api/dist ./dist
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY deploy/crew-cli.sh /usr/local/bin/crew-cli
RUN mkdir /data && chown node:node /data && chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/crew-cli
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "dist/server.js"]

FROM nginxinc/nginx-unprivileged:stable-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 8080
