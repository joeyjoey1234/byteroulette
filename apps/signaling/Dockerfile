FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/signaling/package.json apps/signaling/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN pnpm install --frozen-lockfile --filter @byteroulette/signaling...
COPY apps/signaling apps/signaling
COPY packages/protocol packages/protocol
RUN pnpm --filter @byteroulette/protocol build && pnpm --filter @byteroulette/signaling build && pnpm deploy --legacy --filter @byteroulette/signaling --prod /prod/signaling

FROM node:20-alpine AS runtime
ARG VERSION=dev
ARG REVISION=unknown
ARG SOURCE_URL=""
ARG LICENSES=NOASSERTION
LABEL org.opencontainers.image.title="ByteRoulette Signaling" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.source=$SOURCE_URL \
      org.opencontainers.image.licenses=$LICENSES
ENV NODE_ENV=production SIGNAL_HOST=0.0.0.0 SIGNAL_PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /prod/signaling ./
COPY --chmod=755 apps/signaling/docker-entrypoint.sh /usr/local/bin/byteroulette-entrypoint
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:3001/health/live || exit 1
ENTRYPOINT ["/usr/local/bin/byteroulette-entrypoint"]
CMD ["node", "dist/index.js"]
