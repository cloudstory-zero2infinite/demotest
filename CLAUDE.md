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

### Backend (`/server/`)
- **Express.js** (Node.js, ESM modules — `"type": "module"`)
- Entry: `server/src/index.js`
- Routes: `server/src/routes/` — one file per domain (program, controls, assets, policies, vulnerabilities, compliance, contacts, activity, org, org-settings, feedback, capabilities, control-registry)
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
- Server also needs: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for `supabaseAdmin`), `RESEND_API_KEY`, `FRONTEND_URL`
- AI agent needs: `GEMINI_API_KEY`, `DATABASE_URL` (Postgres connection string), optionally `GEMINI_MODEL`
- See `.env.example`, `server/.env.example`, and `ai-agent/.env.example` for templates

## Data Flow
**The frontend Supabase client is used only for Google OAuth sign-in/sign-out/session management.** All data reads and writes go through the Express backend via `apiRequest()` in `services/supabase.ts`, which attaches the user's JWT as a Bearer token. The backend uses `supabaseAdmin` (service-role key) to query Supabase, scoping every query to `req.orgId`.

## Database: Supabase
- All data is multi-tenant, scoped by `org_id`
- RLS policies enforce `org_id` and `user_id` ownership
- `org_onboarding` table maps users → organizations with roles and `status` (`active` | `pending_approval`)
- Key tables: `program`, `internal_control_catalogue`, `assets`, `policy_documents`, `vulnerability_management`, `compliance`, `contacts`, `all_activity_log`, `program_activity_log`

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

## Deployment
- **CI/CD**: `.github/workflows/deploy-cloudrun.yml` — triggers on push to `main`, builds Docker image, pushes to Google Artifact Registry (`asia-southeast1`), deploys to Cloud Run (`asia-south1`, service name: `pre-prod`)
- Build args inject `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`, `VITE_AI_AGENT_URL` at image build time
- In production, the single Dockerfile builds the frontend into `dist/`, then Express serves both static files and API routes on port 8080
- Database schema is managed directly in Supabase (no migration files in the repo)

## CORS
- Server CORS origin defaults to `process.env.FRONTEND_URL || 'http://localhost:5173'`
- **Note**: Vite dev server actually runs on port **5174** (configured in `vite.config.ts`), not 5173 — set `FRONTEND_URL=http://localhost:5174` in `server/.env` for local dev

## Vite Config Notes
- Dev server on `0.0.0.0:5174` with `allowedHosts: true` (Docker-friendly)
- HMR via WebSocket on `localhost:5174`
- Path alias `@` maps to project root
- `VITE_AI_AGENT_URL` and `__APP_VERSION__` are injected at build time via `define`
