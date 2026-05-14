# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
ZeroTo1 GRC is a Governance, Risk & Compliance (GRC) SaaS platform with multi-tenant support. It provides security teams and CXOs with tools to manage programs, internal controls, assets, policies, vulnerabilities, compliance, and contacts.

## Architecture

### Frontend (`/`)
- **React 19** + **TypeScript** + **Vite 6**
- **Recharts** for data visualization; **Mermaid** for org diagrams; **xlsx** for spreadsheet export
- Tailwind CSS utility classes for styling (dark mode supported via `body.classList.add('dark')`)
- **No `src/` directory** — frontend source files live at the repo root: `App.tsx`, `index.tsx`, `types.ts`, `components/`, `hooks/`, `services/`, `utils/`
- Entry: `App.tsx` (large file — use offset/limit when reading)
- Tab components: `components/tabs/` — one file per main nav section (Dashboard, Program, Governance, Compliance, Organisation, Risk, Resiliency, ThreatView, ActivityLogs)
- Domain views: `components/governance/`, `components/dashboard/`, `components/program/`, `components/org/`
- Admin: `components/admin/PlatformAdminTab.tsx`; Auth: `components/auth/` (onboarding, name entry modals)
- Common UI: `components/common/`
- Types: `types.ts`
- Service layer: `services/supabase.ts` — all API calls go through `apiRequest()` here
- CSV parsing: `utils/csvParser.ts`
- **Mapper Visualizer** (`components/governance/MapperVisualizerView.tsx`): renders the Neo4j knowledge graph using `@xyflow/react` with a `d3-force` layout. Master + its hubs are pinned at fixed angles; spokes are pulled to the outward side of each hub by a custom directional force. Every node has a single hidden centre handle (so straight edges appear to emerge from the node edge). Triggered from the Policy tab via `MapperRunModal.tsx`. Tree edges use `DEFINES/HAS_CHILD/CONTAINS`; `COVERS` is rendered as a cross-link overlay.

### Backend (`/server/`)
- **Express.js** (Node.js, ESM modules — `"type": "module"`)
- Entry: `server/src/index.js`
- Routes: `server/src/routes/` — one file per domain (program, controls, assets, asset-types, asset-custom-fields, custom-fields, policies, vulnerabilities, compliance, scoring, contacts, activity, org, org-settings, org-contacts, feedback, capabilities, control-registry, mapper). Note: `scoring` is mounted under `/api/compliance` alongside the compliance router; `mapper` is a thin proxy that forwards `/api/mapper/*` to the ai-agent at `AI_AGENT_URL`
- Auth middleware: `server/src/middleware/auth.js` — extracts JWT from `Authorization: Bearer <token>`, validates via `supabaseAdmin.auth.getUser()`, then looks up `org_onboarding` to attach `req.userId`, `req.orgId`, `req.userRole`, `req.onboardingStatus`
- Supabase admin client: `server/src/supabase.js` (service-role key, bypasses RLS)
- Email: uses **Resend** (`resend` npm package) for transactional email
- File uploads: **Multer** with 50MB limit
- Scheduled jobs: `server/src/jobs/policy-expiry.js` — cron job runs every 6 hours (`0 */6 * * *`) to check policy expiration
- All routes mounted under `/api/<domain>` (e.g., `/api/program`, `/api/controls`, `/api/org`, `/api/org-settings`, `/api/org-contacts`, `/api/capabilities`, `/api/control-registry`, `/api/feedback`)
- Health check: `GET /api/health`
- In production the root Dockerfile (Node 20) builds the frontend into `dist/`, then serves it as static files on port 8080 via the same Express server
- Separate Dockerfiles also exist at `server/Dockerfile` (Node 20, dev mode) and `ai-agent/Dockerfile` (Python 3.12-slim)

