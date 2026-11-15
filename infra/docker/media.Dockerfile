FROM node:22.20.0-bookworm-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e AS media
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg=7:5.1.9-0+deb12u1 python3=3.11.2-1+b1 python3-venv=3.11.2-1+b1 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/media && /opt/media/bin/pip install --no-cache-dir yt-dlp==2026.10.26
ENV PATH="/opt/media/bin:${PATH}"
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY workers/media-worker/package.json workers/media-worker/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npm run db:generate && npm run build && yt-dlp --version && ffmpeg -version && ffprobe -version
USER node
CMD ["node", "workers/media-worker/dist/main.js"]
