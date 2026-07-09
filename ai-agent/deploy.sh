#!/usr/bin/env bash
# Run from /ai-agent/ — builds the FastAPI AI-agent image and deploys it to Cloud Run.
# Usage: ./deploy.sh [tag]   (tag defaults to 1.0)
#
# NOTE: secrets are inlined below to match internal-tool/deploy.sh. Keep this file
# out of any public fork and rotate the keys if it ever leaks.
set -euo pipefail

TAG="${1:-1.0}"
PROJECT="gen-lang-client-0099829502"
IMAGE="asia-southeast1-docker.pkg.dev/${PROJECT}/my-repo/shankar/zti-ai-agent:${TAG}"

docker buildx build --platform linux/amd64 \
  -t "${IMAGE}" \
  --push . && \
gcloud run deploy zti-ai-agent \
  --project "${PROJECT}" \
  --image "${IMAGE}" \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 5 \
  --set-env-vars \
GEMINI_API_KEY=AIzaSyAU4xSybkklEiLjH8Upbccwt1_eTS-mtko,\
GEMINI_MODEL=gemini-2.5-flash,\
DATABASE_URL=postgresql://postgres:Zti-cloudstory@db.xuqtcrdwbgnqxllhjpri.supabase.co:5432/postgres,\
NEO4J_URI=neo4j+s://679ede24.databases.neo4j.io,\
NEO4J_USER=679ede24,\
NEO4J_PASSWORD=664HbwFtGcpSk6I_Oof-hNGGfjIbKCWII2cyuvU4HUU
