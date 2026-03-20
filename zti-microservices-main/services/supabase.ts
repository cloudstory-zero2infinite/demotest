import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ProgramTask, ProgramTaskCreate, ProgramTaskUpdate, ActivityLog, InternalControl, InternalControlCreate, InternalControlUpdate, Asset, AssetCreate, AssetUpdate, PolicyDocument, PolicyDocumentCreate, PolicyDocumentUpdate, Compliance, ComplianceCreate, ComplianceUpdate, Contact, ContactCreate, ContactUpdate, AllActivityLog, Vulnerability, VulnerabilityCreate, VulnerabilityUpdate, PolicyNode, PolicyLink, WorkflowTemplate } from '../types';

// Supabase client is kept ONLY for Google Auth (OAuth sign-in/sign-out/session)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3001';

// Internal helper — attaches the user's JWT to every backend request
const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  // If no token and this is an authenticated endpoint, return early
  if (!token && !path.includes('/api/health')) {
    throw new Error('No authentication token available');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    // Handle 401 errors silently when no token is available
    if (response.status === 401 && !token) {
      throw new Error('Authentication required');
    }
    const err = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(err.message || `Request failed with status ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) return undefined as unknown as T;
  return response.json();
};

// --- Organisation & User Functions ---

export const getUserOrgId = async (): Promise<string | null> => {
  try {
    const me = await apiRequest<{ orgId: string | null }>('/api/org/me');
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

export const getUserRole = async (): Promise<string | null> => {
  try {
    const me = await apiRequest<{ role: string | null }>('/api/org/me');
    return me.role;
  } catch {
    return null;
  }
};

export const createOrganization = async (name: string): Promise<any> => {
  return apiRequest('/api/org/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
};

export const getUserIdByEmail = async (_email: string): Promise<string | null> => {
  // This is a server-side-only operation now
  return null;
};

export const onboardUserToOrganization = async (orgId: string, email: string, role: string = 'user', description?: string): Promise<any> => {
  return apiRequest('/api/org/onboard', {
    method: 'POST',
    body: JSON.stringify({ orgId, email, role, description }),
  });
};

// --- Program Milestone Functions ---

export const addActivityLog = async (programId: string, activity: string) => {
  try {
    await apiRequest(`/api/program/${programId}/activity`, {
      method: 'POST',
      body: JSON.stringify({ activity }),
    });
  } catch (err) {
    console.error('Error logging activity:', err);
  }
};

export const getTasks = async (): Promise<ProgramTask[]> => {
  try {
    return await apiRequest<ProgramTask[]>('/api/program');
  } catch (error) {
    if (error.message === 'Authentication required') {
      console.log('User not authenticated, returning empty tasks list');
      return [];
    }
    throw error;
  }
};

export const addTask = async (task: ProgramTaskCreate): Promise<ProgramTask> => {
  return apiRequest<ProgramTask>('/api/program', {
    method: 'POST',
    body: JSON.stringify(task),
  });
};

export const bulkAddTasks = async (tasks: ProgramTaskCreate[]): Promise<ProgramTask[]> => {
  return apiRequest<ProgramTask[]>('/api/program/bulk', {
    method: 'POST',
    body: JSON.stringify(tasks),
  });
};

export const updateTask = async (id: string, updates: ProgramTaskUpdate): Promise<ProgramTask> => {
  return apiRequest<ProgramTask>(`/api/program/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

export const deleteTask = async (id: string): Promise<void> => {
  return apiRequest<void>(`/api/program/${id}`, { method: 'DELETE' });
};

export const getActivityLogs = async (programId: string): Promise<ActivityLog[]> => {
  return apiRequest<ActivityLog[]>(`/api/program/${programId}/activity`);
};

export const getAllOrgActivityLogs = async (): Promise<ActivityLog[]> => {
  return apiRequest<ActivityLog[]>('/api/activity/program');
};

// --- Governance: File Handling (kept as direct Supabase storage — no sensitive data) ---

const GRC_DOCUMENTS_BUCKET = 'grc-documents';

export const uploadFile = async (file: File, pathPrefix: string): Promise<string> => {
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
  } catch (error) {
    if (error.message === 'Authentication required') {
      console.log('User not authenticated, returning empty compliance tags list');
      return [];
    }
    return [];
  }
};

export const getInternalControls = async (): Promise<InternalControl[]> => {
  try {
    return await apiRequest<InternalControl[]>('/api/controls');
  } catch (error) {
    if (error.message === 'Authentication required') {
      console.log('User not authenticated, returning empty controls list');
      return [];
    }
    throw error;
  }
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
  try {
    return await apiRequest<Asset[]>('/api/assets');
  } catch (error) {
    if (error.message === 'Authentication required') {
      console.log('User not authenticated, returning empty assets list');
      return [];
    }
    throw error;
  }
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

export const bulkAddAssets = async (assets: AssetCreate[]): Promise<Asset[]> => {
  return apiRequest<Asset[]>('/api/assets/bulk', {
    method: 'POST',
    body: JSON.stringify(assets),
  });
};

// --- Governance: Policies ---

export const getPolicies = async (): Promise<PolicyDocument[]> => {
  try {
    return await apiRequest<PolicyDocument[]>('/api/policies');
  } catch (error) {
    if (error.message === 'Authentication required') {
      console.log('User not authenticated, returning empty policies list');
      return [];
    }
    throw error;
  }
};

export const addPolicy = async (policy: PolicyDocumentCreate): Promise<PolicyDocument> => {
  return apiRequest<PolicyDocument>('/api/policies', {
    method: 'POST',
    body: JSON.stringify(policy),
  });
};

export const updatePolicy = async (id: string, updates: PolicyDocumentUpdate): Promise<PolicyDocument> => {
  return apiRequest<PolicyDocument>(`/api/policies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

export const deletePolicy = async (id: string): Promise<void> => {
  return apiRequest<void>(`/api/policies/${id}`, { method: 'DELETE' });
};

// --- Governance: Vulnerability Management ---

export const getVulnerabilities = async (): Promise<Vulnerability[]> => {
  try {
    return await apiRequest<Vulnerability[]>('/api/vulnerabilities');
  } catch (error) {
    if (error.message === 'Authentication required') {
      console.log('User not authenticated, returning empty vulnerabilities list');
      return [];
    }
    throw error;
  }
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

// --- Compliance ---

export const getCompliances = async (): Promise<Compliance[]> => {
  try {
    return await apiRequest<Compliance[]>('/api/compliance');
  } catch (error) {
    if (error.message === 'Authentication required') {
      console.log('User not authenticated, returning empty compliance list');
      return [];
    }
    throw error;
  }
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
  try {
    return await apiRequest<Contact[]>('/api/contacts');
  } catch (error) {
    if (error.message === 'Authentication required') {
      console.log('User not authenticated, returning empty contacts list');
      return [];
    }
    throw error;
  }
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
    return true;
  } catch (err) {
    console.error('Error logging activity:', err);
    return false;
  }
};

export const getAllActivityLogs = async (): Promise<AllActivityLog[]> => {
  try {
    return await apiRequest<AllActivityLog[]>('/api/activity');
  } catch (error) {
    if (error.message === 'Authentication required') {
      console.log('User not authenticated, returning empty activity logs list');
      return [];
    }
    throw error;
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

export const sendFeedbackEmail = async (rating: number, description: string): Promise<boolean> => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = (sessionData?.session as any)?.user?.id ?? 'Unknown';
    const userEmail = (sessionData?.session as any)?.user?.email ?? 'Unknown';
    const response = await fetch(`${API_BASE_URL}/api/feedback/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, description, userId, userEmail }),
    });
    if (!response.ok) {
      console.error('Feedback email failed');
    }
    return true;
  } catch (error) {
    console.error('Error sending feedback email:', error);
    return true;
  }
};
