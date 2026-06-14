
export type ProgramStatus = 'Planned' | 'InProgress' | 'Completed' | 'Blocked' | 'Escalated';

export interface ProgramTask {
  id: string;
  task_code: string | null;
  parent_id: string | null;
  program_name: string;
  description: string;
  month: string;
  due_date: string | null;
  assignee: string | null;
  status: ProgramStatus;
  progress_percent: number;
  comments: string | null;
  last_updated: string;
}

// task_code is server-generated; parent_id is optional (set when creating a child task).
export type ProgramTaskCreate = Omit<ProgramTask, 'id' | 'last_updated' | 'task_code' | 'parent_id'> & { parent_id?: string | null };

export type ProgramTaskUpdate = Partial<Omit<ProgramTask, 'id' | 'last_updated'>>;

export interface ActivityLog {
  id: number;
  program_id: string;
  activity: string;
  created_at: string;
}

// Governance Types

// Internal Controls
export type InternalControlStatus = 'Enforced' | 'Not-Enforced' | 'InProgress';

export interface InternalControl {
    id: string; // uuid
    ctl_id: string;
    name: string;
    description: string | null;
    status: InternalControlStatus | null;
    evidence_file_url: string | null;
    compliance_tag3: string[] | null; // This is the correct jsonb field
    updated_at: string | null;
}

export type InternalControlCreate = {
    ctl_id: string;
    name: string;
    description?: string | null;
    status?: InternalControlStatus | null;
    evidence_file_url?: string | null;
    compliance_tag3?: string[] | null; // Mapped to the correct jsonb field
};
export type InternalControlUpdate = Partial<InternalControlCreate>;


// Assets
export type AssetCriticality = 'High' | 'Medium' | 'Low';
export type AssetGovernedStatus = 'Governed' | 'Non-Governed';
export type AssetExposure = 'Internal' | 'External' | 'DMZ';
export type AssetCategory = 'User Endpoints' | 'Mobile Assets' | 'Network & Physical Security' | 'Virtual & On-Prem Servers' | 'Cloud Services & SaaS' | 'Identity & Access (M365)' | 'Personnel Matrix' | 'Software & SaaS Applications' | 'Information & Data Assets' | 'Physical/Hardware' | 'Software' | 'Services/Infra' | 'Information';
export type AssetSource = 'Manual' | 'AI' | 'File Upload' | 'API';

