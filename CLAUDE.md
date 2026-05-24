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
  - `mapper_agent/` — builds a Governance knowledge graph in Neo4j Aura. Endpoints: `POST /mapper/run`, `GET /mapper/graph`, `GET /mapper/health`. The `"policies"` trigger reads the org's master Information Security policy + sibling policies AND the global `public.scf_domains` table; Gemini extracts **Security Objectives** from the master and maps each to one or more **SCF (Secure Controls Framework) domains** (closed list — 33 ids like `GOV`, `CHG`, `THR`). Writes to Neo4j with `MERGE` Cypher under a wipe-and-rewrite strategy per master.
  - `fwcr_agent/` (Fw-ControlRegistry Agent) — **deterministic, no LLM**. Rebuilds an org's standard `control_registry` rows from the SCF framework selection in `organizations.needed_framework`. Endpoints: `POST /fwcr/recompute-preview` (returns the add/update/delete/keep diff as a dry run) and `POST /fwcr/recompute` (applies). Driven from the Settings → Organisation tab's "Recompute Control Registry and Save" button via the Express proxy `server/src/routes/fwcr.js`. **Protection rule:** rows where `ctl_status != 'NotEnforced'` OR `evidence_metadata` is non-empty survive even when their framework is deselected — `ctl_ref_fw` retains the original names as a paper trail. New `control_registry` rows are composed as `ctl_name = "<SCF#>-<control_name>"` (e.g. `GOV-01.1-Steering Committee & Program Oversight`), `ctl_id = <SCF#>`, `ctl_type = 'standard'`, `scf_control_id = <SCF#>` (stable agent-ownership key).

### Mapper Agent ontology (`/ai-agent/ontology/`)
The mapper is **contract-driven** — every node label, relationship type, and source column it may touch is declared here:
- `entities.yml` — entity defs: `source_table`, allow-listed `source_columns`, `neo4j_label`, `properties`, `id_strategy.keys` (composite). Loaded once at import; the agent rejects anything outside the allow-list. **v2 entities**: `Policy`, `SCFDomain` (sourced from `public.scf_domains`, materialised per-org in Neo4j), `SecurityObjective` (LLM-inferred per master), `OrphanPolicy`. The pre-v2 `SecurityDomain` (LLM-inferred) and `SecurityFunction` are **removed** — first mapper run after the upgrade cleans up any stale nodes via the per-org wipe step.
- `relationships.yml` — edge defs: `from_entity`, `to_entity`, `neo4j_type`, `cardinality`, `derivation` (`from_source` vs `llm_inferred`), allowed properties. **v2 edges**: `DEFINES` (master → SecurityObjective), `MAPS_TO` (SecurityObjective → SCFDomain), `HAS_CHILD` (master → child Policy), `COVERS` (child Policy → SCFDomain). The pre-v2 `CONTAINS` edge is removed.
- One **recipe per trigger** (currently `policy.yml`) — binds the generic ontology to a specific trigger. Declares Supabase inputs (`master_policy`, `candidate_child_policies`, `scf_domains`), the JSON schema the LLM must return, the prompt instructions, and the write strategy (`wipe_and_rewrite`, scope `per_master`, plus `confidence_threshold_for_visualizer`). The recipe also constrains the LLM to map only to scf_ids from the supplied `scf_domains` list — anything else is dropped during validation.

To add a new trigger (e.g. capabilities), drop a new recipe YAML alongside `policy.yml`, add a new extractor under `ai-agent/mapper_agent/`, and surface it via the `trigger` arg on `POST /mapper/run`.

**SCF reference dependency.** The mapper refuses to run until `public.scf_domains` is populated. The Express proxy returns `{ status: "needs_scf_reference", message }` and the frontend Mapper Run modal surfaces it — fix by uploading the SCF workbook via the internal tool's Control Framework SME tab (see below).

