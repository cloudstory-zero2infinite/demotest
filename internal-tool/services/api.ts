import { supabase } from './supabaseClient';
import {
  PolicyCorpusFile,
  OntologyFile,
  Compliance,
  ComplianceCreate,
  ComplianceUpdate,
  NNControlTemplate,
  NNControlTemplateCreate,
  NNControlTemplateUpdate,
  ScfFilesResponse,
  ScfDomain,
  ScfControl,
  ScfUploadResult,
  ControlCheck,
  ControlCheckCreate,
  ControlCheckUpdate,
  ControlCheckAssociation,
  PlatformAnalytics,
  CampaignMarker,
  ReleaseRecord,
  QaSuitesResponse,
  QaTestsResponse,
  QaRun,
} from '../types';

// Empty string → same-origin (production). Undefined → fall back to localhost (dev).
const _envBase = (import.meta as any).env.VITE_API_BASE_URL as string | undefined;
const API_BASE_URL = _envBase ?? 'http://localhost:3002';

let cachedToken: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  cachedToken = session?.access_token || null;
});
supabase.auth.getSession().then(({ data }) => {
  cachedToken = data.session?.access_token || null;
});

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const { data } = await supabase.auth.getSession();
  cachedToken = data.session?.access_token || null;
  return cachedToken;
}

async function request<T>(path: string, options: RequestInit = {}, isForm = false): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ───────── Policy corpus (Supabase storage bucket) ─────────
export const listPolicyCorpus = () =>
  request<PolicyCorpusFile[]>('/api/internal/policy-corpus');

export async function uploadPolicyCorpus(file: File): Promise<{ name: string }> {
  const form = new FormData();
  form.append('file', file);
  return request<{ name: string }>(
    '/api/internal/policy-corpus',
    { method: 'POST', body: form },
    true
  );
}

export const deletePolicyCorpus = (name: string) =>
  request<void>(`/api/internal/policy-corpus/${encodeURIComponent(name)}`, { method: 'DELETE' });