### AI Agent (`/ai-agent/`)
- **FastAPI** (Python) service using **Google Gemini** (`gemini-2.0-flash` default) for AI-powered queries
- Connects directly to Supabase Postgres via `psycopg2` (not through the Express backend)
- Module-specific system prompts for assets, vulnerabilities, policies, capabilities
- Module-to-table mapping: assets→`assets`, vulnerabilities→`vulnerability_management`, policies→`policy_documents`, capabilities→`capability_register`
- AI-generated data excludes columns: `id`, `created_at`, `updated_at`, `org_id`, `user_id`, `owner_id`, `asset_id`, `capab_id`
- Runs on port 8080 by default (`PORT` env var, auto-injected on Cloud Run)
- Env vars: `GEMINI_API_KEY`, `GEMINI_MODEL`, `DATABASE_URL`
- Submodules:
  - `policy_agent/` — RAG over policy templates with org-memory grounding (SSE streaming via `/policy/draft`)
  - `mapper_agent/` — builds a Governance knowledge graph in Neo4j Aura. Endpoints: `POST /mapper/run`, `GET /mapper/graph`, `GET /mapper/health`. Phase 1 trigger is `"policies"` (reads the org's master Information Security policy + sibling policies, Gemini extracts security domains and child-policy links, writes to Neo4j with `MERGE` Cypher under a wipe-and-rewrite strategy per master).

### Mapper Agent ontology (`/ai-agent/ontology/`)
The mapper is **contract-driven** — every node label, relationship type, and source column it may touch is declared here:
- `entities.yml` — entity defs: `source_table`, allow-listed `source_columns`, `neo4j_label`, `properties`, `id_strategy.keys` (composite). Loaded once at import; the agent rejects anything outside the allow-list.
- `relationships.yml` — edge defs: `from_entity`, `to_entity`, `neo4j_type`, `cardinality`, `derivation` (`from_source` vs `llm_inferred`), allowed properties.
- One **recipe per trigger** (currently `policy.yml`) — binds the generic ontology to a specific trigger. Declares Supabase inputs (`master_policy`, `candidate_child_policies`), the JSON schema the LLM must return, the prompt instructions, and the write strategy (`wipe_and_rewrite`, scope `per_master`, plus `confidence_threshold_for_visualizer`).

To add a new trigger (e.g. capabilities), drop a new recipe YAML alongside `policy.yml`, add a new extractor under `ai-agent/mapper_agent/`, and surface it via the `trigger` arg on `POST /mapper/run`.

## Key Commands

### Frontend
```bash
npm run dev          # Start Vite dev server (port 5174)
npm run build        # Production build → dist/
npm run preview      # Preview production build
```

### Backend
```bash
npm run server          # Start Express server from root (port 3001)
npm run server:install  # Install server dependencies
# OR from server/ directory:
npm run dev             # node --watch src/index.js
npm start               # node src/index.js (no watch)
```

### AI Agent
```bash
cd ai-agent && pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

### Local Dev Setup (after cloning)
```bash
cp .env.example .env                    # Fill in Supabase credentials
cp server/.env.example server/.env      # Fill in service-role key, set FRONTEND_URL=http://localhost:5174
cp ai-agent/.env.example ai-agent/.env  # Fill in Gemini key, DATABASE_URL
npm install && npm run server:install
# Then run frontend + backend in separate terminals:
npm run dev       # Terminal 1: Vite on :5174
npm run server    # Terminal 2: Express on :3001
```

### Docker
```bash
docker-compose up       # Starts all 3 services (frontend, server, ai-agent)
```

### Testing & Linting
No test framework or linter is currently configured. There are no test files in the repo. Run `npm run build` to catch TypeScript/compilation errors.

## Environment Variables
Copy `.env.example` to `.env`. Required:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — frontend Supabase credentials (used only for Google OAuth)
- `VITE_API_BASE_URL` — backend URL (default: `http://localhost:3001`)
- `VITE_AI_AGENT_URL` — AI agent service URL (default: `http://localhost:8080`)
- Server also needs: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for `supabaseAdmin`), `RESEND_API_KEY`, `FRONTEND_URL`, `AI_AGENT_URL` (used by the `/api/mapper/*` proxy)
- AI agent needs: `GEMINI_API_KEY`, `DATABASE_URL` (Postgres connection string), optionally `GEMINI_MODEL`. For the Mapper Agent also: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` (Neo4j Aura)
- See `.env.example`, `server/.env.example`, and `ai-agent/.env.example` for templates

**Multi-service Supabase footgun.** The Express server uses `SUPABASE_URL` (REST + service role) and the ai-agent uses `DATABASE_URL` (direct Postgres). They MUST point to the same Supabase project or the mapper agent will read different data than the rest of the app. After cloning, double-check by comparing the project ref in both URLs.

## Data Flow
**The frontend Supabase client is used only for Google OAuth sign-in/sign-out/session management.** All data reads and writes go through the Express backend via `apiRequest()` in `services/supabase.ts`, which attaches the user's JWT as a Bearer token. The backend uses `supabaseAdmin` (service-role key) to query Supabase, scoping every query to `req.orgId`.

## Database: Supabase
- All data is multi-tenant, scoped by `org_id`
- RLS policies enforce `org_id` and `user_id` ownership
- `org_onboarding` table maps users → organizations with roles and `status` (`active` | `pending_approval`)
- Key tables: `program`, `internal_control_catalogue`, `assets`, `policy_documents`, `vulnerability_management`, `compliance`, `contacts`, `all_activity_log`, `program_activity_log`
- `policy_documents.is_master BOOLEAN` flags the org's master Information Security policy. A partial unique index (`org_id WHERE is_master = true`) enforces at most one master per org. The Mapper Agent refuses to run with no master set and returns a `needs_master` response that the frontend handles by prompting the user to mark one.

## Knowledge graph: Neo4j Aura
- Used only by the Mapper Agent (the rest of the app talks to Supabase).
- Every node carries `org_id` for multi-tenant scoping; every Cypher statement uses `MERGE` so re-runs are idempotent.
- Phase 1 labels: `Policy` (with `is_master` property), `SecurityDomain`, `SecurityFunction`, and an applied `:OrphanPolicy` label for child policies the LLM didn't link.
- Phase 1 relationships: `DEFINES` (master → domain), `CONTAINS` (domain → function), `HAS_CHILD` (master → child policy), `COVERS` (child policy → domain).

## User Roles
- **security-staff**: Full operational view
- **cxo**: Executive summary view
- DB roles: `user`, `admin`, `tenant_admin`

## Data Patterns
- All backend routes follow: `requireAuth` → query with `org_id` filter → return data
- Insert operations always inject `user_id: req.userId` and `org_id: req.orgId`
- Bulk insert endpoints exist on routes that support CSV import (e.g., `POST /api/program/bulk`)
- Vulnerability data is manually joined with assets in the application layer (no DB-level join)
- Policy nodes/links/workflow templates currently use localStorage as mock persistence

## Custom Hooks
- `useTabRefresh(activeTab)` — dispatches a `tabChanged` CustomEvent on `window` when the active tab changes; domain components listen to this event to re-fetch data
- `useUnifiedRefresh(isActive, onRefresh)` — triggers data refresh when a component becomes active, when the browser tab regains visibility, or when the window regains focus (500ms debounce)
- `useDataRefresh` — wraps data-fetching with loading/error state
- `useTableSelection` — manages multi-row checkbox selection for bulk actions

## Branches
- **`prod` is the production branch** — all production deployments come from this branch. Always verify you have the latest `prod` pulled (`git fetch && git status` against `origin/prod`) before starting work or cutting a release.
- **`main` is for testing only** — do NOT treat `main` as the source of truth for production. PRs intended for production must target `prod`.

## Deployment
- **CI/CD**: `.github/workflows/deploy-cloudrun.yml` — triggers on push to `main`, builds Docker image, pushes to Google Artifact Registry (`asia-southeast1`), deploys to Cloud Run (`asia-south1`, service name: `pre-prod`)
- Build args inject `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`, `VITE_AI_AGENT_URL` at image build time
- In production, the single Dockerfile builds the frontend into `dist/`, then Express serves both static files and API routes on port 8080
- Database schema is managed directly in Supabase (no migration files in the repo)

## CORS
- Server CORS origin defaults to `process.env.FRONTEND_URL || 'http://localhost:5173'`
- **Note**: Vite dev server actually runs on port **5174** (configured in `vite.config.ts`), not 5173 — set `FRONTEND_URL=http://localhost:5174` in `server/.env` for local dev

