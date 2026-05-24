 #!/usr/bin/env bash
# Run from /internal-tool/ — same shape as ai-agent/deploy command.
# Usage: ./deploy.sh [tag]   (tag defaults to 1.0)
set -euo pipefail
TAG="${1:-1.0}"
IMAGE="asia-southeast1-docker.pkg.dev/gen-lang-client-0099829502/my-repo/shankar/zti-internal-tool:${TAG}"
docker buildx build --platform linux/amd64 \
  --build-arg VITE_SUPABASE_URL=https://xuqtcrdwbgnqxllhjpri.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1cXRjcmR3YmducXhsbGhqcHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzE3OTcsImV4cCI6MjA4ODcwNzc5N30.8GCgyljQzMmK6faCRRRNbxRtbPd6vSbJrJYDTFgnuZk \
  --build-arg VITE_API_BASE_URL= \
  --build-arg VITE_APP_VERSION="${TAG}" \
  -t "${IMAGE}" \
  --push . && \
gcloud run deploy zti-internal-tool \
  --image "${IMAGE}" \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 5 \
  --set-env-vars \
SUPABASE_URL=https://xuqtcrdwbgnqxllhjpri.supabase.co,\
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1cXRjcmR3YmducXhsbGhqcHJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzEzMTc5NywiZXhwIjoyMDg4NzA3Nzk3fQ.Jjlyk_TwkzWsO-zBW2RVgT5XW49ROibciMlnR8WVejc,\
POLICY_CORPUS_BUCKET=policy-corpus

