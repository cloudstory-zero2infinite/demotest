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