### Internal tool (`/internal-tool/`)
Sister app that lives in the same repo but ships as a **separate Cloud Run service**. Same shape as the main app (React 19 + Vite + TS frontend, Express backend), but **simpler auth — no `org_onboarding` gating**, any Google-signed-in user is allowed in. Shares the same Supabase project (service-role key on the backend).
- Frontend dev port: **5175** (`internal-tool/vite.config.ts`); backend dev port: **3002** (`internal-tool/server/`)
- Used by ZTI staff (sales / analytics / SMEs / CXOs) to manage shared resources: the `policy-corpus` Supabase storage bucket, the ontology YAML files (read-only preview today; GitHub is the source of truth), full CRUD on the `compliance` and `nn_control_templates` tables, and the **Control Framework** tab (uploads the SCF reference workbook). `nn_control_templates` is seeded into each tenant's `control_registry` via the `seed_nn_controls_for_org` SQL function in the main app.
- **Control Framework SME tab.** Uploads the canonical SCF (Secure Controls Framework) workbook to the `scf-reference` Supabase storage bucket (global, not per-tenant). On every upload the backend parses two sheets only — `SCF Domains & Principles` and `SCF 2026.1` — and **wipes + repopulates** four tables: `public.scf_domains` (33 rows), `public.scf_controls` (~1468 rows), `public.scf_frameworks` (~250 external framework names from sheet cols 33–282, with `is_common` flag for a chip-row shortlist), and `public.scf_control_frameworks` (~30k junction rows). Both the mapper agent (domain grounding) and the Fw-ControlRegistry agent (framework→control resolution) read from these tables, never the xlsx — every recompute uses the latest SME-blessed framework. Route: `/api/internal/control-framework` in `internal-tool/server/src/routes/control-framework.js`. Framework names use the **normalised display form** (e.g. `ISO 27001 2022`, not the raw header `ISO\r\n27001 | 2022`) for stability across SCF release formatting drift.
- Deployment: **no GitHub Actions** — deploy manually from a laptop (see `internal-tool/README.md`). Production container serves `/api/*` and the built frontend on port 8080 from the same Express process.
- Local dev: `cd internal-tool && npm install && npm run server:install`, then `npm run dev` + `npm run server` in two terminals. The Supabase Google OAuth provider must have `http://localhost:5175` in its redirect allowlist.

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
- **Global SCF reference tables (not per-tenant):** `scf_domains` (33 rows), `scf_controls` (~1468 rows), `scf_frameworks` (~250 external framework names like `ISO 27001 2022`, `NIST CSF 2.0`), `scf_control_frameworks` (~30k junction rows mapping each SCF control to the frameworks that claim it, with the original cell content in `mapping_refs` for traceability). All four are **wiped + repopulated** on every internal-tool SCF upload. RLS-enabled but only the service-role key reads them. Source xlsx archived in the `scf-reference` storage bucket.
- **`control_registry.ctl_ref_fw`** is **JSONB** (array of framework canonical names). Migrated from `TEXT` in 2026-05; legacy single-value entries were wrapped into single-element arrays. The new `control_registry.scf_control_id TEXT` column marks rows **owned by the Fw-ControlRegistry agent** — agent INSERTs/UPDATEs/DELETEs only touch rows where it is set. NN / Custom / pre-feature standard rows (where `scf_control_id IS NULL`) are invisible to the agent and managed manually as before.

## Knowledge graph: Neo4j Aura
- Used only by the Mapper Agent (the rest of the app talks to Supabase).
- Every node carries `org_id` for multi-tenant scoping; every Cypher statement uses `MERGE` so re-runs are idempotent.
- **v2 labels** (SCF-grounded): `Policy` (with `is_master` property), `SecurityObjective` (LLM-inferred per master, keyed on `org_id` + `master_policy_id` + `name`), `SCFDomain` (mirrored from `public.scf_domains`, materialised per-org and keyed on `org_id` + `scf_id`), and an applied `:OrphanPolicy` label for child policies the LLM didn't link. The legacy `SecurityDomain` / `SecurityFunction` labels are gone — the wipe step in the writer also DETACH-DELETEs any pre-v2 nodes lingering in the per-org subgraph.
- **v2 relationships**: `DEFINES` (master Policy → SecurityObjective), `MAPS_TO` (SecurityObjective → SCFDomain), `HAS_CHILD` (master → child Policy), `COVERS` (child Policy → SCFDomain). The legacy `CONTAINS` edge is gone.

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
