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
