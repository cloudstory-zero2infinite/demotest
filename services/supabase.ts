import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { ProgramTask, ProgramTaskCreate, ProgramTaskUpdate, ActivityLog, InternalControl, InternalControlCreate, InternalControlUpdate, Asset, AssetCreate, AssetUpdate, Capability, CapabilityCreate, CapabilityUpdate, ControlRegistry, ControlRegistryCreate, ControlRegistryUpdate, ControlEvidenceReview, EvidenceFileMetadata, ControlNotification, OrgNotification, PolicyDocument, PolicyDocumentCreate, PolicyDocumentUpdate, PolicyV2, PolicyApproval, PolicyNotification, Compliance, ComplianceCreate, ComplianceUpdate, Contact, ContactCreate, ContactUpdate, AllActivityLog, Vulnerability, VulnerabilityCreate, VulnerabilityUpdate, PolicyNode, PolicyLink, WorkflowTemplate, ScoringSnapshot, AssetRelationshipCreate, AssetCustomField, AssetCustomFieldCreate, AssetCustomFieldUpdate, MapperRunResult, MapperGraph, EmailTemplate, QuestionnaireResult, DueDiligenceChatResult, RiskRegisterEntry, RiskComputeResult, ManualRiskInput, ZtiHubStatus, ControlCheckResult } from '../types';
import { isDemoEnabled } from './demo/demoMode';
import { handleDemoRequest } from './demo/demoApi';



// Supabase client is kept ONLY for Google Auth (OAuth sign-in/sign-out/session)

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;

const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;



// Handle missing environment variables gracefully

let supabase: SupabaseClient;



if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'undefined' || supabaseAnonKey === 'undefined') {

  console.warn('Supabase environment variables not properly configured. Auth features will be disabled.');

  // Create a mock client for development

  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key', {

    auth: { persistSession: false, autoRefreshToken: false },

  });

} else {

  supabase = createClient(supabaseUrl, supabaseAnonKey, {

    auth: { persistSession: true, autoRefreshToken: true },

  });

}



export { supabase };

export const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};



const API_BASE_URL = ((import.meta as any).env.VITE_API_BASE_URL as string) || 'http://localhost:3001';



// --- Token Cache ---

let cachedToken: string | null = null;

supabase.auth.onAuthStateChange((event, session) => {

  cachedToken = session?.access_token || null;

});

supabase.auth.getSession().then(({ data }) => {

  cachedToken = data.session?.access_token || null;

});



// Internal helper — attaches the user's JWT to every backend request

const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {

  // Demo mode short-circuit: all reads/writes hit an in-memory store, not the backend
  if (isDemoEnabled()) {
    return handleDemoRequest<T>(path, options);
  }

  let token = cachedToken;

  if (!token) {

    const { data } = await supabase.auth.getSession();

    token = data.session?.access_token || null;

    cachedToken = token;

  }



  const response = await fetch(`${API_BASE_URL}${path}`, {

    ...options,

    headers: {

      'Content-Type': 'application/json',

      'Cache-Control': 'no-cache, no-store, must-revalidate',

      'Pragma': 'no-cache',

      ...(token ? { Authorization: `Bearer ${token}` } : {}),

      ...(options.headers || {}),

    },

  });



  if (!response.ok) {

    const err = await response.json().catch(() => ({ message: response.statusText }));

    throw new Error(err.message || `Request failed with status ${response.status}`);

  }



  // Handle 204 No Content

  if (response.status === 204) return undefined as unknown as T;

  return response.json();

};



// --- Organisation & User Functions ---



export interface OrgMeResponse {

  userId: string;

  orgId: string | null;

  orgName: string | null;

  role: string | null;

  email: string | null;

  isOnboarded: boolean;

  onboardingStatus: 'active' | 'pending_approval' | null;

  neededFramework: string[] | null;

}



export const getOrgMe = async (): Promise<OrgMeResponse | null> => {
  try {
    return await apiRequest<OrgMeResponse>('/api/org/me');
  } catch {
    return null;
  }
};

export const getScoringTrend = async (range: string = '1week'): Promise<ScoringSnapshot[]> => {
  try {
    return await apiRequest<ScoringSnapshot[]>(`/api/compliance/scoring-trend?range=${range}`);
  } catch (error) {
    console.error('Error fetching scoring trend:', error);
    return [];
  }
};



export const getUserOrgId = async (): Promise<string | null> => {

  try {

    const me = await apiRequest<OrgMeResponse>('/api/org/me');

    return me.orgId;

  } catch {

    return null;

  }

};



export const getOrganizationUsers = async (): Promise<any[]> => {

  try {

    return await apiRequest<any[]>('/api/org/users');

  } catch {

    return [];

  }

};



export const deleteMyAccount = async (): Promise<void> => {

  return apiRequest<void>('/api/org/delete-my-account', { method: 'DELETE' });

};



// --- Org Notifications ---



export const getOrgNotifications = async (): Promise<OrgNotification[]> => {

  try {

    return await apiRequest<OrgNotification[]>('/api/org/notifications');

  } catch {

    return [];

  }

};



export const markOrgNotificationRead = async (id: string): Promise<void> => {
  return apiRequest<void>(`/api/org/notifications/${id}/read`, { method: 'PUT' });
};

export const markAllNotificationsRead = async (): Promise<void> => {
  return apiRequest<void>('/api/org/notifications/read-all', { method: 'PUT' });
};