## Demo mode (ABC News tenant)
- Client-side, tenant-gated demo subsystem. Lives entirely in `services/demo/` plus a button in `components/common/DemoToggle.tsx`. Nothing on the backend or in Supabase.
- **Gating**: the Demo toggle in the header only renders when the user's org name is `"ABC News"` (constant `DEMO_ORG_NAME` in `services/demo/demoMode.ts`). Threaded from `App.tsx` as `isAbcNews` prop to `Header.tsx`.
- **Interception point**: `apiRequest()` in `services/supabase.ts` checks `isDemoEnabled()` at the top of every call and forwards to `handleDemoRequest()` in `services/demo/demoApi.ts`. Three calls that bypass `apiRequest` (`uploadFile`, `submitControlEnforcement`, `saveFeedback`) also have demo short-circuits.
- **Store**: `services/demo/demoStore.ts` is a JSON-cloned mutable copy of `demoSeed.ts`, persisted to `sessionStorage` on every write. Survives page reload, dies with the tab (per-tab isolation). The persisted payload is wrapped `{ _version, data }` — bump `SEED_VERSION` in `demoStore.ts` whenever the seed shape changes so older stores auto-invalidate on next load.
- **Toggle on/off**: `enableDemoMode()` / `disableDemoMode()` flip the sessionStorage flag, wipe the persisted store, then `window.location.reload()` — every mounted tab refetches via the interceptor (or the real backend, on the way back out). Toggle off prompts for confirmation since in-memory edits are discarded.
- **Asset relationship convention**: `source_asset_id` / `target_asset_id` store the human `asset.asset_id` (e.g. `EP-001`), NOT the UUID `asset.id`. Matches the real backend (`server/src/routes/assets.js` queries by `asset_id`) and `OrgDiagramView`'s Mermaid builder. Easy to get wrong — see the `mkRel` helper in `demoSeed.ts`.
- **Mapper graph in demo**: `handleDemoRequest` for `/api/mapper/graph` synthesizes a minimal `{nodes, edges}` from the in-memory master policy + child policies + a fixed set of 6 security domains. No Neo4j involved.
- **Adding new demo data**: extend the relevant `SEED_*` constant in `demoSeed.ts`, add it to the `DemoStore` interface + `freshFromSeed()` in `demoStore.ts`, and add a route in `demoApi.ts` (the order matters — `/api/assets/relationships` must be matched before `/api/assets/:id`). Then bump `SEED_VERSION`.

## Vite Config Notes
- Dev server on `0.0.0.0:5174` with `allowedHosts: true` (Docker-friendly)
- HMR via WebSocket on `localhost:5174`
- Path alias `@` maps to project root
- `VITE_AI_AGENT_URL` and `__APP_VERSION__` are injected at build time via `define`
