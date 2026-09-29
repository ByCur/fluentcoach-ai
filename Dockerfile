FROM node:20.20.0-alpine3.22 AS build
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:20.20.0-alpine3.22 AS api
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM api AS worker
EXPOSE 3001
CMD ["node", "apps/worker/dist/main.js"]

FROM nginx:1.29.1-alpine3.22 AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