export const updateMemberRole = async (id: number, role: string): Promise<any> => {
  return apiRequest(`/api/org/update-role/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
};

export const inviteMember = async (email: string): Promise<any> => {
  return apiRequest('/api/org/invite', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};



export const getUserRole = async (): Promise<string | null> => {

  try {

    const me = await apiRequest<OrgMeResponse>('/api/org/me');

    return me.role;

  } catch {

    return null;

  }

};



export const getUserIdByEmail = async (_email: string): Promise<string | null> => {

  return null;

};



export const onboardUserToOrganization = async (orgId: string, email: string, role: string = 'user', description?: string): Promise<any> => {

  return apiRequest('/api/org/onboard', {

    method: 'POST',

    body: JSON.stringify({ orgId, email, role, description }),

  });

};



// --- Onboarding Setup ---



export const setupIndividual = async (): Promise<any> => {

  return apiRequest('/api/org/setup/individual', { method: 'POST' });

};



export const setupCreateOrg = async (name: string, location: string, website?: string): Promise<any> => {

  return apiRequest('/api/org/setup/create-org', {

    method: 'POST',

    body: JSON.stringify({ name, location, website }),

  });

};



export const setupJoinRequest = async (adminEmail: string): Promise<any> => {

  return apiRequest('/api/org/setup/join-request', {

    method: 'POST',

    body: JSON.stringify({ adminEmail }),

  });

};



export const getPendingApprovals = async (): Promise<any[]> => {

  try {

    return await apiRequest<any[]>('/api/org/pending-approvals');

  } catch {

    return [];

  }

};



export const approveMember = async (id: number): Promise<any> => {

  return apiRequest(`/api/org/approve-member/${id}`, { method: 'POST' });

};



export const rejectMember = async (id: number): Promise<any> => {

  return apiRequest(`/api/org/reject-member/${id}`, { method: 'POST' });

};



export const removeMember = async (id: number): Promise<void> => {

  return apiRequest(`/api/org/remove-member/${id}`, { method: 'DELETE' });

};



// --- Program Milestone Functions ---



export const getTaskById = async (id: string): Promise<ProgramTask> => {
  return apiRequest(`/api/program/${id}`);
};

export const addActivityLog = async (programId: string, payload: any) => {
  const body = typeof payload === 'string' ? { activity: payload } : payload;
  return apiRequest(`/api/program/${programId}/activity`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

export const updateActivityLog = async (programId: string, activityId: string, payload: any) => {
  return apiRequest(`/api/program/${programId}/activity/${activityId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
};

export const deleteActivityLog = async (programId: string, activityId: string) => {
  return apiRequest(`/api/program/${programId}/activity/${activityId}`, {
    method: 'DELETE',
  });
};

    

    // Trigger activity update event for real-time refresh

    if (typeof window !== 'undefined') {

      window.dispatchEvent(new CustomEvent('activity-update'));

    }





export const getTasks = async (): Promise<ProgramTask[]> => {

  return apiRequest<ProgramTask[]>('/api/program');

};



export const addTask = async (task: ProgramTaskCreate): Promise<ProgramTask> => {

  return apiRequest<ProgramTask>('/api/program', {

    method: 'POST',

    body: JSON.stringify(task),

  });

};



export const bulkAddTasks = async (tasks: ProgramTaskCreate[]): Promise<ProgramTask[]> => {

  const response = await apiRequest<{ data: ProgramTask[], duplicates: number, added: number }>('/api/program/bulk', {

    method: 'POST',

    body: JSON.stringify(tasks),

  });

  

  // Handle the new response format

  if (response && typeof response === 'object' && 'data' in response) {

    return response.data || [];

  }

  

  // Fallback for old format (if any)

  return Array.isArray(response) ? response : [];

};



export const updateTask = async (id: string, updates: ProgramTaskUpdate): Promise<ProgramTask> => {
    console.log('🔍 DEBUG: updateTask API call - ID:', id, 'updates:', updates);
    console.log('🔍 DEBUG: updateTask API call - Status being sent:', updates.status);
    try {
        const result = await apiRequest<ProgramTask>(`/api/program/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        });
        console.log('🔍 DEBUG: updateTask API call - SUCCESS - Result:', result);
        return result;
    } catch (error) {
        console.log('🔍 DEBUG: updateTask API call - ERROR:', error);
        throw error;
    }
};



export const deleteTask = async (id: string): Promise<void> => {
    return apiRequest<void>(`/api/program/${id}`, { method: 'DELETE' });
};

// Attach (or, with null, detach) an existing task under a parent. Two-level only.
export const setTaskParent = async (childId: string, parentId: string | null): Promise<ProgramTask> => {
    return apiRequest<ProgramTask>(`/api/program/${childId}/parent`, {
        method: 'PUT',
        body: JSON.stringify({ parent_id: parentId }),
    });
};



export const getActivityLogs = async (programId: string): Promise<ActivityLog[]> => {

  return apiRequest<ActivityLog[]>(`/api/program/${programId}/activity`);

};



export const getProgramHistory = async (id: string): Promise<AllActivityLog[]> => {

  return apiRequest<AllActivityLog[]>(`/api/program/${id}/history`);

};



export const getAllOrgActivityLogs = async (): Promise<ActivityLog[]> => {

  return apiRequest<ActivityLog[]>('/api/activity/program');

};



// --- Governance: File Handling (kept as direct Supabase storage — no sensitive data) ---



const GRC_DOCUMENTS_BUCKET = 'grc-documents';



export const uploadFile = async (file: File, pathPrefix: string): Promise<string> => {

  if (isDemoEnabled()) {
    // Demo: no real upload — return a stable placeholder URL
    return `https://demo.local/files/${pathPrefix}/${file.name}`;
  }

  const filePath = `${pathPrefix}/${Date.now()}-${file.name}`;

  const { error } = await supabase.storage.from(GRC_DOCUMENTS_BUCKET).upload(filePath, file);

  if (error) throw error;

  const { data } = supabase.storage.from(GRC_DOCUMENTS_BUCKET).getPublicUrl(filePath);

  return data.publicUrl;

};



export const getFileUrl = (filePath: string): string => {

  const { data } = supabase.storage.from(GRC_DOCUMENTS_BUCKET).getPublicUrl(filePath);

  return data.publicUrl;

};



export const getStoragePublicUrl = (bucket: string, filePath: string): string => {

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return data.publicUrl;

};



export const createSignedUrl = async (bucket: string, filePath: string, expiresIn: number = 60): Promise<string> => {

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn);

  if (error) throw error;

  return data.signedUrl;

};



// --- Governance: Internal Controls ---



export const getComplianceTags = async (): Promise<string[]> => {

  try {

    return await apiRequest<string[]>('/api/controls/compliance-tags');

  } catch {

    return [];

  }

};



export const getInternalControls = async (): Promise<InternalControl[]> => {

  return apiRequest<InternalControl[]>('/api/controls');

};



export const addInternalControl = async (control: InternalControlCreate): Promise<InternalControl> => {

  return apiRequest<InternalControl>('/api/controls', {

    method: 'POST',

    body: JSON.stringify(control),

  });

};



export const updateInternalControl = async (id: string, updates: InternalControlUpdate): Promise<InternalControl> => {

  return apiRequest<InternalControl>(`/api/controls/${id}`, {

    method: 'PUT',

    body: JSON.stringify(updates),

  });

};



export const deleteInternalControl = async (id: string): Promise<void> => {

  return apiRequest<void>(`/api/controls/${id}`, { method: 'DELETE' });

};



export const bulkAddInternalControls = async (controls: InternalControlCreate[]): Promise<InternalControl[]> => {

  return apiRequest<InternalControl[]>('/api/controls/bulk', {

    method: 'POST',

    body: JSON.stringify(controls),

  });

};



// --- Governance: Assets ---



export const getAssets = async (): Promise<Asset[]> => {

  return apiRequest<Asset[]>('/api/assets');

};



export const addAsset = async (asset: AssetCreate): Promise<Asset> => {

  return apiRequest<Asset>('/api/assets', {

    method: 'POST',

    body: JSON.stringify(asset),

  });

};



export const updateAsset = async (id: string, updates: AssetUpdate): Promise<Asset> => {

  return apiRequest<Asset>(`/api/assets/${id}`, {

    method: 'PUT',

    body: JSON.stringify(updates),

  });

};



export const deleteAsset = async (id: string): Promise<void> => {

  return apiRequest<void>(`/api/assets/${id}`, { method: 'DELETE' });

};



export const deleteAssetsBulk = async (ids: string[]): Promise<void> => {

  return apiRequest<void>(`/api/assets/bulk`, { 

    method: 'DELETE', 

    body: JSON.stringify({ ids }) 

  });

};



export const bulkAddAssets = async (assets: AssetCreate[]): Promise<Asset[]> => {

  const result = await apiRequest<{ data: Asset[]; inserted: number; total: number; errors: number; errorDetails?: any[] }>('/api/assets/bulk', {

    method: 'POST',

    body: JSON.stringify(assets),

  });

  

  // Handle both simple array response and chunked response format

  if (result && typeof result === 'object' && 'data' in result) {

    if (result.errors > 0) {

      console.warn(`Bulk import completed with ${result.errors} errors. ${result.inserted}/${result.total} assets successfully imported.`);

      if (result.errorDetails) {

        console.error('Error details:', result.errorDetails);

      }

    }

    if (Array.isArray(result.data) && result.data.length > 0) {
      return result.data;
    }
    // Fast bulk routes may skip returning rows to reduce response size.
    if (typeof result.inserted === 'number' && result.inserted > 0) {
      return Array.from({ length: result.inserted }, () => ({}) as Asset);
    }
    return [];

  }

  

  // Fallback for simple array response (small payloads)

  return Array.isArray(result) ? result : [];

};



// --- Governance: Policies V2 (markdown-first workflow) ---



export const getPolicies = async (): Promise<PolicyV2[]> => {

  return apiRequest<PolicyV2[]>('/api/policies');

};



export const addPolicy = async (markdown: string, policy_status: string = 'draft'): Promise<PolicyV2> => {

  return apiRequest<PolicyV2>('/api/policies', {

    method: 'POST',

    body: JSON.stringify({ markdown, policy_status }),

  });

};



export const updatePolicy = async (id: string, updates: { markdown?: string; policy_status?: string }): Promise<PolicyV2> => {

  return apiRequest<PolicyV2>(`/api/policies/${id}`, {

    method: 'PUT',

    body: JSON.stringify(updates),

  });

};



// ── Master policy + Mapper Agent ──────────────────────────────────────────
export const getMasterPolicy = async (): Promise<PolicyV2 | null> => {
  return apiRequest<PolicyV2 | null>('/api/policies/master');
};

export const setPolicyMaster = async (
  id: string,
  is_master: boolean = true,
): Promise<{ policy_id: string; name: string; is_master: boolean }> => {
  return apiRequest(`/api/policies/${id}/master`, {
    method: 'PATCH',
    body: JSON.stringify({ is_master }),
  });
};

export const runMapper = async (trigger: string = 'policies'): Promise<MapperRunResult> => {
  return apiRequest<MapperRunResult>('/api/mapper/run', {
    method: 'POST',
    body: JSON.stringify({ trigger }),
  });
};

export const getMapperGraph = async (masterPolicyId?: string): Promise<MapperGraph> => {
  const qs = masterPolicyId ? `?master_policy_id=${encodeURIComponent(masterPolicyId)}` : '';
  return apiRequest<MapperGraph>(`/api/mapper/graph${qs}`);
};

// ─── Due Diligence & TPRM ─────────────────────────────────────────────────
export const answerQuestionnaire = async (
  headers: string[],
  rows: Record<string, any>[],
  questionColumn?: string | null,
): Promise<QuestionnaireResult> => {
  return apiRequest<QuestionnaireResult>('/api/dd/answer-questionnaire', {
    method: 'POST',
    body: JSON.stringify({ headers, rows, question_column: questionColumn ?? null }),
  });
};

export const askDueDiligence = async (
  question: string,
  history?: { role: string; text: string }[],
): Promise<DueDiligenceChatResult> => {
  return apiRequest<DueDiligenceChatResult>('/api/dd/ask', {
    method: 'POST',
    body: JSON.stringify({ question, history: history ?? null }),
  });
};

// ─── Risk Registry ─────────────────────────────────────────────────────────
export const computeRisk = async (): Promise<RiskComputeResult> => {
  return apiRequest<RiskComputeResult>('/api/risk/compute', { method: 'POST' });
};

export const getRiskRegister = async (): Promise<{ computed_at: string | null; register: RiskRegisterEntry[] }> => {
  return apiRequest<{ computed_at: string | null; register: RiskRegisterEntry[] }>('/api/risk/register');
};

export const addManualRisk = async (risk: ManualRiskInput): Promise<RiskRegisterEntry> => {
  return apiRequest<RiskRegisterEntry>('/api/risk/manual', {
    method: 'POST',
    body: JSON.stringify(risk),
  });
};

export const updateManualRisk = async (id: string, risk: ManualRiskInput): Promise<RiskRegisterEntry> => {
  return apiRequest<RiskRegisterEntry>(`/api/risk/manual/${id}`, {
    method: 'PUT',
    body: JSON.stringify(risk),
  });
};

export const deleteManualRisk = async (id: string): Promise<void> => {
  return apiRequest<void>(`/api/risk/manual/${id}`, { method: 'DELETE' });
};

export const deletePolicy = async (id: string): Promise<void> => {

  return apiRequest<void>(`/api/policies/${id}`, { method: 'DELETE' });

};



export const submitPolicyForApproval = async (
  id: string,
  approver: { approver_id?: string; approver_name: string; approver_email: string }
): Promise<void> => {
  console.log('🔍 DEBUG: Policy Approval - Submitting policy for approval:', id, 'approver:', approver);
  try {
    const response = await apiRequest<void>(`/api/policies/${id}/submit-approval`, {
      method: 'POST',
      body: JSON.stringify(approver),
    });
    console.log('🔍 DEBUG: Policy Approval - API Response:', response);
    console.log('🔍 DEBUG: Policy Approval - Successfully submitted for approval');
  } catch (error) {
    console.log('🔍 DEBUG: Policy Approval - Error submitting for approval:', error);
    throw error;
  }
};

export const submitPolicyForReview = async (
    id: string,
    reviewer: { reviewer_id?: string; reviewer_name: string; reviewer_email: string }
): Promise<void> => {
    console.log('🔍 DEBUG: Policy Review - Submitting policy for review:', id, 'reviewer:', reviewer);
    try {
        const response = await apiRequest<void>(`/api/policies/${id}/submit-review`, {
            method: 'POST',
            body: JSON.stringify(reviewer),
        });
        console.log('🔍 DEBUG: Policy Review - API Response:', response);
        console.log('🔍 DEBUG: Policy Review - Successfully submitted for review');
    } catch (error) {
        console.log('🔍 DEBUG: Policy Review - Error submitting for review:', error);
        throw error;
    }
};

export const reviewPolicy = async (id: string, comment?: string): Promise<void> => {
    console.log('🔍 DEBUG: Policy Review - Completing review:', id, 'comment:', comment);
    try {
        await apiRequest<void>(`/api/policies/${id}/review`, {
            method: 'POST',
            body: JSON.stringify({ comment }),
        });
        console.log('🔍 DEBUG: Policy Review - Successfully completed review');
    } catch (error) {
        console.log('🔍 DEBUG: Policy Review - Error completing review:', error);
        throw error;
    }
};



export const approvePolicy = async (id: string, comment?: string): Promise<void> => {
    console.log('🔍 DEBUG: Policy Approval - Approving policy:', id, 'comment:', comment);
    console.log(' DEBUG: Policy Approval - Approving policy:', id, 'comment:', comment);
    try {
        await apiRequest<void>(`/api/policies/${id}/approve`, {
            method: 'POST',
            body: JSON.stringify({ comment }),
        });
        console.log(' DEBUG: Policy Approval - Successfully approved');
    } catch (error) {
        console.log(' DEBUG: Policy Approval - Error approving:', error);
        throw error;
    }
};



export const rejectPolicy = async (id: string, comment: string): Promise<void> => {

  return apiRequest<void>(`/api/policies/${id}/reject`, {

    method: 'POST',

    body: JSON.stringify({ comment }),

  });

};



export const getPolicyHistory = async (id: string): Promise<AllActivityLog[]> => {

  return apiRequest<AllActivityLog[]>(`/api/policies/${id}/history`);

};



// --- Governance: Control Registry ---



export const getControlRegistry = async (): Promise<ControlRegistry[]> => {

  return apiRequest<ControlRegistry[]>('/api/control-registry');

};



export const addControlRegistry = async (control: ControlRegistryCreate): Promise<ControlRegistry> => {

  return apiRequest<ControlRegistry>('/api/control-registry', {

    method: 'POST',

    body: JSON.stringify(control),

  });

};



export const updateControlRegistry = async (id: string, updates: ControlRegistryUpdate): Promise<ControlRegistry> => {

  return apiRequest<ControlRegistry>(`/api/control-registry/${id}`, {

    method: 'PUT',

    body: JSON.stringify(updates),

  });

};



export const deleteControlRegistry = async (id: string): Promise<void> => {

  return apiRequest<void>(`/api/control-registry/${id}`, { method: 'DELETE' });

};



export const deleteControlRegistryBulk = async (ids: string[]): Promise<{ deleted: number; total: number; errors: number; errorDetails?: any[] }> => {
  return apiRequest<{ deleted: number; total: number; errors: number; errorDetails?: any[] }>('/api/control-registry/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
};

export const bulkAddControlRegistry = async (controls: ControlRegistryCreate[]): Promise<ControlRegistry[]> => {
  const result = await apiRequest<{ data: ControlRegistry[]; inserted: number; total: number; errors: number; errorDetails?: any[] }>('/api/control-registry/bulk', {
    method: 'POST',
    body: JSON.stringify(controls),
  });

  if (result && typeof result === 'object' && 'data' in result) {
    if (result.errors > 0) {
      console.warn(`Bulk import completed with ${result.errors} errors. ${result.inserted}/${result.total} controls successfully imported.`);
      if (result.errorDetails) {
        console.error('Error details:', result.errorDetails);
      }
    }
    return Array.isArray(result.data) ? result.data : [];
  }

  return Array.isArray(result) ? result : [];
};



// --- ZTI Hub (control checks) ---

export const getZtiHubStatus = async (): Promise<ZtiHubStatus> => {
  return apiRequest<ZtiHubStatus>('/api/zti-hub/status');
};

// SCF control ids that have at least one associated check (decides ▶ visibility).
export const getCheckAssociatedControls = async (): Promise<string[]> => {
  return apiRequest<string[]>('/api/zti-hub/associated-controls');
};

export const enqueueControlChecks = async (scfControlId: string): Promise<{ queued: number }> => {
  return apiRequest<{ queued: number }>('/api/zti-hub/enqueue', {
    method: 'POST',
    body: JSON.stringify({ scf_control_id: scfControlId }),
  });
};

export const getControlCheckResults = async (scfControlId: string): Promise<ControlCheckResult[]> => {
  return apiRequest<ControlCheckResult[]>(`/api/zti-hub/results?scf_control_id=${encodeURIComponent(scfControlId)}`);
};

export const registerHubDevice = async (deviceName?: string): Promise<{ device: any; token: string }> => {
  return apiRequest<{ device: any; token: string }>('/api/zti-hub/devices', {
    method: 'POST',
    body: JSON.stringify({ device_name: deviceName || 'zti-hub' }),
  });
};

// --- Control Evidence & Enforcement ---



export const submitControlEnforcement = async (

  id: string,

  data: {

    requested_status: string;

    comment?: string;

    reviewer_id?: string;

    reviewer_name: string;

    reviewer_email: string;

    enforced_by_name: string;

    enforced_by_email: string;

    files: File[];

  }

): Promise<{ success: boolean; review: ControlEvidenceReview }> => {

  if (isDemoEnabled()) {
    // Demo: synthesize a review record without hitting the backend
    return {
      success: true,
      review: {
        id: `demo-review-${Date.now()}`,
        control_id: id,
        requested_status: data.requested_status as 'Enforced' | 'NotEnforced',
        requested_by: 'demo-abc-news-user',
        enforced_by_name: data.enforced_by_name,
        enforced_by_email: data.enforced_by_email,
        reviewer_id: data.reviewer_id ?? null,
        reviewer_name: data.reviewer_name,
        reviewer_email: data.reviewer_email,
        status: 'pending',
        comment: data.comment ?? null,
        review_comment: null,
        evidence_files: data.files.map(f => ({ name: f.name, storage_path: `demo://${f.name}`, original_name: f.name, size: f.size, type: f.type })),
        org_id: 'demo-abc-news-org',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
  }

  let token = cachedToken;

  if (!token) {

    const { data: session } = await supabase.auth.getSession();

    token = session.session?.access_token || null;

    cachedToken = token;

  }



  const formData = new FormData();

  formData.append('requested_status', data.requested_status);

  if (data.comment) formData.append('comment', data.comment);

  if (data.reviewer_id) formData.append('reviewer_id', data.reviewer_id);

  formData.append('reviewer_name', data.reviewer_name);

  formData.append('reviewer_email', data.reviewer_email);

  formData.append('enforced_by_name', data.enforced_by_name);

  formData.append('enforced_by_email', data.enforced_by_email);

  data.files.forEach(file => formData.append('files', file));



  const response = await fetch(`${API_BASE_URL}/api/control-registry/${id}/submit-enforcement`, {

    method: 'POST',

    headers: {

      ...(token ? { Authorization: `Bearer ${token}` } : {}),

      'Cache-Control': 'no-cache, no-store, must-revalidate',

    },

    body: formData,

  });



  if (!response.ok) {

    const err = await response.json().catch(() => ({ message: response.statusText }));

    throw new Error(err.message || `Request failed with status ${response.status}`);

  }

  return response.json();

};



export const approveControlEnforcement = async (id: string, comment?: string): Promise<void> => {

  return apiRequest<void>(`/api/control-registry/${id}/approve-enforcement`, {

    method: 'POST',

    body: JSON.stringify({ comment }),

  });

};



export const rejectControlEnforcement = async (id: string, comment: string): Promise<void> => {

  return apiRequest<void>(`/api/control-registry/${id}/reject-enforcement`, {

    method: 'POST',

    body: JSON.stringify({ comment }),

  });

};



export const getControlEvidenceReview = async (id: string): Promise<ControlEvidenceReview | null> => {

  try {

    return await apiRequest<ControlEvidenceReview | null>(`/api/control-registry/${id}/evidence-review`);

  } catch {

    return null;

  }

};



export const getControlEvidenceFiles = async (id: string): Promise<(EvidenceFileMetadata & { signed_url: string | null })[]> => {

  try {

    return await apiRequest<(EvidenceFileMetadata & { signed_url: string | null })[]>(`/api/control-registry/${id}/evidence-files`);

  } catch {

    return [];

  }

};



// --- Control Notifications ---



export const getControlNotifications = async (): Promise<ControlNotification[]> => {

  try {

    return await apiRequest<ControlNotification[]>('/api/control-registry/notifications');

  } catch {

    return [];

  }

};



export const markControlNotificationRead = async (id: string): Promise<void> => {

  return apiRequest<void>(`/api/control-registry/notifications/${id}/read`, { method: 'PUT' });

};



// --- Governance: Capability Register ---



export const getCapabilities = async (): Promise<Capability[]> => {

  return apiRequest<Capability[]>('/api/capabilities');

};



export const addCapability = async (capability: CapabilityCreate): Promise<Capability> => {

  return apiRequest<Capability>('/api/capabilities', {

    method: 'POST',

    body: JSON.stringify(capability),

  });

};



export const updateCapability = async (id: string, updates: CapabilityUpdate): Promise<Capability> => {

  return apiRequest<Capability>(`/api/capabilities/${id}`, {

    method: 'PUT',

    body: JSON.stringify(updates),

  });

};



export const deleteCapabilitiesBulk = async (ids: string[]): Promise<void> => {
  const batchSize = 500;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);

    await apiRequest<void>('/api/capabilities/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: batch }),
    });
  }
};



export const bulkAddCapabilities = async (capabilities: CapabilityCreate[]): Promise<{ data: Capability[]; inserted: number; total: number; errors: number; errorDetails?: any[] }> => {
  console.log(`[frontend] Starting bulk upload of ${capabilities.length} capabilities`);
  
  // Process capabilities individually to match server approach and prevent timeouts
  console.log(`[frontend] Processing ${capabilities.length} capabilities individually`);

  try {
    console.log(`[frontend] Sending ${capabilities.length} capabilities to server for individual processing`);
    
    const result = await apiRequest<{ data: Capability[]; inserted: number; total: number; errors: number; errorDetails?: any[] }>('/api/capabilities/bulk', {
      method: 'POST',
      body: JSON.stringify(capabilities),
    });

    if (result && typeof result === 'object') {
      console.log(`[frontend] Bulk upload completed: ${result.inserted}/${result.total} capabilities inserted, ${result.errors} errors`);
      
      return {
        data: result.data || [],
        inserted: result.inserted || 0,
        total: result.total || capabilities.length,
        errors: result.errors || 0,
        errorDetails: result.errorDetails || []
      };
    }
    
  } catch (error) {
    console.error(`[frontend] Bulk upload failed:`, error);
    
    return {
      data: [],
      inserted: 0,
      total: capabilities.length,
      errors: capabilities.length,
      errorDetails: [{
        error: error.message,
        totalItems: capabilities.length
      }]
    };
  }
};



export const getPolicyApproval = async (id: string): Promise<PolicyApproval | null> => {

  try {

    return await apiRequest<PolicyApproval | null>(`/api/policies/${id}/approval`);

  } catch {

    return null;

  }

};



export const getPolicyNotifications = async (): Promise<PolicyNotification[]> => {

  try {

    return await apiRequest<PolicyNotification[]>('/api/policies/notifications');

  } catch {

    return [];

  }

};



export const markPolicyNotificationRead = async (id: string): Promise<void> => {

  return apiRequest<void>(`/api/policies/notifications/${id}/read`, { method: 'PUT' });

};



// --- Governance: Vulnerability Management ---



export const getVulnerabilities = async (): Promise<Vulnerability[]> => {

  return apiRequest<Vulnerability[]>('/api/vulnerabilities');

};



export const addVulnerability = async (vulnerability: VulnerabilityCreate): Promise<Vulnerability> => {

  return apiRequest<Vulnerability>('/api/vulnerabilities', {

    method: 'POST',

    body: JSON.stringify(vulnerability),

  });

};



export const updateVulnerability = async (id: string, updates: VulnerabilityUpdate): Promise<Vulnerability> => {

  return apiRequest<Vulnerability>(`/api/vulnerabilities/${id}`, {

    method: 'PUT',

    body: JSON.stringify(updates),

  });

};



export const deleteVulnerability = async (id: string): Promise<void> => {

  return apiRequest<void>(`/api/vulnerabilities/${id}`, { method: 'DELETE' });

};



export const bulkImportVulnerabilities = async (rows: VulnerabilityCreate[]): Promise<Vulnerability[]> => {
  return apiRequest<Vulnerability[]>('/api/vulnerabilities/bulk', {
    method: 'POST',
    body: JSON.stringify(rows),
  });
};

export const deleteVulnerabilitiesBulk = async (ids: string[]): Promise<void> => {
  console.log('[frontend] Sending bulk delete request with IDs:', ids.length);
  
  // Split IDs into batches of 100 to avoid payload size issues
  const batchSize = 100;
  const batches: string[][] = [];
  
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }
  
  console.log('[frontend] Split into', batches.length, 'batches');

  // Process each batch sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[frontend] Processing batch ${i + 1}/${batches.length} with ${batch.length} IDs`);
    
    const requestBody = JSON.stringify({ ids: batch });
    console.log(`[frontend] Batch ${i + 1} body length:`, requestBody.length);

    await apiRequest<void>(`/api/vulnerabilities/bulk-delete`, { 
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/json' 
      }, 
      body: requestBody 
    });
    
    console.log(`[frontend] Completed batch ${i + 1}/${batches.length}`);
  }

  console.log('[frontend] All batches completed successfully');
};



