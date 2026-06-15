-- ════════════════════════════════════════════════════════════════════════════
--  ZTI Hub Services — CSPM (Cloud Security Posture Management) schema
--  Applied directly to Supabase (the repo has no migration runner). This file is
--  the source-of-truth record of the schema the /api/cspm-scan routes and the
--  `zti cspm` CLI expect. Mirrors server/sql/vuln_scan.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── control_registry.ctl_status: add 'NotAssessed' and make it the default ────
-- Controls now start life "NotAssessed" (grey) until a CSPM posture scan (or a
-- manual enforcement) moves them. The fwcr agent omits ctl_status on INSERT, so
-- the column default below is what new framework standards inherit.
alter table public.control_registry
  drop constraint if exists control_registry_ctl_status_check;
alter table public.control_registry
  add constraint control_registry_ctl_status_check
  check (ctl_status = any (array['Enforced','NotEnforced','In-Review','NotAssessed']));
alter table public.control_registry
  alter column ctl_status set default 'NotAssessed';

-- One-time backfill: flip never-assessed controls to NotAssessed. Anything that
-- carries a maturity score, evidence, or a pending review is left untouched.
-- update public.control_registry
--   set ctl_status = 'NotAssessed', updated_at = now()
--   where ctl_status = 'NotEnforced'
--     and coalesce(maturity_score, 0) = 0
--     and jsonb_array_length(coalesce(evidence_metadata, '[]'::jsonb)) = 0
--     and id not in (select control_id from public.control_evidence_reviews where status = 'pending');

-- One row per `zti cspm scan` invocation. Created by the CLI (device token),
-- updated as the (detached) posture scan runs Prowler across the org's controls.
create table if not exists public.cspm_scan_jobs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  device_id    uuid references public.zti_hub_devices(id) on delete set null,
  scope_type   text not null default 'all' check (scope_type in ('all','framework','provider','control')),
  scope_value  text,                                   -- framework name / SCF id / provider / null
  provider     text,                                   -- gcp (provider-aware; gcp wired today)
  status       text not null default 'running'
               check (status in ('running','completed','failed','staged','imported')),
  summary      jsonb,                                  -- { controls_total, fully_passed, partially_passed, failed, na }
  scanner      text not null default 'prowler',
  is_mock      boolean not null default true,
  started_at   timestamptz default now(),
  finished_at  timestamptz,
  created_at   timestamptz default now()
);
create index if not exists idx_cspm_scan_jobs_org on public.cspm_scan_jobs(org_id, created_at desc);

-- One row per control assessed in a scan (the staged "finding" unit). Uploaded by
-- the CLI on "send to ZTI workspace". On import each row drives the matched
-- control_registry row's maturity + enforcement (peer-review) flow.
create table if not exists public.cspm_check_results (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  scan_job_id    uuid not null references public.cspm_scan_jobs(id) on delete cascade,
  scf_control_id text,                                 -- link key for SCF-owned controls
  nn_ctl_name    text,                                 -- link key for NN controls
  control_name   text,
  provider       text,
  checks_total   integer not null default 0,
  checks_passed  integer not null default 0,
  checks_failed  integer not null default 0,
  checks_na      integer not null default 0,
  pass_pct       integer not null default 0,           -- passed / (passed+failed), 0-100
  result_status  text not null default 'na' check (result_status in ('pass','partial','fail','na')),
  raw            jsonb,                                 -- [{check_id, status, total, failed}]
  review_status  text not null default 'pending'
                 check (review_status in ('pending','approved','discarded','imported')),
  imported_control_id uuid references public.control_registry(id) on delete set null,
  created_at     timestamptz default now()
);
create index if not exists idx_cspm_results_job on public.cspm_check_results(scan_job_id);
create index if not exists idx_cspm_results_org on public.cspm_check_results(org_id);

-- Match the rest of the app: reached only via the service-role key (bypasses RLS).
alter table public.cspm_scan_jobs     enable row level security;
alter table public.cspm_check_results enable row level security;
