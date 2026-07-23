 #!/usr/bin/env bash
# Run from /internal-tool/ — same shape as ai-agent/deploy command.
# Usage: ./deploy.sh [tag]   (tag defaults to 1.0)
set -euo pipefail
TAG="${1:-1.0}"
IMAGE="asia-southeast1-docker.pkg.dev/gen-lang-client-0099829502/my-repo/shankar/zti-internal-tool:${TAG}"

# E2E runner config — export E2E_EMAIL/E2E_PASSWORD before running (don't hardcode).
: "${E2E_EMAIL:?set E2E_EMAIL before deploying (the E2E test account)}"
: "${E2E_PASSWORD:?set E2E_PASSWORD before deploying}"
PREPROD_BASE_URL="${PREPROD_BASE_URL:-https://pre-prod-987276481381.asia-south1.run.app}"
PROD_BASE_URL="${PROD_BASE_URL:-https://zti.co.in/}"

# Build from the REPO ROOT (..) so the image includes e2e/ specs + playwright.config.ts.
docker buildx build --platform linux/amd64 \
  --build-arg VITE_SUPABASE_URL=https://xuqtcrdwbgnqxllhjpri.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1cXRjcmR3YmducXhsbGhqcHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzE3OTcsImV4cCI6MjA4ODcwNzc5N30.8GCgyljQzMmK6faCRRRNbxRtbPd6vSbJrJYDTFgnuZk \
  --build-arg VITE_API_BASE_URL= \
  --build-arg VITE_APP_VERSION="${TAG}" \
  -f Dockerfile \
  -t "${IMAGE}" \
  --push .. && \
gcloud run deploy zti-internal-tool \
  --image "${IMAGE}" \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 1 \
  --no-cpu-throttling \
  --timeout 3600 \
  --set-env-vars \
SUPABASE_URL=https://xuqtcrdwbgnqxllhjpri.supabase.co,\
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1cXRjcmR3YmducXhsbGhqcHJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzEzMTc5NywiZXhwIjoyMDg4NzA3Nzk3fQ.Jjlyk_TwkzWsO-zBW2RVgT5XW49ROibciMlnR8WVejc,\
POLICY_CORPUS_BUCKET=policy-corpus,\
E2E_EMAIL=${E2E_EMAIL},\
E2E_PASSWORD=${E2E_PASSWORD},\
PREPROD_BASE_URL=${PREPROD_BASE_URL},\
PROD_BASE_URL=${PROD_BASE_URL}