// --- Compliance ---



export const getCompliances = async (): Promise<Compliance[]> => {

  return apiRequest<Compliance[]>('/api/compliance');

};



export const addCompliance = async (compliance: ComplianceCreate): Promise<Compliance> => {

  return apiRequest<Compliance>('/api/compliance', {

    method: 'POST',

    body: JSON.stringify(compliance),

  });

};



export const updateCompliance = async (id: string, updates: ComplianceUpdate): Promise<Compliance> => {

  return apiRequest<Compliance>(`/api/compliance/${id}`, {

    method: 'PUT',

    body: JSON.stringify(updates),

  });

};



export const deleteCompliance = async (id: string): Promise<void> => {

  return apiRequest<void>(`/api/compliance/${id}`, { method: 'DELETE' });

};



// --- Organisation: Contacts ---



export const getContacts = async (): Promise<Contact[]> => {

  return apiRequest<Contact[]>('/api/contacts');

};



export const addContact = async (contact: ContactCreate): Promise<Contact> => {

  return apiRequest<Contact>('/api/contacts', {

    method: 'POST',

    body: JSON.stringify(contact),

  });

};



export const updateContact = async (id: string, updates: ContactUpdate): Promise<Contact> => {

  return apiRequest<Contact>(`/api/contacts/${id}`, {

    method: 'PUT',

    body: JSON.stringify(updates),

  });

};



