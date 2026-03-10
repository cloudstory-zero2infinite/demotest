# ZeroTo1 GRC - Claude Code Guide

## Project Overview
ZeroTo1 GRC is a Governance, Risk & Compliance (GRC) SaaS platform with multi-tenant support. It provides security teams and CXOs with tools to manage programs, internal controls, assets, policies, vulnerabilities, compliance, and contacts.

## Architecture

### Frontend (`/`)
- **React 19** + **TypeScript** + **Vite 6**
- **Recharts** for data visualization
- Tailwind CSS utility classes for styling (dark mode supported)
- Entry: `App.tsx` (large file — use offset/limit when reading)
- Components: `components/` directory
- Types: `types.ts`
- Supabase service layer: `services/supabase.ts`

### Backend (`/server/`)
- **Express.js** (Node.js, ESM modules)
- Handles secure server-side operations (e.g., Resend email via `/api/feedback/email`)
- Entry: `server/src/index.js`
- Routes: `server/src/routes/`
- Port: 3001

## Key Commands

### Frontend
```bash
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Production build
npm run preview      # Preview production build
```

### Backend
```bash
npm run server          # Start Express server (from root)
npm run server:install  # Install server dependencies
# OR from server/ directory:
npm run dev             # node --watch src/index.js
```

## Environment Variables
- Copy `.env.example` to `.env`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — Supabase project credentials
- `VITE_API_BASE_URL` — Backend URL (default: `http://localhost:3001`)
- Server also needs env vars for Resend API key and `FRONTEND_URL`

## Database: Supabase
- All data is multi-tenant, scoped by `org_id`
- Auth: Supabase Auth (session-based)
- RLS policies enforce `org_id` and `user_id` ownership
- `org_onboarding` table maps users to organizations with roles
- Key tables: `program`, `internal_control_catalogue`, `assets`, `policy_documents`, `vulnerability_management`, `compliance`, `contacts`, `all_activity_log`, `program_activity_log`

## User Roles
- **security-staff**: Full operational view
- **cxo**: Executive summary view
- DB roles: `user`, `admin`, `tenant_admin`

## Data Patterns
- All CRUD functions in `services/supabase.ts` follow consistent patterns
- Insert operations always attach `user_id` (from session) and `org_id` for RLS
- Vulnerability data is manually joined with assets in the application layer (no DB-level join)
- Policy nodes/links/workflow templates currently use localStorage as mock persistence

## Vite Config Notes
- Server hosts on `0.0.0.0:5173` with `allowedHosts: true` (Docker-friendly)
- HMR configured for `localhost:5173`
- Path alias `@` maps to project root

## Current Branch
`docker-feature` — active development branch
