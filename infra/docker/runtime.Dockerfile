FROM node:22.20.0-bookworm-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e AS base
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
FROM base AS tools
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg=7:5.1.9-0+deb12u1 python3=3.11.2-1+b1 python3-venv=3.11.2-1+b1 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/media && /opt/media/bin/pip install --no-cache-dir "yt-dlp[default]==2026.10.26"
ENV PATH="/opt/media/bin:${PATH}"
RUN yt-dlp --version && ffmpeg -version && ffprobe -version
FROM tools AS build
RUN chown node:node /workspace
USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node packages/shared/package.json packages/shared/package.json
COPY --chown=node:node workers/media-worker/package.json workers/media-worker/package.json
RUN npm ci --ignore-scripts
COPY --chown=node:node . .
RUN npm run db:generate && npm run build
FROM build AS quality
USER node
CMD ["npm", "test"]
FROM quality AS e2e
USER root
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright
USER node
CMD ["npx", "playwright", "test", "--config", "apps/web/playwright.config.ts"]
FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts
FROM base AS api
COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/packages/shared ./packages/shared
COPY infra/health ./infra/health
USER node
CMD ["node", "apps/api/dist/main.js"]
FROM tools AS media
COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/workers/media-worker/package.json ./workers/media-worker/package.json
COPY --from=build /workspace/workers/media-worker/dist ./workers/media-worker/dist
COPY --from=build /workspace/packages/shared ./packages/shared
COPY infra/health ./infra/health
USER node
CMD ["node", "workers/media-worker/dist/main.js"]
FROM nginx:1.28.0-bookworm@sha256:552e7481ca93ffccd046aa658dbbed22caefbc09c66fa7cd247cbb90b8a5c609 AS frontend
COPY infra/nginx/frontend.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
USER nginx
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
FROM nginx:1.28.0-bookworm@sha256:552e7481ca93ffccd046aa658dbbed22caefbc09c66fa7cd247cbb90b8a5c609 AS proxy
COPY infra/nginx/proxy.conf /etc/nginx/nginx.conf
USER nginx
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