export const deleteContact = async (id: string): Promise<void> => {

  return apiRequest<void>(`/api/contacts/${id}`, { method: 'DELETE' });

};



export const bulkAddContacts = async (contacts: ContactCreate[]): Promise<Contact[]> => {

  return apiRequest<Contact[]>('/api/contacts/bulk', {

    method: 'POST',

    body: JSON.stringify(contacts),

  });

};



// --- Activity Log ---



export const logAllActivity = async (

  logData: { action: string; module: string; entity_id?: string; entity_name?: string; event_data?: Record<string, any>; severity?: 'info' | 'warning' | 'error'; },

  _userParam?: any

): Promise<boolean> => {

  try {

    await apiRequest('/api/activity', {

      method: 'POST',

      body: JSON.stringify(logData),

    });

    

    // Trigger activity update event for real-time refresh

    if (typeof window !== 'undefined') {

      window.dispatchEvent(new CustomEvent('activity-update'));

    }

    

    return true;

  } catch (err) {

    console.error('Error logging activity:', err);

    return false;

  }

};



export const getAllActivityLogs = async (): Promise<AllActivityLog[]> => {

  try {

    return await apiRequest<AllActivityLog[]>('/api/activity');

  } catch {

    return [];

  }

};



export const addUserActivityLog = async (payload: { action: string; details?: Record<string, any> }): Promise<{ data: any | null; error: any | null }> => {

  try {

    await apiRequest('/api/activity', {

      method: 'POST',

      body: JSON.stringify({ action: payload.action, module: 'User', event_data: payload.details }),

    });

    return { data: true, error: null };

  } catch (err) {

    return { data: null, error: err };

  }

};



