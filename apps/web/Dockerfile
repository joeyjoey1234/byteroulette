FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN pnpm install --frozen-lockfile --filter @byteroulette/web...
COPY apps/web apps/web
COPY packages/protocol packages/protocol
RUN pnpm --filter @byteroulette/protocol build && pnpm --filter @byteroulette/web build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
ARG VERSION=dev
ARG REVISION=unknown
ARG SOURCE_URL=""
ARG LICENSES=NOASSERTION
LABEL org.opencontainers.image.title="ByteRoulette Web" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.source=$SOURCE_URL \
      org.opencontainers.image.licenses=$LICENSES
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health/live || exit 1
