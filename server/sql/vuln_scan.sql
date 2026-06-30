-- ════════════════════════════════════════════════════════════════════════════
--  ZTI Hub Services — Vulnerability Assessment (OpenVAS) schema
--  Applied directly to Supabase (the repo has no migration runner). This file is
--  kept as the source-of-truth record of the schema the /api/vuln-scan routes and
--  the zti CLI expect.
-- ════════════════════════════════════════════════════════════════════════════

-- One row per `zti vuln-scan <target>` invocation. Created by the CLI (device
-- token) on consent, updated as the detached OpenVAS scan progresses.
create table if not exists public.vuln_scan_jobs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  device_id    uuid references public.zti_hub_devices(id) on delete set null,
  target_type  text not null check (target_type in ('all','subnet','ip','local')),
  target_value text,                                  -- CIDR / IP / null for all|local
  authorized   boolean not null default false,        -- operator affirmed authorization
  consent_by   text,                                  -- device name / operator identity
  consent_at   timestamptz,
  status       text not null default 'running'
               check (status in ('running','completed','failed','staged','imported')),
  summary      jsonb,                                 -- { total, critical, high, ... }
  scanner      text not null default 'openvas',
  is_mock      boolean not null default true,
  started_at   timestamptz default now(),
  finished_at  timestamptz,
  created_at   timestamptz default now()
);
create index if not exists idx_vuln_scan_jobs_org on public.vuln_scan_jobs(org_id, created_at desc);

-- Staged findings awaiting analyst review in the GUI (ZTI Hub Services →
-- Vulnerability Assessment). Uploaded by the CLI when the operator chooses
-- "send to ZTI workspace". Committed into vulnerability_management on approval.
create table if not exists public.vuln_scan_findings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  scan_job_id    uuid not null references public.vuln_scan_jobs(id) on delete cascade,
  host           text,                                -- scanned IP / hostname
  port           text,
  cve_id         text,
  vuln_name      text not null,
  description    text,
  cvss_score     numeric,
  severity       text,                                -- Critical|High|Medium|Low|Info
  priority       text,                                -- computed (priority.ts): KEV-aware
  in_kev         boolean default false,
  raw            jsonb,                               -- full OpenVAS result payload
  asset_id       uuid references public.assets(id) on delete set null,
  review_status  text not null default 'pending'
                 check (review_status in ('pending','approved','discarded','imported')),
  imported_vuln_id uuid,                              -- vulnerability_management.id after import
  created_at     timestamptz default now()
);
create index if not exists idx_vuln_scan_findings_job on public.vuln_scan_findings(scan_job_id);
create index if not exists idx_vuln_scan_findings_org on public.vuln_scan_findings(org_id);

-- Scan-derived columns on the existing vulnerability table so the GUI can show
-- CVE / CVSS / priority natively (sortable/filterable) on imported vulns.
alter table public.vulnerability_management
  add column if not exists cve_id      text,
  add column if not exists cvss_score  numeric,
  add column if not exists priority    text,
  add column if not exists scan_job_id uuid;

-- Match the rest of the app: data is reached only via the service-role key, which
-- bypasses RLS. Enable RLS with no permissive policies so nothing else can read.
alter table public.vuln_scan_jobs     enable row level security;
alter table public.vuln_scan_findings enable row level security;

-- AD audit jobs (scanner='ad') import findings with derived_from='AD'. The original
-- vulnerability_management check only allowed KEV|Scanning|PT|Reported-Ext.
alter table public.vulnerability_management
  drop constraint if exists vulnerability_management_derived_from_check;

alter table public.vulnerability_management
  add constraint vulnerability_management_derived_from_check
  check (derived_from in ('KEV', 'Scanning', 'PT', 'Reported-Ext', 'AD'));