// --- Policy Manager (localStorage-based mock — unchanged) ---



export const getPolicyNodes = async (): Promise<PolicyNode[]> => {

  const stored = localStorage.getItem('grc_policy_nodes');

  if (stored) return JSON.parse(stored);

  return [

    { id: '1', name: 'Master Information Security Policy', sections: ['1. Introduction', '2. Roles', '3. DLP', '4. Assets'], google_doc_url: '#', status: 'Approved' },

    { id: '2', name: 'DLP Policy', sections: ['1. Scope', '2. Controls', '3. Enforcement'], google_doc_url: '#', status: 'Draft' },

    { id: '3', name: 'Asset Management Policy', sections: ['1. Inventory', '2. Classification', '3. Disposal'], google_doc_url: '#', status: 'Approved' },

  ];

};



export const savePolicyNodes = async (nodes: PolicyNode[]) => {

  localStorage.setItem('grc_policy_nodes', JSON.stringify(nodes));

};



export const getPolicyLinks = async (): Promise<PolicyLink[]> => {

  const stored = localStorage.getItem('grc_policy_links');

  if (stored) return JSON.parse(stored);

  return [];

};



export const savePolicyLinks = async (links: PolicyLink[]) => {

  localStorage.setItem('grc_policy_links', JSON.stringify(links));

};