export async function downloadPolicyCorpus(name: string): Promise<Blob> {
  const token = await getToken();
  const res = await fetch(
    `${API_BASE_URL}/api/internal/policy-corpus/${encodeURIComponent(name)}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}

// ───────── Ontology files (read-only listing for now) ─────────
export const listOntology = () => request<OntologyFile[]>('/api/internal/ontology');
export const getOntologyContent = (name: string) =>
  request<{ name: string; content: string }>(`/api/internal/ontology/${encodeURIComponent(name)}`);

// ───────── Compliance ─────────
export const listCompliance = () => request<Compliance[]>('/api/internal/compliance');
export const createCompliance = (body: ComplianceCreate) =>
  request<Compliance>('/api/internal/compliance', { method: 'POST', body: JSON.stringify(body) });
export const updateCompliance = (id: string, body: ComplianceUpdate) =>
  request<Compliance>(`/api/internal/compliance/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
export const deleteCompliance = (id: string) =>
  request<void>(`/api/internal/compliance/${id}`, { method: 'DELETE' });
export const bulkCreateCompliance = (rows: ComplianceCreate[]) =>
  request<Compliance[]>('/api/internal/compliance/bulk', {
    method: 'POST',
    body: JSON.stringify(rows),
  });
export const bulkDeleteCompliance = (ids: string[]) =>
  request<{ deleted: number }>('/api/internal/compliance/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });

// ───────── NN control templates ─────────
export const listNNControls = () =>
  request<NNControlTemplate[]>('/api/internal/nn-controls');
export const createNNControl = (body: NNControlTemplateCreate) =>
  request<NNControlTemplate>('/api/internal/nn-controls', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateNNControl = (id: string, body: NNControlTemplateUpdate) =>
  request<NNControlTemplate>(`/api/internal/nn-controls/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
export const deleteNNControl = (id: string) =>
  request<void>(`/api/internal/nn-controls/${id}`, { method: 'DELETE' });
export const bulkCreateNNControls = (rows: NNControlTemplateCreate[]) =>
  request<NNControlTemplate[]>('/api/internal/nn-controls/bulk', {
    method: 'POST',
    body: JSON.stringify(rows),
  });
export const bulkDeleteNNControls = (ids: string[]) =>
  request<{ deleted: number }>('/api/internal/nn-controls/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });

// ───────── SCF Control Framework (bucket + parsed tables) ─────────
export const listControlFramework = () =>
  request<ScfFilesResponse>('/api/internal/control-framework');

export const listScfDomains = () =>
  request<ScfDomain[]>('/api/internal/control-framework/domains');

export const listScfControls = () =>
  request<ScfControl[]>('/api/internal/control-framework/controls');

export async function uploadControlFramework(file: File): Promise<ScfUploadResult> {
  const form = new FormData();
  form.append('file', file);
  return request<ScfUploadResult>(
    '/api/internal/control-framework',
    { method: 'POST', body: form },
    true
  );
}

export const deleteControlFrameworkFile = (name: string) =>
  request<void>(
    `/api/internal/control-framework/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );

export async function downloadControlFramework(name: string): Promise<Blob> {
  const token = await getToken();
  const res = await fetch(
    `${API_BASE_URL}/api/internal/control-framework/${encodeURIComponent(name)}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}

// ───────── Control Checks Library ─────────
export const listControlChecks = () =>
  request<ControlCheck[]>('/api/internal/control-checks');
export const createControlCheck = (body: ControlCheckCreate) =>
  request<ControlCheck>('/api/internal/control-checks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateControlCheck = (id: string, body: ControlCheckUpdate) =>
  request<ControlCheck>(`/api/internal/control-checks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
export const deleteControlCheck = (id: string) =>
  request<void>(`/api/internal/control-checks/${id}`, { method: 'DELETE' });

export const listCheckAssociations = (scfControlId?: string) =>
  request<ControlCheckAssociation[]>(
    `/api/internal/control-checks/associations${scfControlId ? `?scf_control_id=${encodeURIComponent(scfControlId)}` : ''}`
  );
export const attachCheck = (
  target: { scf_control_id?: string; nn_ctl_name?: string },
  check_id: string
) =>
  request<{ id: string }>('/api/internal/control-checks/associations', {
    method: 'POST',
    body: JSON.stringify({ ...target, check_id }),
  });
export const detachCheck = (associationId: string) =>
  request<void>(`/api/internal/control-checks/associations/${associationId}`, { method: 'DELETE' });
export const autoAssignGcpChecks = () =>
  request<{ inserted: number; attempted: number }>(
    '/api/internal/control-checks/auto-assign-gcp',
    { method: 'POST' }
  );

// ───────── Platform Analytics ─────────
export const getPlatformAnalytics = () =>
  request<PlatformAnalytics>('/api/internal/platform-analytics');

export const listCampaignMarkers = () =>
  request<CampaignMarker[]>('/api/internal/platform-analytics/markers');
export const createCampaignMarker = (body: { label: string; event_date: string }) =>
  request<CampaignMarker>('/api/internal/platform-analytics/markers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const deleteCampaignMarker = (id: string) =>
  request<void>(`/api/internal/platform-analytics/markers/${id}`, { method: 'DELETE' });

export const listReleases = () =>
  request<ReleaseRecord[]>('/api/internal/platform-analytics/releases');
export const updateReleaseNotes = (id: string, notes: string) =>
  request<ReleaseRecord>(`/api/internal/platform-analytics/releases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  });

// ───────── Auth ─────────
export async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut() {
  await supabase.auth.signOut();
  cachedToken = null;
}

// ───────── QA / E2E test runner ─────────
export const listQaSuites = () => request<QaSuitesResponse>('/api/internal/qa/suites');

export const listQaTests = () => request<QaTestsResponse>('/api/internal/qa/tests');

export const startQaRun = (suite: string) =>
  request<QaRun>('/api/internal/qa/run', {
    method: 'POST',
    body: JSON.stringify({ suite }),
  });

export const getQaRun = (runId: string) =>
  request<QaRun>(`/api/internal/qa/run/${encodeURIComponent(runId)}`);

export async function downloadQaReport(runId: string): Promise<Blob> {
  const token = await getToken();
  const res = await fetch(
    `${API_BASE_URL}/api/internal/qa/run/${encodeURIComponent(runId)}/report`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}