// Custom Field Types
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface AssetCustomField {
    id: string;
    org_id: string;
    field_name: string;
    field_label: string;
    field_type: CustomFieldType;
    field_options?: string[] | null;
    is_required: boolean;
    display_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AssetCustomFieldValue {
    id: string;
    asset_id: string;
    field_id: string;
    field_value: string | null;
    created_at: string;
    updated_at: string;
}

export interface AssetCustomFieldCreate {
    field_name: string;
    field_label: string;
    field_type: 'text' | 'number' | 'date' | 'select' | 'boolean';
    field_options?: string[] | null;
    is_required?: boolean;
    display_order?: number;
}

export interface AssetCustomFieldUpdate {
    field_label?: string;
    field_type?: 'text' | 'number' | 'date' | 'select' | 'boolean';
    field_options?: string[] | null;
    is_required?: boolean;
    display_order?: number;
    is_active?: boolean;
}

export interface Asset {
    id: string;
    asset_id: string;
    name: string;
    asset_owner?: string | null;
    business_unit?: string | null;
    physical_location?: string | null;
    criticality: AssetCriticality;
    details: string;
    governed_status: AssetGovernedStatus;
    vulnerability_count: number;
    exposure: AssetExposure;
    category: AssetCategory;
    ip_address?: string | null;
    mac_id?: string | null;
    source?: AssetSource | null;
    nn_controls?: { ctl_id: string; ctl_name: string }[] | null;
    org_id?: string | null;
    user_id?: string | null;
    created_at: string;
    // Custom fields as JSONB
    custom_fields?: Record<string, any> | null;
}
export type AssetCreate = Omit<Asset, 'id' | 'created_at'>;
export type AssetUpdate = Partial<AssetCreate>;

// Asset Relationships
export interface AssetRelationship {
    id: string;
    source_asset_id: string;
    target_asset_id: string;
    relationship_type: string | null;
    created_at: string;
    custom_fields?: Record<string, any>;
}

export type AssetRelationshipCreate = Omit<AssetRelationship, 'id' | 'created_at'>;
export type AssetRelationshipUpdate = Partial<AssetRelationshipCreate>;


// Policies
export type PolicyStatus = 0 | 1; // 0: Draft, 1: Published
export type DocumentContentType = 0 | 1 | 2; // 0: Use Content, 1: Use Attachments, 2: Use URL
export type PolicyPermissions = 'public' | 'private' | 'custom-roles';

export interface PolicyDocument {
    id: string;
    name: string;
    description: string | null;
    document_content: DocumentContentType;
    content_editor_text: string | null;
    url: string | null;
    grc_contact: string;
    policy_reviewer_contact: string;
    tags: string | null;
    published_date: string;
    next_review_date: string;
    policy_labels: string | null;
    related_projects: string | null;
    status: PolicyStatus;
    document_type: string | null;
    version: string;
    policy_portal_permissions: PolicyPermissions;
    custom_roles: string | null;
    related_documents: string | null;
    owner_name: string | null;
    policy_doc_link: string | null;
    created_at: string;
    updated_at: string;
}

export type PolicyDocumentCreate = Omit<PolicyDocument, 'id' | 'created_at' | 'updated_at'>;
export type PolicyDocumentUpdate = Partial<PolicyDocumentCreate>;

// Capability Register Types
export interface Capability {
    id: string;
    capab_id: string;
    capab_name: string;
    capab_provider: string[];
    capab_cmdb_id: string[];
    capab_owner: string;
    capab_other_details: string | null;
    org_id: string;
    user_id: string | null;
    created_at: string;
    updated_at: string;
    custom_fields?: Record<string, any>;
}

export type CapabilityCreate = Omit<Capability, 'id' | 'created_at' | 'updated_at'>;
export type CapabilityUpdate = Partial<Omit<CapabilityCreate, 'org_id' | 'user_id'>>;

// Control Registry Types
export type ControlStatus = 'Enforced' | 'NotEnforced' | 'In-Review';
export type ControlType = 'NN' | 'Regulatory' | 'Standard' | 'Custom';
export type EnforcementType = 'org_wide' | 'Asset_specific' | 'BU_specific';

export interface ControlRegistry {
    id: string;
    ctl_id: string;
    ctl_name: string;
    ctl_status: ControlStatus;
    ctl_type: ControlType;
    enforcement_type: EnforcementType;
    ctl_description: string | null;
    ctld_by: string[];
    /**
     * Array of framework canonical names that claim this control. Migrated
     * from TEXT to JSONB in 2026-05; the Fw-ControlRegistry agent manages this
     * for rows where scf_control_id is set.
     */
    ctl_ref_fw: string[];
    ctl_other_details: string | null;
    evidence_metadata: EvidenceFileMetadata[] | null;
    enforced_by: string | null;
    reviewed_by: string | null;
    org_id: string;
    user_id: string | null;
    created_at: string;
    updated_at: string;
    maturity_score?: number | null;
    custom_fields?: Record<string, any>;
    /** Set only on rows owned by the Fw-ControlRegistry agent. */
    scf_control_id?: string | null;
}

// ── ZTI Hub (control checks) ─────────────────────────────────────────────────
export interface ZtiHubStatus {
  active: boolean;
  deviceName?: string | null;
  lastBeaconAt?: string | null;
  gcpIntegrated?: boolean;
}

export interface ZtiHubDevice {
  id: string;
  device_name: string | null;
  gcp_integrated: boolean;
  gcp_project_id: string | null;
  last_beacon_at: string | null;
  created_at: string;
  revoked_at: string | null;
  online: boolean;
}

export interface ControlCheckResult {
  id: string;
  check_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  result_status: 'pass' | 'fail' | 'error' | null;
  result: any;
  requested_at: string;
  finished_at: string | null;
}

// ── SCF Frameworks & Fw-ControlRegistry recompute ────────────────────────────

export interface ScfFramework {
  name: string;          // canonical key, e.g. "ISO 27001 2022"
  display_name: string;  // shown in the UI
  region: 'Global' | 'US' | 'EMEA' | 'APAC' | 'Americas' | string;
  is_common: boolean;
  sort_order: number;
}

// An SCF control as claimed by a specific framework, with that framework's
// native reference IDs (e.g. ISO clauses). Used by the Compliance SCF browser.
export interface ScfFrameworkControl {
  scf_control_id: string;   // SCF control key, e.g. "GOV-01.1"
  scf_id: string;           // SCF id
  control_name: string;
  domain: string;           // SCF domain label
  refs: string[];           // framework-native reference IDs (e.g. ["4.4", "5.1", ...])
}

export interface FwcrPreviewSummary {
  to_add: number;
  to_update: number;
  to_delete_unenforced: number;
  keep_orphan_enforced: number;
  unchanged: number;
}

export interface FwcrPreview {
  selected_frameworks: string[];
  summary: FwcrPreviewSummary;
  samples: {
    to_add: Array<{ scf_control_id: string; ctl_name: string; ctl_ref_fw: string[] }>;
    to_update: Array<{ scf_control_id: string; ctl_ref_fw_old: string[]; ctl_ref_fw_new: string[] }>;
    to_delete_unenforced: Array<{ scf_control_id: string; ctl_name: string }>;
    keep_orphan_enforced: Array<{ scf_control_id: string; ctl_name: string }>;
  };
}

export interface FwcrApplyResult {
  selected_frameworks: string[];
  applied: { added: number; updated: number; deleted: number };
  kept_orphan_enforced: number;
  unchanged: number;
}

// Dry-run of the NN baseline re-seed (Settings → Org "Recompute" button).
// NN controls are baseline and always applied; recompute only ever *adds* the
// ones missing for the org (never deletes), so to_add is the full delta.
export interface NnPreview {
  to_add: number;
  total_templates: number;
  sample: string[];
}

export interface EvidenceFileMetadata {
    display_name: string;
    storage_path: string;
    original_name: string;
    uploaded_at: string;
    review_id: string;
}

export interface ControlEvidenceReview {
    id: string;
    control_id: string;
    requested_status: 'Enforced' | 'NotEnforced';
    requested_by: string;
    enforced_by_name: string;
    enforced_by_email: string;
    reviewer_id: string | null;
    reviewer_name: string;
    reviewer_email: string;
    status: 'pending' | 'approved' | 'rejected';
    comment: string | null;
    review_comment: string | null;
    evidence_files: { name: string; storage_path: string; original_name: string; size: number; type: string }[];
    org_id: string;
    created_at: string;
    updated_at: string;
}

export interface ControlNotification {
    id: string;
    recipient_id: string;
    control_id: string;
    control_name: string;
    type: 'review_requested' | 'enforcement_approved' | 'enforcement_rejected';
    message: string;
    read: boolean;
    org_id: string;
    created_at: string;
}

export interface OrgNotification {
    id: string;
    recipient_id: string;
    type: 'join_request';
    message: string;
    read: boolean;
    org_id: string;
    created_at: string;
}

export type ControlRegistryCreate = Omit<ControlRegistry, 'id' | 'created_at' | 'updated_at' | 'evidence_metadata' | 'enforced_by' | 'reviewed_by'>;
export type ControlRegistryUpdate = Partial<Omit<ControlRegistryCreate, 'org_id' | 'user_id'>>;

// Vulnerability Management Types
export type VulnerabilityStatus = 'Planned' | 'Remediated' | 'NA';
export type VulnerabilitySource = 'KEV' | 'Scanning' | 'PT' | 'Reported-Ext';

export interface Vulnerability {
    id: string; // Primary key
    name: string;
    description: string | null;
    derived_from: VulnerabilitySource;
    status: VulnerabilityStatus;
    created_at: string;
    updated_at: string;
    asset_id: string | null; // FK to assets.id
    // For joining with assets table
    assets?: { asset_id: string; name: string } | null;
    custom_fields?: Record<string, any>;
}

export type VulnerabilityCreate = Omit<Vulnerability, 'id' | 'created_at' | 'updated_at' | 'assets'>;
export type VulnerabilityUpdate = Partial<VulnerabilityCreate>;


// Compliance Types
export type ComplianceStatus = 'Achieved' | 'In Progress' | 'Not Started';

export interface Compliance {
    id: string; // uuid
    compliance_id: string;
    framework: string;
    description: string | null;
    status: ComplianceStatus | null;
    updated_at: string | null;
    associated_int_ctls: string[] | null; // jsonb
}

export type ComplianceCreate = Omit<Compliance, 'id' | 'updated_at' | 'associated_int_ctls'>;
export type ComplianceUpdate = Partial<ComplianceCreate>;

// Organisation Types
export interface Contact {
    id: string;
    name: string;
    title: string;
    level: number;
    email: string;
    sec_role: string;
    created_at: string;
}

export type ContactCreate = Omit<Contact, 'id' | 'created_at'>;
export type ContactUpdate = Partial<ContactCreate>;

// Organisation Contacts (Manage Members → Contacts)
export interface OrgContact {
    id: string;
    org_id: string;
    name: string;
    email: string;
    department: string;
    created_at: string;
    updated_at: string;
}

export type OrgContactCreate = Pick<OrgContact, 'name' | 'email' | 'department'>;
export type OrgContactUpdate = Partial<OrgContactCreate>;

/** Display format: "Name (Department)" */
export const formatOrgContact = (contact: OrgContact): string =>
    contact.department ? `${contact.name} (${contact.department})` : contact.name;

// --- Activity Log Types ---
export interface AllActivityLog {
  id: number;
  user_id: string | null;
  org_id?: string | null;
  action: string;
  module: string | null;
  entity_id: string | null;
  entity_name: string | null;
  event_data: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  severity: 'info' | 'warning' | 'error' | null;
  source: string | null;
  created_at: string;
    // For joining with contacts table (name + email)
    contacts?: { name: string; email?: string } | null;
    // Enriched fields from organisations and org_onboarding tables
    org_name?: string;
    user_role?: string;
}

// --- Policy V2 Types (Markdown-first workflow) ---

export type PolicyWorkflowStatus = 'draft' | 'to_review' | 'in_approval' | 'approved' | 'reviewed' | 'overdue';

export interface PolicyV2 {
  policy_id: string;
  name: string;
  markdown: string | null;
  policy_ref: string | null;
  policy_status: PolicyWorkflowStatus;
  refresh_date: string | null;
  version: string | null;
  document_type: string | null;
  owner_name: string | null;
  is_master?: boolean;
  org_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Mapper Agent — two triggers:
//   'policies' (from Policy tab):  Master Policy → Security Objectives → SCF Domains + child policies
//   'controls' (from Visualizer):  SCFDomain → Control → Capability → Asset (deterministic joins)
export interface MapperRunResult {
  status: 'ok' | 'needs_master' | 'needs_scf_reference' | 'needs_policies_first';
  message?: string;
  trigger?: string;
  master_policy_id?: string;
  // Loosely typed because keys differ per trigger; consumers read specific
  // keys with `?? 0` and render only what they expect.
  summary?: {
    // 'policies' trigger
    objectives?: number;
    scf_domains?: number;
    child_links?: number;
    orphans?: number;
    // 'controls' trigger
    controls?: number;
    capabilities?: number;
    assets?: number;
    implemented_by_edges?: number;
    enforced_by_edges?: number;
    provided_by_edges?: number;
    controls_with_capabilities?: number;
    total_standard_controls?: number;
  };
  extraction?: {
    security_objectives: Array<{
      name: string;
      description?: string | null;
      confidence?: number | null;
      scf_ids: string[];
    }>;
    child_policy_links: Array<{
      policy_id: string;
      confidence: number;
      rationale?: string | null;
      matched_on?: string | null;
      covers_scf_ids?: string[];
    }>;
  };
}

export interface MapperGraphNode {
  id: string;
  type:
    | 'MasterPolicy'
    | 'ChildPolicy'
    | 'OrphanPolicy'
    | 'SecurityObjective'
    | 'SCFDomain'
    | 'Control'
    | 'Capability'
    | 'Asset'
    | 'Vulnerability';
  data: Record<string, any>;
}

export interface MapperGraphEdge {
  id: string;
  source: string;
  target: string;
  label:
    | 'DEFINES'
    | 'MAPS_TO'
    | 'HAS_CHILD'
    | 'COVERS'
    | 'IMPLEMENTED_BY'
    | 'ENFORCED_BY'
    | 'PROVIDED_BY'
    | 'HAS_VULNERABILITY';
  data?: { confidence?: number | null; rationale?: string | null; matched_on?: string | null };
}

export interface MapperGraph {
  nodes: MapperGraphNode[];
  edges: MapperGraphEdge[];
}

// ─── Due Diligence & TPRM ─────────────────────────────────────────────────
// Maps each of our four canonical answer fields to an existing questionnaire
// column header (or null when none exists and we should append a column).
export interface DueDiligenceColumnMap {
  answer: string | null;
  comments: string | null;
  evidence: string | null;
  rationale: string | null;
}

export interface DueDiligenceAnswer {
  row_index: number;
  answer: string;
  comments: string;
  evidence: string;
  rationale: string;
}

export interface QuestionnaireResult {
  status: string;
  question_column: string;
  column_map: DueDiligenceColumnMap;
  answers: DueDiligenceAnswer[];
  questions_answered: number;
}

export interface DueDiligenceChatResult {
  status: string;
  answer: string;
  sources: string[];
}

// ─── Risk Registry ────────────────────────────────────────────────────────
export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low' | 'None';

export interface RiskRegisterEntry {
  id: string;
  org_id: string;
  risk_id: string;
  risk_grouping: string | null;
  risk_name: string | null;
  risk_description: string | null;
  nist_csf_function: string | null;
  total_controls: number;
  enforced_controls: number;
  total_weight: number;
  enforced_weight: number;
  gap: number;
  inherent_score: number;
  residual_score: number;
  inherent_level: RiskLevel | null;
  residual_level: RiskLevel | null;
  source: 'computed' | 'manual';
  computed_at: string;
}

export interface ManualRiskInput {
  risk_name: string;
  risk_grouping?: string;
  risk_description?: string;
  nist_csf_function?: string;
  inherent_level: RiskLevel;
  residual_level: RiskLevel;
}

export interface RiskComputeResult {
  status: string;
  computed_at: string;
  count: number;
  register: RiskRegisterEntry[];
}

export interface PolicyApproval {
  id: string;
  policy_id: string;
  requested_by: string;
  approver_id: string | null;
  approver_name: string;
  approver_email: string;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  org_id: string;
  created_at: string;
  updated_at: string;
}

export interface PolicyNotification {
  id: string;
  recipient_id: string;
  policy_id: string;
  policy_name: string;
  type: 'approval_requested' | 'approved' | 'rejected' | 'reviewed' | 'policy_expired';
  message: string;
  read: boolean;
  org_id: string;
  created_at: string;
}

// --- Email Templates (Organisation → Templates) ---

export interface EmailTemplate {
  id: string;
  org_id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}

// --- Policy Manager Types ---

export interface PolicyNode {
    id: string;
    name: string;
    sections: string[];
    google_doc_url: string;
    status: 'Draft' | 'Approved';
}

export interface PolicyLink {
    id: string;
    sourceNodeId: string;
    sourceSection: string;
    targetNodeId: string;
    targetSection?: string;
}

export interface WorkflowStep {
    id: string;
    label: string;
    approverEmail?: string;
    nextStepId?: string;
    status: 'Pending' | 'Completed';
}

export interface WorkflowTemplate {
    id: string;
    name: string;
    steps: WorkflowStep[];
}

// --- Policy V2 Types (Markdown-first workflow) ---

export interface PolicyHistoryEntry {
  id: string;
  policy_id: string;
  action: string;
  actor_id: string;
  actor_name: string;
  from_status: string | null;
  to_status: string | null;
  comment: string | null;
  org_id: string;
  created_at: string;
}

// --- User Role and Multi-Tenancy Types ---
export type UserRole = 'user' | 'admin' | 'tenant_admin' | 'cxo';

export interface Organization {
    id: string;
    name: string;
    created_at?: string;
}

export type OrganizationCreate = { name: string };
export type OrganizationUpdate = Partial<OrganizationCreate>;

export interface OrgOnboarding {
    id: string;
    org_id: string;
    user_id: string | null;
    email: string;
    role: UserRole;
    created_at: string;
    updated_at: string;
}

export type OrgOnboardingCreate = Omit<OrgOnboarding, 'id' | 'created_at' | 'updated_at'>;
export type OrgOnboardingUpdate = Partial<OrgOnboardingCreate>;