export const getWorkflowTemplates = async (): Promise<WorkflowTemplate[]> => {

  const stored = localStorage.getItem('grc_workflow_templates');

  if (stored) return JSON.parse(stored);

  return [{

    id: 't1', name: 'Standard Approval Template', steps: [

      { id: 's1', label: 'Draft', status: 'Completed' },

      { id: 's2', label: 'Peer Review', approverEmail: 'peer@company.com', status: 'Pending' },

      { id: 's3', label: 'CISO Approval', approverEmail: 'ciso@company.com', status: 'Pending' },

      { id: 's4', label: 'Approved', status: 'Pending' },

    ]

  }];

};



export const saveWorkflowTemplates = async (templates: WorkflowTemplate[]) => {

  localStorage.setItem('grc_workflow_templates', JSON.stringify(templates));

};



// --- Feedback ---



export interface FeedbackData {

  rating: number;

  description: string;

}



export const saveFeedback = async (feedback: FeedbackData): Promise<boolean> => {

  if (isDemoEnabled()) return true;  // Silent success in demo mode

  try {

    const { data: sessionData } = await supabase.auth.getSession();

    const userId = (sessionData?.session as any)?.user?.id ?? null;

    const userEmail = (sessionData?.session as any)?.user?.email ?? null;

    const userName = (sessionData?.session as any)?.user?.user_metadata?.full_name ?? null;



    // Get org details

    const orgMe = await getOrgMe();



    const { error } = await supabase

      .from('feedback')

      .insert({

        rating: feedback.rating,

        description: feedback.description,

        user_id: userId,

        user_email: userEmail,

        user_name: userName,

        org_id: orgMe?.orgId ?? null,

        org_name: orgMe?.orgName ?? null,

        metadata: {

          timestamp: new Date().toISOString(),

          source: 'web_app',

        },

      });



    if (error) {

      console.error('Error saving feedback to Supabase:', error);

      return false;

    }

    return true;

  } catch (error) {

    console.error('Error saving feedback:', error);

    return false;

  }

};





