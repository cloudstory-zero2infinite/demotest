# ZTI Internal Tool

Internal-only sister app for the ZeroTo1 GRC platform. Used by ZTI sales, analytics,
SMEs and CXOs. Lives in the same repo as the main app, shares the same Supabase
database, but is deployed as a **separate Cloud Run service**.

## Architecture

Same shape as the main app, simpler:

- **Frontend**: React 19 + Vite + TS + Tailwind (this folder)
- **Backend**: Express on Node 20 (`./server/`)
- **Auth**: Google OAuth via Supabase. **No org_onboarding gating** — anyone with the
  URL who can sign in with Google is allowed in. JWT is validated server-side via
  `supabaseAdmin.auth.getUser()`.
- **Data**: writes/reads to Supabase using the service-role key.
- **Production**: single container — Express serves both `/api/*` and the built
  frontend static files on port 8080.

## Tabs

### SME

- **Manage Policy Vector DB** — list/upload/delete files in the Supabase storage
  bucket `policy-corpus` (the reference corpus used for policy vectorization).
- **Ontology File Editor** — list ontology yml files (`entities.yml`, `policy.yml`,
  `relationships.yml`). Editing in the textarea is local-preview only; save is
  disabled. Source of truth is GitHub; a save flow can be wired up later.
- **Manage Compliance** — full CRUD on the `compliance` table with xlsx/csv
  import/export and bulk delete.
- **Manage NN Controls** — full CRUD on the `nn_control_templates` table with
  xlsx/csv import/export and bulk delete. These templates are seeded into each
  tenant's `control_registry` via `seed_nn_controls_for_org` in the main app.

## Local dev

```bash
cd internal-tool
cp .env.example .env                  # frontend env
cp server/.env.example server/.env    # backend env

npm install
npm run server:install

# Terminal 1 — frontend on :5175
npm run dev

# Terminal 2 — backend on :3002
npm run server
```

Open http://localhost:5175.

> **Google OAuth callback**: the Supabase project's Google auth provider must
> have `http://localhost:5175` in its redirect allowlist for local dev, and the
> production URL added before you deploy.

## Production build (single container)

```bash
cd internal-tool
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your-anon-key \
  --build-arg VITE_API_BASE_URL= \
  --build-arg VITE_APP_VERSION=$(git rev-parse --short HEAD) \
  -t zti-internal-tool:latest .
```

`VITE_API_BASE_URL` is left empty so the frontend hits the same origin as the
Express server.

## Manual GCP Cloud Run deploy

There are **no GitHub Actions for this app** — deploy manually from your laptop.

```bash
# 1. Set vars
PROJECT_ID=your-gcp-project
REGION=asia-south1
AR_REGION=asia-southeast1
AR_REPO=zti                    # Artifact Registry repo name
SERVICE=zti-internal-tool
IMAGE=$AR_REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/$SERVICE:$(git rev-parse --short HEAD)

# 2. Build the image (run from /internal-tool/)
cd internal-tool
docker build \
  --platform linux/amd64 \
  --build-arg VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
  --build-arg VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
  --build-arg VITE_API_BASE_URL= \
  --build-arg VITE_APP_VERSION=$(git rev-parse --short HEAD) \
  -t $IMAGE .

# 3. Push
gcloud auth configure-docker $AR_REGION-docker.pkg.dev
docker push $IMAGE

# 4. Deploy
gcloud run deploy $SERVICE \
  --image=$IMAGE \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --max-instances=5 \
  --set-env-vars=SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY,POLICY_CORPUS_BUCKET=policy-corpus
```

After the first deploy, grab the service URL and add it to:

1. **Supabase Auth → URL Configuration → Site URL + Redirect URLs** (so Google
   OAuth callback works).
2. The Google OAuth client's authorized redirect URIs (Supabase will tell you
   the exact callback URL — typically `https://<project>.supabase.co/auth/v1/callback`,
   which is shared with the main app, so no change needed there).

## Notes

- This app **bypasses** the main app's `org_onboarding` check by design.
  Don't add data here that should be tenant-scoped.
- `compliance` and `nn_control_templates` are global tables — there is no
  `org_id` column on either, so this tool curates a master library for all
  tenants.
- Supabase storage operations use the service-role key, which bypasses RLS.
  Don't grant access to anyone you wouldn't trust with bucket-admin permissions
  on `policy-corpus`.
