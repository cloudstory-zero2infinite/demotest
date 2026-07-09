export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}

export interface PolicyCorpusFile {
  name: string;
  size: number;
  contentType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OntologyFile {
  name: string;
  path: string;
  description?: string;
  size?: number;
}

export interface Compliance {
  id: string;
  compliance_id: string | null;
  framework: string;
  description: string | null;
  status: string | null;
  updated_at?: string | null;
}

export type ComplianceCreate = Omit<Compliance, 'id' | 'updated_at'>;
export type ComplianceUpdate = Partial<ComplianceCreate>;

export interface NNControlTemplate {
  id: string;
  ctl_name: string;
  ctl_description: string | null;
  enforcement_type: string | null;
  ctld_by: string[] | null;
  ctl_ref_fw: string | null;
  ctl_other_details: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type NNControlTemplateCreate = Omit<NNControlTemplate, 'id' | 'created_at' | 'updated_at'>;
export type NNControlTemplateUpdate = Partial<NNControlTemplateCreate>;

export interface ScfFile {
  name: string;
  size: number;
  contentType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ScfDomain {
  scf_id: string;
  domain_name: string;
  principle: string | null;
  principle_intent: string | null;
  control_count: number | null;
  sort_order: number | null;
}

export interface ScfControl {
  scf_control_id: string;
  scf_id: string;
  scf_domain_label: string | null;
  control_name: string | null;
}

export interface ControlCheck {
  id: string;
  check_id: string;
  title: string;
  description: string | null;
  provider: string;
  service: string | null;
  severity: string;
  source: string;
  remediation: string | null;
  check_metadata?: Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type ControlCheckCreate = Pick<ControlCheck, 'check_id' | 'title'> &
  Partial<Omit<ControlCheck, 'id' | 'created_at' | 'updated_at'>>;
export type ControlCheckUpdate = Partial<Omit<ControlCheck, 'id' | 'check_id' | 'created_at' | 'updated_at'>>;

export interface ControlCheckAssociation {
  id: string;
  kind: 'scf' | 'nn';
  scf_control_id: string | null;
  nn_ctl_name: string | null;
  check_id: string;
  created_by: string | null;
  created_at: string | null;
  title: string | null;
  provider: string | null;
  severity: string | null;
}

export interface ScfCounts {
  domains: number;
  controls: number;
  frameworks?: number;
  control_framework_pairs?: number;
  risks?: number;
  control_risk_pairs?: number;
}

export interface ScfFilesResponse {
  files: ScfFile[];
  counts: ScfCounts;
}

export interface ScfUploadResult {
  name: string;
  counts: ScfCounts;
  skipped_controls: number;
  skipped_sample: { scfControlId: string; scfId: string }[];
}

// ───────── Platform Analytics ─────────
export type TenantType = 'consultant' | 'organisation';
// Users are either a tenant member (consultant/organisation) or, if they appear
// in the activity log but belong to no tenant's member list, an "orphan".
export type UserType = TenantType | 'orphan';

export interface AnalyticsTenant {
  org_id: string;
  name: string;
  type: TenantType;
  created_at: string;
  user_count: number;
}

export interface AnalyticsUser {
  user_id: string;
  org_id: string | null;
  type: UserType;
  first_seen: string | null;
  last_login: string | null;
}

export interface AnalyticsModuleUsage {
  module: string;
  action: string;
  cnt: number;
}

export interface AnalyticsFeedback {
  id: string;
  description: string | null;
  user_name: string | null;
  user_email: string | null;
  org_name: string | null;
  type: TenantType;
  rating: number | null;
  created_at: string;
}

export interface PlatformAnalytics {
  tenants: AnalyticsTenant[];
  users: AnalyticsUser[];
  moduleUsage: AnalyticsModuleUsage[];
  feedback: AnalyticsFeedback[];
}

export interface CampaignMarker {
  id: string;
  label: string;
  event_date: string; // YYYY-MM-DD
  created_by: string | null;
  created_at: string;
}

export type ReleaseEnvironment = 'prod' | 'pre-prod';
export type ReleaseStatus = 'success' | 'failed';

export interface ReleaseRecord {
  id: string;
  version: string | null;
  environment: ReleaseEnvironment;
  status: ReleaseStatus;
  released_at: string;
  pushed_by: string | null;
  commit_sha: string | null;
  run_number: number | null;
  run_id: number | null;
  notes: string | null;
  created_at: string;
}

// ───────── QA / E2E test runner ─────────
export interface QaSuite {
  id: string;
  name: string;
  specFiles: number;
}

export type QaEnvironment = 'pre-prod' | 'prod';

export interface QaEnvOption {
  id: QaEnvironment;
  url: string;
}

export interface QaSuitesResponse {
  baseUrl: string;
  environments: QaEnvOption[];
  busy: boolean;
  suites: QaSuite[];
}

export type QaRunStatus = 'running' | 'passed' | 'failed' | 'error';
export type QaTestStatus = 'passed' | 'failed' | 'skipped' | 'flaky';

export interface QaFailure {
  suite: string;
  title: string;
  error: string;
}

// A single test case as enumerated by `--list` (no status yet).
export interface QaTestListItem {
  id: string;
  suite: string;
  title: string;
}

export interface QaTestsResponse {
  tests: QaTestListItem[];
}

// A single test case's result within a run. `id` is present in final parsed
// results; live progress entries are merged by suite+title instead.
export interface QaTest {
  id?: string;
  suite: string;
  title: string;
  status: QaTestStatus;
  durationMs: number;
  error?: string;
}

export interface QaSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  durationMs: number;
}

export interface QaRun {
  runId: string;
  suite: string;
  environment: QaEnvironment;
  status: QaRunStatus;
  baseUrl: string;
  version: string | null;
  startedAt: string;
  finishedAt: string | null;
  summary: QaSummary | null;
  failures: QaFailure[];
  tests: QaTest[];
  progress: { total: number; completed: number } | null;
  error: string | null;
  hasReport: boolean;
}

// A persisted run row from the `e2e_runs` table (written by the GitHub Action).
// Powers the "runs over time" chart on the Quality Analytics tab.
export interface QaRunRecord {
  id: string;
  source: string; // 'post-deploy' | 'manual' | 'test'
  environment: string; // 'pre-prod' | 'prod'
  app_version: string | null;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  success_pct: number | null;
  confidence: number | null;
  status: string | null;
  finished_at: string | null;
  created_at: string;
}
