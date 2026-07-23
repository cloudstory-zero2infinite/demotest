# Playwright image (Node + Chromium) so the deployed internal tool can run E2E.
# Build from the REPO ROOT (see deploy.sh) to include e2e/ specs + playwright.config.ts.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app
# Where the runner finds e2e/specs + playwright.config.ts.
ENV E2E_ROOT=/app

# Root E2E harness (@playwright/test + specs + config).
COPY package*.json ./
# CI=true skips the postinstall that installs ALL browsers; we add chromium only.
RUN CI=true npm install
RUN npx playwright install chromium
COPY playwright.config.ts ./
COPY e2e ./e2e

# ── Internal-tool app (frontend + backend) ──
COPY internal-tool ./internal-tool
RUN cd internal-tool && npm install && cd server && npm install

# Build the Vite frontend
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_BASE_URL=""
ARG VITE_APP_VERSION=dev
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION
RUN cd internal-tool && npm run build

EXPOSE 8080
ENV PORT=8080

# Express serves both /api/* and the built frontend (internal-tool/dist).
CMD ["node", "internal-tool/server/src/index.js"]