export const getAssetRelationships = async (): Promise<any[]> => {

  try {

    return await apiRequest<any[]>('/api/assets/relationships');

  } catch {

    return [];

  }

};



export const addAssetRelationship = async (relationship: any): Promise<any> => {

  try {

    return await apiRequest<any>('/api/assets/relationships', {

      method: 'POST',

      body: JSON.stringify(relationship),

    });

  } catch {

    return null;

  }

};



export const updateAssetRelationship = async (id: string, relationship: any): Promise<any> => {

  try {

    return await apiRequest<any>(`/api/assets/relationships/${id}`, {

      method: 'PUT',

      body: JSON.stringify(relationship),

    });

  } catch {

    return null;

  }

};



export const bulkAddAssetRelationships = async (relationships: AssetRelationshipCreate[]): Promise<{ data: any[]; inserted: number; total: number; skipped: number; errors: number; errorDetails?: any[] }> => {
  const result = await apiRequest<{ data: any[]; inserted: number; total: number; skipped: number; errors: number; errorDetails?: any[] }>('/api/assets/relationships/bulk', {
    method: 'POST',
    body: JSON.stringify(relationships),
  });

  // Handle both simple array response and chunked response format
  if (result && typeof result === 'object' && 'data' in result) {
    if (result.errors > 0) {
      console.warn(`Bulk relationship import completed with ${result.errors} errors. ${result.inserted}/${result.total} relationships successfully imported.`);
      if (result.errorDetails) {
        console.error('Error details:', result.errorDetails);
      }
    }
    return {
      data: result.data || [],
      inserted: result.inserted || 0,
      total: result.total || relationships.length,
      skipped: result.skipped || 0,
      errors: result.errors || 0,
      errorDetails: result.errorDetails
    };
  }

  // Fallback for simple array response (small payloads)
  return {
    data: Array.isArray(result) ? result : [],
    inserted: Array.isArray(result) ? result.length : 0,
    total: relationships.length,
    skipped: 0,
    errors: 0
  };
};

