# syntax=docker/dockerfile:1
FROM node:20.20.2-alpine3.22 AS build
RUN --mount=type=secret,id=proxy_ca NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca corepack enable && NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=secret,id=proxy_ca NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca pnpm install --frozen-lockfile && pnpm build
RUN --mount=type=secret,id=proxy_ca NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca pnpm --filter @fluentcoach/api deploy --legacy --prod /runtime/api && NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca pnpm --filter @fluentcoach/worker deploy --legacy --prod /runtime/worker

FROM build AS migrate
ENV NODE_ENV=production
RUN chown -R node:node /app
USER node
CMD ["packages/infrastructure/node_modules/.bin/prisma", "migrate", "deploy", "--schema", "packages/infrastructure/prisma/schema.prisma"]

FROM node:20.20.2-alpine3.22 AS api
ARG RELEASE_COMMIT_SHA=unreleased
LABEL org.opencontainers.image.revision=$RELEASE_COMMIT_SHA
ENV RELEASE_COMMIT_SHA=$RELEASE_COMMIT_SHA RELEASE_MIGRATION_VERSION=202610060002_m11_release_control
ENV NODE_ENV=production
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then cat /etc/ssl/certs/ca-certificates.crt /run/secrets/proxy_ca > /tmp/m10-ca.pem; export SSL_CERT_FILE=/tmp/m10-ca.pem; fi; apk upgrade --no-cache; rm -f /tmp/m10-ca.pem
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
USER node
WORKDIR /app
COPY --from=build --chown=node:node /runtime/api ./apps/api
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM api AS worker
COPY --from=build --chown=node:node /runtime/worker ./apps/worker
EXPOSE 3001
CMD ["node", "apps/worker/dist/main.js"]

FROM nginx:1.29.1-alpine3.22 AS web
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then cat /etc/ssl/certs/ca-certificates.crt /run/secrets/proxy_ca > /tmp/m10-ca.pem; export SSL_CERT_FILE=/tmp/m10-ca.pem; fi; apk upgrade --no-cache; rm -f /tmp/m10-ca.pem
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080

RUN sed -i 's@/var/run/nginx.pid@/tmp/nginx.pid@; s@/run/nginx.pid@/tmp/nginx.pid@' /etc/nginx/nginx.conf && chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d
USER nginx
