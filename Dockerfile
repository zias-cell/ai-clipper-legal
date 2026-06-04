# Container image for the News-Tok dashboard.
# Bundles everything needed to render videos on a host:
#   - Node (app + bundled ffmpeg via ffmpeg-static)
#   - DejaVu fonts + fontconfig (required by libass for caption text)
#   - edge-tts (free neural voiceover; needs the host's internet, no API key)
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-dejavu-core fontconfig python3 python3-pip ca-certificates \
 && pip3 install --no-cache-dir --break-system-packages edge-tts \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching. ffmpeg-static fetches its
# binary during install (build host has network).
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Render/Railway/Fly inject PORT; the server already honors process.env.PORT.
EXPOSE 4321
CMD ["node", "src/server.js"]
