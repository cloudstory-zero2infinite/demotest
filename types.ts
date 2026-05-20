
export type ProgramStatus = 'Planned' | 'InProgress' | 'Completed' | 'Blocked' | 'Escalated';

export interface ProgramTask {
  id: string;
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

export type ProgramTaskCreate = Omit<ProgramTask, 'id' | 'last_updated'>;

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
    ctl_ref_fw: string | null;
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

export type PolicyWorkflowStatus = 'draft' | 'to_review' | 'in_approval' | 'approved' | 'reviewed';

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

// Mapper Agent — Phase 1: triggered from the Policy tab.
export interface MapperRunResult {
  status: 'ok' | 'needs_master';
  message?: string;
  trigger?: string;
  master_policy_id?: string;
  summary?: {
    domains: number;
    functions: number;
    child_links: number;
    orphans: number;
  };
  extraction?: {
    security_domains: Array<{
      name: string;
      description?: string | null;
      confidence?: number | null;
      functions?: Array<{ name: string; description?: string | null; confidence?: number | null }>;
    }>;
    child_policy_links: Array<{
      policy_id: string;
      confidence: number;
      rationale?: string | null;
      matched_on?: string | null;
      covers_domains?: string[];
    }>;
  };
}

export interface MapperGraphNode {
  id: string;
  type: 'MasterPolicy' | 'ChildPolicy' | 'OrphanPolicy' | 'SecurityDomain' | 'SecurityFunction';
  data: Record<string, any>;
}

export interface MapperGraphEdge {
  id: string;
  source: string;
  target: string;
  label: 'DEFINES' | 'CONTAINS' | 'HAS_CHILD' | 'COVERS';
  data?: { confidence?: number | null; rationale?: string | null; matched_on?: string | null };
}

export interface MapperGraph {
  nodes: MapperGraphNode[];
  edges: MapperGraphEdge[];
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
  type: 'approval_requested' | 'approved' | 'rejected' | 'reviewed';
  message: string;
  read: boolean;
  org_id: string;
  created_at: string;
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