export const deleteAssetRelationshipsBulk = async (ids: string[]): Promise<{ deleted: number; total: number; errors: number; errorDetails?: any[] }> => {
  console.log(`[frontend] Starting bulk delete of ${ids.length} asset relationships`);
  
  // Split IDs into batches to avoid payload size issues
  const batchSize = 500;
  const batches: string[][] = [];
  
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }
  
  console.log(`[frontend] Split into ${batches.length} batches of max ${batchSize} items each`);

  let totalDeleted = 0;
  let totalErrors = 0;
  const allErrorDetails: any[] = [];

  // Process each batch sequentially to avoid overwhelming the server
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[frontend] Processing batch ${i + 1}/${batches.length} with ${batch.length} relationships`);
    
    try {
      const result = await apiRequest<{ deleted: number; total: number; errors: number; errorDetails?: any[] }>('/api/assets/relationships/bulk', {
        method: 'DELETE',
        body: JSON.stringify({ ids: batch }),
      });

      if (result && typeof result === 'object') {
        totalDeleted += result.deleted || 0;
        totalErrors += result.errors || 0;
        
        if (result.errorDetails) {
          allErrorDetails.push(...result.errorDetails);
        }
        
        if (result.errors > 0) {
          console.warn(`[frontend] Batch ${i + 1} completed with ${result.errors} errors. ${result.deleted}/${result.total} relationships deleted.`);
        } else {
          console.log(`[frontend] Batch ${i + 1} completed successfully: ${result.deleted} relationships deleted`);
        }
      }
      
    } catch (batchError) {
      console.error(`[frontend] Batch ${i + 1} failed:`, batchError);
      totalErrors += batch.length;
      allErrorDetails.push({
        batch: i + 1,
        error: batchError.message,
        batchSize: batch.length
      });
    }
  }

  console.log(`[frontend] All batches completed: ${totalDeleted}/${ids.length} relationships deleted, ${totalErrors} errors`);

  return {
    deleted: totalDeleted,
    total: ids.length,
    errors: totalErrors,
    errorDetails: allErrorDetails
  };
};



// ── Org Settings ──────────────────────────────────────────────────────────────



export const getOrgSettings = async (): Promise<{ policy_refresh_months: number; policy_expiry_template_id: string | null; needed_framework: string[] }> =>

  apiRequest('/api/org-settings');



export const updateOrgSettings = async (settings: { policy_refresh_months?: number; needed_framework?: string[]; policy_expiry_template_id?: string | null }): Promise<{ policy_refresh_months: number; policy_expiry_template_id: string | null; needed_framework?: string[] }> =>

  apiRequest('/api/org-settings', { method: 'PUT', body: JSON.stringify(settings) });



// ── Email Templates (Organisation → Templates) ─────────────────────────────
export const getEmailTemplates = async (): Promise<EmailTemplate[]> =>
  apiRequest('/api/email-templates');

export const createEmailTemplate = async (t: { name: string; subject: string; body: string }): Promise<EmailTemplate> =>
  apiRequest('/api/email-templates', { method: 'POST', body: JSON.stringify(t) });

export const updateEmailTemplate = async (id: string, t: { name?: string; subject?: string; body?: string }): Promise<EmailTemplate> =>
  apiRequest(`/api/email-templates/${id}`, { method: 'PUT', body: JSON.stringify(t) });

export const deleteEmailTemplate = async (id: string): Promise<void> =>
  apiRequest(`/api/email-templates/${id}`, { method: 'DELETE' });



export const getAvailableFrameworks = async (): Promise<string[]> =>

  apiRequest('/api/org-settings/available-frameworks');



// ── SCF Frameworks catalog (Settings → Org framework picker) ────────────────

export const getScfFrameworks = async (): Promise<import('../types').ScfFramework[]> =>
  apiRequest('/api/scf/frameworks');

// SCF controls (with framework-native reference IDs) for one framework.
export const getScfFrameworkControls = async (framework: string): Promise<import('../types').ScfFrameworkControl[]> =>
  apiRequest(`/api/scf/frameworks/controls?framework=${encodeURIComponent(framework)}`);



// ── Fw-ControlRegistry recompute (Settings → Org "Recompute" button) ────────

export const recomputeControlRegistryPreview = async (): Promise<import('../types').FwcrPreview> =>
  apiRequest('/api/fwcr/recompute-preview', { method: 'POST' });

export const recomputeControlRegistry = async (): Promise<import('../types').FwcrApplyResult> =>
  apiRequest('/api/fwcr/recompute', { method: 'POST' });

// ── NN baseline re-seed (folded into the Settings → Org "Recompute" button) ──
export const recomputeNnPreview = async (): Promise<import('../types').NnPreview> =>
  apiRequest('/api/controls/nn-preview');

export const reseedNnControls = async (): Promise<{ message: string; data: number }> =>
  apiRequest('/api/controls/seed-nn', { method: 'POST' });



// ── Org Contacts ─────────────────────────────────────────────────────────────



export const getOrgContacts = async (): Promise<import('../types').OrgContact[]> =>

  apiRequest('/api/org-contacts');



export const addOrgContact = async (contact: import('../types').OrgContactCreate): Promise<import('../types').OrgContact> =>

  apiRequest('/api/org-contacts', { method: 'POST', body: JSON.stringify(contact) });



export const updateOrgContact = async (id: string, updates: import('../types').OrgContactUpdate): Promise<import('../types').OrgContact> =>

  apiRequest(`/api/org-contacts/${id}`, { method: 'PUT', body: JSON.stringify(updates) });



export const deleteOrgContact = async (id: string): Promise<void> =>

  apiRequest(`/api/org-contacts/${id}`, { method: 'DELETE' });



// --- Scoring and Analytics ---

// --- Custom Fields Management ---

export interface AssetType {
  id: string;
  name: string;
  fields: string[];
  fieldsConfig?: { name: string; type: string; options?: string[] }[];
}

export const getAssetTypes = async (): Promise<AssetType[]> => {
  try {
    return await apiRequest<AssetType[]>('/api/asset-types');
  } catch {
    return [];
  }
};

export const createAssetType = async (name: string, fields: any[]): Promise<AssetType> => {
  return apiRequest<AssetType>('/api/asset-types', {
    method: 'POST',
    body: JSON.stringify({ name, fields }),
  });
};

export const updateAssetType = async (id: string, name: string, fields: any[]): Promise<AssetType> => {
  return apiRequest<AssetType>(`/api/asset-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, fields }),
  });
};

export const saveAssetTypes = async (assetTypes: AssetType[]): Promise<void> => {
  return apiRequest<void>('/api/asset-types', {
    method: 'POST',
    body: JSON.stringify(assetTypes),
  });
};

export const deleteAssetType = async (id: string): Promise<void> => {
  return apiRequest<void>(`/api/asset-types/${id}`, {
    method: 'DELETE',
  });
};

export interface CustomField {
  id: string;
  org_id: string;
  module_name: string;
  field_name: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  is_required: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldCreate {
  field_name: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options?: string[] | null;
  is_required?: boolean;
  display_order?: number;
}

export interface CustomFieldUpdate {
  field_label?: string;
  field_type?: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options?: string[] | null;
  is_required?: boolean;
  display_order?: number;
  is_active?: boolean;
}

export const getCustomFields = async (moduleName: string): Promise<CustomField[]> => {
  try {
    return await apiRequest<CustomField[]>(`/api/custom-fields/${moduleName}`);
  } catch {
    return [];
  }
};

export const createCustomField = async (moduleName: string, field: CustomFieldCreate): Promise<CustomField> => {
  return apiRequest<CustomField>(`/api/custom-fields/${moduleName}`, {
    method: 'POST',
    body: JSON.stringify(field),
  });
};

export const updateCustomField = async (moduleName: string, fieldId: string, updates: CustomFieldUpdate): Promise<CustomField> => {
  return apiRequest<CustomField>(`/api/custom-fields/${moduleName}/${fieldId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

// --- Asset Custom Fields ---

export const getAssetCustomFields = async (): Promise<AssetCustomField[]> =>
  apiRequest<AssetCustomField[]>('/api/asset-custom-fields');

export const createAssetCustomField = async (field: AssetCustomFieldCreate): Promise<AssetCustomField> =>
  apiRequest<AssetCustomField>('/api/asset-custom-fields', {
    method: 'POST',
    body: JSON.stringify(field),
  });

export const updateAssetCustomField = async (id: string, updates: AssetCustomFieldUpdate): Promise<AssetCustomField> =>
  apiRequest<AssetCustomField>(`/api/asset-custom-fields/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });

export const deleteAssetCustomField = async (id: string): Promise<void> =>
  apiRequest(`/api/asset-custom-fields/${id}`, { method: 'DELETE' });

export const getAssetCustomFieldValues = async (assetId: string): Promise<any[]> =>
  apiRequest<any[]>(`/api/asset-custom-fields/values/${assetId}`);

export const setAssetCustomFieldValues = async (assetId: string, fieldValues: { field_id: string; field_value: string | null }[]): Promise<any[]> =>
  apiRequest<any[]>('/api/asset-custom-fields/values', {
    method: 'POST',
    body: JSON.stringify({ asset_id: assetId, field_values: fieldValues }),
  });

export const reorderCustomFields = async (moduleName: string, fieldIds: string[]): Promise<void> =>
  apiRequest(`/api/custom-fields/${moduleName}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ fieldIds }),
  });

export const deleteCustomField = async (moduleName: string, fieldId: string): Promise<void> =>
  apiRequest(`/api/custom-fields/${moduleName}/${fieldId}`, { method: 'DELETE' });

