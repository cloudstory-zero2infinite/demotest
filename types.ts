
export type ProgramStatus = 'Planned' | 'InProgress' | 'Completed' | 'Blocked';

export interface ProgramTask {
  id: string;
  program_name: string;
  description: string;
  month: string;
  status: ProgramStatus;
  progress_percent: number;
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
export type AssetCategory = 'Information' | 'Technology' | 'Service';

export interface Asset {
    id: string;
    asset_id: string;
    name: string;
    asset_owner?: string | null;
    business_owner?: string | null;
    physical_location?: string | null;
    criticality: AssetCriticality;
    details: string;
    governed_status: AssetGovernedStatus;
    vulnerability_count: number;
    exposure: AssetExposure;
    category: AssetCategory;
    source?: string | null;
    created_at: string;
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

// --- User Role and Multi-Tenancy Types ---
export type UserRole = 'user' | 'admin' | 'tenant_admin';

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
