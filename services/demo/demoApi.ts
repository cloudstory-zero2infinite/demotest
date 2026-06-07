// Routes intercepted apiRequest() calls to the in-memory demo store.
// Returns shapes that match the real Express routes byte-for-byte where it matters.

import { getStore, persist, newId } from './demoStore';
import { SEED_ORG_ME, SEED_COMPLIANCE_TAGS, SEED_ORG_USERS, SEED_AVAILABLE_FRAMEWORKS } from './demoSeed';

const NOW = () => new Date().toISOString();

// Match path against template like "/api/assets/:id" → returns { id: "..." } or null
const matchPath = (pattern: string, path: string): Record<string, string> | null => {
  const pathOnly = path.split('?')[0];
  const patternParts = pattern.split('/');
  const pathParts = pathOnly.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = pathParts[i];
    } else if (pp !== pathParts[i]) {
      return null;
    }
  }
  return params;
};

const getQuery = (path: string, key: string): string | undefined => {
  const q = path.split('?')[1];
  if (!q) return undefined;
  const params = new URLSearchParams(q);
  return params.get(key) ?? undefined;
};

const okBulk = (data: any[]) => ({ data, inserted: data.length, total: data.length, errors: 0, skipped: 0 });

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point: route a request to a handler.
// Returns the JSON body that apiRequest() would otherwise return.
// ─────────────────────────────────────────────────────────────────────────────
export const handleDemoRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? safeParse(options.body) : null;
  const store = getStore();

  // ─── Org / users / settings ────────────────────────────────────────────────
  if (path === '/api/org/me') return SEED_ORG_ME as T;
  if (path === '/api/org/users') return SEED_ORG_USERS as T;
  if (path === '/api/org/notifications') return store.orgNotifications as T;
  if (path === '/api/org/notifications/read-all' && method === 'PUT') {
    store.orgNotifications.forEach(n => (n.read = true));
    persist();
    return undefined as T;
  }
  if (path === '/api/org/pending-approvals') return [] as T;
  if (path === '/api/org-settings' && method === 'GET') return store.orgSettings as T;
  if (path === '/api/org-settings' && method === 'PUT') {
    store.orgSettings = { ...store.orgSettings, ...(body || {}) };
    persist();
    return store.orgSettings as T;
  }
  if (path === '/api/org-settings/available-frameworks') return SEED_AVAILABLE_FRAMEWORKS as T;

  // ─── Org Contacts (members) ────────────────────────────────────────────────
  if (path === '/api/org-contacts' && method === 'GET') return store.orgContacts as T;
  if (path === '/api/org-contacts' && method === 'POST') {
    const created = { id: newId('demo-orgcontact'), org_id: 'demo-abc-news-org', created_at: NOW(), updated_at: NOW(), ...body };
    store.orgContacts.push(created);
    persist();
    return created as T;
  }
  {
    const m = matchPath('/api/org-contacts/:id', path);
    if (m) {
      if (method === 'PUT') {
        const idx = store.orgContacts.findIndex(c => c.id === m.id);
        if (idx >= 0) {
          store.orgContacts[idx] = { ...store.orgContacts[idx], ...body, updated_at: NOW() };
          persist();
          return store.orgContacts[idx] as T;
        }
      }
      if (method === 'DELETE') {
        store.orgContacts = store.orgContacts.filter(c => c.id !== m.id);
        persist();
        return undefined as T;
      }
    }
  }

  // ─── Program tasks ─────────────────────────────────────────────────────────
  if (path === '/api/program' && method === 'GET') return store.programTasks as T;
  if (path === '/api/program' && method === 'POST') {
    const created = { id: newId('demo-task'), last_updated: NOW(), ...body };
    store.programTasks.push(created);
    persist();
    return created as T;
  }
  if (path === '/api/program/bulk' && method === 'POST') {
    const created = (body as any[]).map(t => ({ id: newId('demo-task'), last_updated: NOW(), ...t }));
    store.programTasks.push(...created);
    persist();
    return { data: created, duplicates: 0, added: created.length } as T;
  }
  {
    const m = matchPath('/api/program/:id', path);
    if (m) {
      if (method === 'PUT') {
        const idx = store.programTasks.findIndex(t => t.id === m.id);
        if (idx >= 0) {
          store.programTasks[idx] = { ...store.programTasks[idx], ...body, last_updated: NOW() };
          persist();
          return store.programTasks[idx] as T;
        }
      }
      if (method === 'DELETE') {
        store.programTasks = store.programTasks.filter(t => t.id !== m.id);
        persist();
        return undefined as T;
      }
    }
  }
  {
    const m = matchPath('/api/program/:id/activity', path);
    if (m) {
      if (method === 'GET') {
        return store.activityLogs.filter(l => l.module === 'Program').slice(0, 10) as T;
      }
      if (method === 'POST') return undefined as T;
    }
  }
  {
    const m = matchPath('/api/program/:id/history', path);
    if (m && method === 'GET') return [] as T;
  }

  // ─── Activity logs ─────────────────────────────────────────────────────────
  if (path === '/api/activity' && method === 'GET') return store.activityLogs as T;
  if (path === '/api/activity' && method === 'POST') {
    const newLog = {
      id: store.activityLogs.length + 1,
      user_id: 'demo-abc-news-user',
      org_id: 'demo-abc-news-org',
      action: (body as any)?.action || 'unknown',
      module: (body as any)?.module || null,
      entity_id: (body as any)?.entity_id || null,
      entity_name: (body as any)?.entity_name || null,
      event_data: (body as any)?.event_data || null,
      ip_address: null,
      user_agent: null,
      severity: (body as any)?.severity || 'info',
      source: 'web_app',
      created_at: NOW(),
      contacts: null,
      org_name: 'ABC News',
      user_role: 'tenant_admin',
    };
    store.activityLogs.unshift(newLog as any);
    persist();
    return undefined as T;
  }
  if (path === '/api/activity/program') {
    return store.activityLogs.filter(l => l.module === 'Program') as T;
  }

  // ─── Controls (Internal Controls) ──────────────────────────────────────────
  if (path === '/api/controls' && method === 'GET') return store.internalControls as T;
  if (path === '/api/controls/compliance-tags') return SEED_COMPLIANCE_TAGS as T;
  if (path === '/api/controls' && method === 'POST') {
    const created = { id: newId('demo-ic'), updated_at: NOW(), ...body };
    store.internalControls.push(created);
    persist();
    return created as T;
  }
  if (path === '/api/controls/bulk' && method === 'POST') {
    const created = (body as any[]).map(c => ({ id: newId('demo-ic'), updated_at: NOW(), ...c }));
    store.internalControls.push(...created);
    persist();
    return created as T;
  }
  {
    const m = matchPath('/api/controls/:id', path);
    if (m) {
      if (method === 'PUT') {
        const idx = store.internalControls.findIndex(c => c.id === m.id);
        if (idx >= 0) {
          store.internalControls[idx] = { ...store.internalControls[idx], ...body, updated_at: NOW() };
          persist();
          return store.internalControls[idx] as T;
        }
      }
      if (method === 'DELETE') {
        store.internalControls = store.internalControls.filter(c => c.id !== m.id);
        persist();
        return undefined as T;
      }
    }
  }

  // ─── Assets (must check sub-paths BEFORE /api/assets/:id) ──────────────────
  if (path === '/api/assets/relationships' && method === 'GET') return store.assetRelationships as T;
  if (path === '/api/assets/relationships' && method === 'POST') {
    const created = { id: newId('demo-rel'), created_at: NOW(), ...body };
    store.assetRelationships.push(created);
    persist();
    return created as T;
  }
  if (path === '/api/assets/relationships/bulk' && method === 'POST') {
    const created = (body as any[]).map(r => ({ id: newId('demo-rel'), created_at: NOW(), ...r }));
    store.assetRelationships.push(...created);
    persist();
    return okBulk(created) as T;
  }
  if (path === '/api/assets/relationships/bulk' && method === 'DELETE') {
    const ids: string[] = (body as any)?.ids || [];
    const before = store.assetRelationships.length;
    store.assetRelationships = store.assetRelationships.filter(r => !ids.includes(r.id));
    persist();
    return { deleted: before - store.assetRelationships.length, total: ids.length, errors: 0 } as T;
  }
  {
    const m = matchPath('/api/assets/relationships/:id', path);
    if (m && method === 'PUT') {
      const idx = store.assetRelationships.findIndex(r => r.id === m.id);
      if (idx >= 0) {
        store.assetRelationships[idx] = { ...store.assetRelationships[idx], ...body };
        persist();
        return store.assetRelationships[idx] as T;
      }
    }
  }

  if (path === '/api/assets' && method === 'GET') return store.assets as T;
  if (path === '/api/assets' && method === 'POST') {
    const created = { id: newId('demo-asset'), created_at: NOW(), ...body };
    store.assets.push(created);
    persist();
    return created as T;
  }
  if (path === '/api/assets/bulk' && method === 'POST') {
    const created = (body as any[]).map(a => ({ id: newId('demo-asset'), created_at: NOW(), ...a }));
    store.assets.push(...created);
    persist();
    return okBulk(created) as T;
  }
  if (path === '/api/assets/bulk' && method === 'DELETE') {
    const ids: string[] = (body as any)?.ids || [];
    store.assets = store.assets.filter(a => !ids.includes(a.id));
    persist();
    return undefined as T;
  }
  {
    const m = matchPath('/api/assets/:id', path);
    if (m) {
      if (method === 'PUT') {
        const idx = store.assets.findIndex(a => a.id === m.id);
        if (idx >= 0) {
          store.assets[idx] = { ...store.assets[idx], ...body };
          persist();
          return store.assets[idx] as T;
        }
      }
      if (method === 'DELETE') {
        store.assets = store.assets.filter(a => a.id !== m.id);
        persist();
        return undefined as T;
      }
    }
  }

  // ─── Asset types + custom fields ───────────────────────────────────────────
  if (path === '/api/asset-types' && method === 'GET') return store.assetTypes as T;
  if (path === '/api/asset-types' && method === 'POST') {
    const created = { id: newId('demo-at'), ...body };
    store.assetTypes.push(created as any);
    persist();
    return created as T;
  }
  if (path === '/api/asset-custom-fields' && method === 'GET') return store.assetCustomFields as T;
  if (path === '/api/asset-custom-fields' && method === 'POST') {
    const created = { id: newId('demo-acf'), ...body };
    store.assetCustomFields.push(created);
    persist();
    return created as T;
  }
  if (path.startsWith('/api/asset-custom-fields/')) {
    // values endpoints — return empty in demo
    if (method === 'GET') return [] as T;
    return undefined as T;
  }
  if (path.startsWith('/api/custom-fields/')) {
    if (method === 'GET') return [] as T;
    return undefined as T;
  }

  // ─── Policies ──────────────────────────────────────────────────────────────
  if (path === '/api/policies' && method === 'GET') return store.policies as T;
  if (path === '/api/policies/master' && method === 'GET') {
    return (store.policies.find(p => p.is_master) || null) as T;
  }
  if (path === '/api/policies' && method === 'POST') {
    const created = {
      policy_id: newId('demo-policy'),
      name: 'Untitled Policy',
      markdown: (body as any)?.markdown || '',
      policy_ref: null,
      policy_status: (body as any)?.policy_status || 'draft',
      refresh_date: null,
      version: '1.0',
      document_type: 'Policy',
      owner_name: null,
      is_master: false,
      org_id: 'demo-abc-news-org',
      user_id: 'demo-abc-news-user',
      created_at: NOW(),
      updated_at: NOW(),
    };
    store.policies.push(created);
    persist();
    return created as T;
  }
  if (path === '/api/policies/notifications') return store.policyNotifications as T;
  {
    const m = matchPath('/api/policies/notifications/:id/read', path);
    if (m && method === 'PUT') {
      const n = store.policyNotifications.find(x => x.id === m.id);
      if (n) { n.read = true; persist(); }
      return undefined as T;
    }
  }
  {
    const m = matchPath('/api/policies/:id', path);
    if (m && method === 'PUT') {
      const idx = store.policies.findIndex(p => p.policy_id === m.id);
      if (idx >= 0) {
        store.policies[idx] = { ...store.policies[idx], ...body, updated_at: NOW() };
        persist();
        return store.policies[idx] as T;
      }
    }
    if (m && method === 'DELETE') {
      store.policies = store.policies.filter(p => p.policy_id !== m.id);
      persist();
      return undefined as T;
    }
  }
  {
    const m = matchPath('/api/policies/:id/master', path);
    if (m && method === 'PATCH') {
      const target = store.policies.find(p => p.policy_id === m.id);
      if (target) {
        // Enforce single-master invariant
        store.policies.forEach(p => (p.is_master = false));
        target.is_master = !!(body as any)?.is_master;
        persist();
        return { policy_id: target.policy_id, name: target.name, is_master: !!target.is_master } as T;
      }
    }
  }
  {
    const m = matchPath('/api/policies/:id/submit-approval', path);
    if (m && method === 'POST') {
      const target = store.policies.find(p => p.policy_id === m.id);
      if (target) { target.policy_status = 'in_approval'; persist(); }
      return undefined as T;
    }
  }
  {
    const m = matchPath('/api/policies/:id/submit-review', path);
    if (m && method === 'POST') {
      const target = store.policies.find(p => p.policy_id === m.id);
      if (target) { target.policy_status = 'to_review'; persist(); }
      return undefined as T;
    }
  }
  {
    const m = matchPath('/api/policies/:id/review', path);
    if (m && method === 'POST') {
      const target = store.policies.find(p => p.policy_id === m.id);
      if (target) { target.policy_status = 'reviewed'; persist(); }
      return undefined as T;
    }
  }
  {
    const m = matchPath('/api/policies/:id/approve', path);
    if (m && method === 'POST') {
      const target = store.policies.find(p => p.policy_id === m.id);
      if (target) { target.policy_status = 'approved'; persist(); }
      return undefined as T;
    }
  }
  {
    const m = matchPath('/api/policies/:id/reject', path);
    if (m && method === 'POST') {
      const target = store.policies.find(p => p.policy_id === m.id);
      if (target) { target.policy_status = 'draft'; persist(); }
      return undefined as T;
    }
  }
  {
    const m = matchPath('/api/policies/:id/approval', path);
    if (m && method === 'GET') {
      return (store.policyApprovals.find(a => a.policy_id === m.id) || null) as T;
    }
  }
  {
    const m = matchPath('/api/policies/:id/history', path);
    if (m && method === 'GET') return [] as T;
  }

  // ─── Vulnerabilities ───────────────────────────────────────────────────────
  if (path === '/api/vulnerabilities' && method === 'GET') return store.vulnerabilities as T;
  if (path === '/api/vulnerabilities' && method === 'POST') {
    const created = { id: newId('demo-vuln'), created_at: NOW(), updated_at: NOW(), ...body };
    store.vulnerabilities.push(created);
    persist();
    return created as T;
  }
  if (path === '/api/vulnerabilities/bulk' && method === 'POST') {
    const created = (body as any[]).map(v => ({ id: newId('demo-vuln'), created_at: NOW(), updated_at: NOW(), ...v }));
    store.vulnerabilities.push(...created);
    persist();
    return created as T;
  }
  if (path === '/api/vulnerabilities/bulk-delete' && method === 'POST') {
    const ids: string[] = (body as any)?.ids || [];
    store.vulnerabilities = store.vulnerabilities.filter(v => !ids.includes(v.id));
    persist();
    return undefined as T;
  }
  {
    const m = matchPath('/api/vulnerabilities/:id', path);
    if (m) {
      if (method === 'PUT') {
        const idx = store.vulnerabilities.findIndex(v => v.id === m.id);
        if (idx >= 0) {
          store.vulnerabilities[idx] = { ...store.vulnerabilities[idx], ...body, updated_at: NOW() };
          persist();
          return store.vulnerabilities[idx] as T;
        }
      }
      if (method === 'DELETE') {
        store.vulnerabilities = store.vulnerabilities.filter(v => v.id !== m.id);
        persist();
        return undefined as T;
      }
    }
  }

  // ─── Capabilities ──────────────────────────────────────────────────────────
  if (path === '/api/capabilities' && method === 'GET') return store.capabilities as T;
  if (path === '/api/capabilities' && method === 'POST') {
    const created = { id: newId('demo-cap'), created_at: NOW(), updated_at: NOW(), ...body };
    store.capabilities.push(created);
    persist();
    return created as T;
  }
  if (path === '/api/capabilities/bulk' && method === 'POST') {
    const created = (body as any[]).map(c => ({ id: newId('demo-cap'), created_at: NOW(), updated_at: NOW(), ...c }));
    store.capabilities.push(...created);
    persist();
    return okBulk(created) as T;
  }
  if (path === '/api/capabilities/bulk-delete' && method === 'POST') {
    const ids: string[] = (body as any)?.ids || [];
    store.capabilities = store.capabilities.filter(c => !ids.includes(c.id));
    persist();
    return undefined as T;
  }
  {
    const m = matchPath('/api/capabilities/:id', path);
    if (m && method === 'PUT') {
      const idx = store.capabilities.findIndex(c => c.id === m.id);
      if (idx >= 0) {
        store.capabilities[idx] = { ...store.capabilities[idx], ...body, updated_at: NOW() };
        persist();
        return store.capabilities[idx] as T;
      }
    }
  }

  // ─── Control Registry ──────────────────────────────────────────────────────
  if (path === '/api/control-registry' && method === 'GET') return store.controlRegistry as T;
  if (path === '/api/control-registry/notifications') return store.controlNotifications as T;
  if (path === '/api/control-registry' && method === 'POST') {
    const created = { id: newId('demo-ctlreg'), created_at: NOW(), updated_at: NOW(), evidence_metadata: null, enforced_by: null, reviewed_by: null, ...body };
    store.controlRegistry.push(created);
    persist();
    return created as T;
  }
  if (path === '/api/control-registry/bulk' && method === 'DELETE') {
    const ids: string[] = (body as any)?.ids || [];
    const before = store.controlRegistry.length;
    store.controlRegistry = store.controlRegistry.filter(c => !ids.includes(c.id));
    persist();
    return { deleted: before - store.controlRegistry.length, total: ids.length, errors: 0 } as T;
  }
  // NN baseline recompute — demo has no real NN templates table; report
  // nothing to add so the Recompute modal renders cleanly.
  if (path === '/api/controls/nn-preview' && method === 'GET')
    return { to_add: 0, total_templates: 0, sample: [] } as T;
  if (path === '/api/controls/seed-nn' && method === 'POST')
    return { message: 'No-op in demo', data: 0 } as T;
  {
    const m = matchPath('/api/control-registry/:id', path);
    if (m) {
      if (method === 'PUT') {
        const idx = store.controlRegistry.findIndex(c => c.id === m.id);
        if (idx >= 0) {
          store.controlRegistry[idx] = { ...store.controlRegistry[idx], ...body, updated_at: NOW() };
          persist();
          return store.controlRegistry[idx] as T;
        }
      }
      if (method === 'DELETE') {
        store.controlRegistry = store.controlRegistry.filter(c => c.id !== m.id);
        persist();
        return undefined as T;
      }
    }
  }
  {
    const m = matchPath('/api/control-registry/notifications/:id/read', path);
    if (m && method === 'PUT') {
      const n = store.controlNotifications.find(x => x.id === m.id);
      if (n) { n.read = true; persist(); }
      return undefined as T;
    }
  }
  {
    const m = matchPath('/api/control-registry/:id/evidence-review', path);
    if (m && method === 'GET') return null as T;
  }
  {
    const m = matchPath('/api/control-registry/:id/evidence-files', path);
    if (m && method === 'GET') return [] as T;
  }
  {
    const m = matchPath('/api/control-registry/:id/approve-enforcement', path);
    if (m && method === 'POST') return undefined as T;
  }
  {
    const m = matchPath('/api/control-registry/:id/reject-enforcement', path);
    if (m && method === 'POST') return undefined as T;
  }

  // ─── Compliance ────────────────────────────────────────────────────────────
  if (path === '/api/compliance' && method === 'GET') return store.compliance as T;
  if (path === '/api/compliance' && method === 'POST') {
    const created = { id: newId('demo-comp'), updated_at: NOW(), associated_int_ctls: [], ...body };
    store.compliance.push(created);
    persist();
    return created as T;
  }
  {
    const m = matchPath('/api/compliance/:id', path);
    if (m) {
      if (method === 'PUT') {
        const idx = store.compliance.findIndex(c => c.id === m.id);
        if (idx >= 0) {
          store.compliance[idx] = { ...store.compliance[idx], ...body, updated_at: NOW() };
          persist();
          return store.compliance[idx] as T;
        }
      }
      if (method === 'DELETE') {
        store.compliance = store.compliance.filter(c => c.id !== m.id);
        persist();
        return undefined as T;
      }
    }
  }
  if (path.startsWith('/api/compliance/scoring-trend')) {
    const range = getQuery(path, 'range') || '1week';
    const daysByRange: Record<string, number> = { '1day': 1, '1week': 7, '1month': 30, '1quarter': 90, '1year': 365 };
    const days = daysByRange[range] || 7;
    return store.scoringHistory.slice(-days) as T;
  }

  // ─── Contacts ──────────────────────────────────────────────────────────────
  if (path === '/api/contacts' && method === 'GET') return store.contacts as T;
  if (path === '/api/contacts' && method === 'POST') {
    const created = { id: newId('demo-contact'), created_at: NOW(), ...body };
    store.contacts.push(created);
    persist();
    return created as T;
  }
  if (path === '/api/contacts/bulk' && method === 'POST') {
    const created = (body as any[]).map(c => ({ id: newId('demo-contact'), created_at: NOW(), ...c }));
    store.contacts.push(...created);
    persist();
    return created as T;
  }
  {
    const m = matchPath('/api/contacts/:id', path);
    if (m) {
      if (method === 'PUT') {
        const idx = store.contacts.findIndex(c => c.id === m.id);
        if (idx >= 0) {
          store.contacts[idx] = { ...store.contacts[idx], ...body };
          persist();
          return store.contacts[idx] as T;
        }
      }
      if (method === 'DELETE') {
        store.contacts = store.contacts.filter(c => c.id !== m.id);
        persist();
        return undefined as T;
      }
    }
  }

  // ─── Mapper (knowledge graph) ──────────────────────────────────────────────
  // Synthesises a small SCF-shaped graph from the in-memory policies so the
  // visualizer renders without hitting the real Neo4j/Supabase backends.
  if (path === '/api/mapper/run' && method === 'POST') {
    const master = store.policies.find(p => p.is_master);
    if (!master) return { status: 'needs_master', message: 'No master policy set.' } as T;
    return {
      status: 'ok',
      trigger: 'policies',
      master_policy_id: master.policy_id,
      summary: { objectives: 6, scf_domains: 6, child_links: 12, orphans: 2 },
      extraction: { security_objectives: [], child_policy_links: [] },
    } as T;
  }
  if (path.startsWith('/api/mapper/graph')) {
    const master = store.policies.find(p => p.is_master);
    if (!master) return { nodes: [], edges: [] } as T;
    // Subset of the real SCF domain list — keeps the demo aligned with the
    // production ontology without depending on a populated scf_domains table.
    const scfDomains = [
      { scf_id: 'IAC', domain_name: 'Identification & Authentication' },
      { scf_id: 'DCH', domain_name: 'Data Classification & Handling' },
      { scf_id: 'NET', domain_name: 'Network Security' },
      { scf_id: 'IRO', domain_name: 'Incident Response' },
      { scf_id: 'BCD', domain_name: 'Business Continuity & Disaster Recovery' },
      { scf_id: 'TPM', domain_name: 'Third-Party Management' },
    ];
    const objectives = [
      { name: 'Authenticate Workforce',              scf_id: 'IAC' },
      { name: 'Protect Sensitive Data at Rest',      scf_id: 'DCH' },
      { name: 'Segment the Network',                 scf_id: 'NET' },
      { name: 'Respond to Security Incidents',       scf_id: 'IRO' },
      { name: 'Recover Business-Critical Functions', scf_id: 'BCD' },
      { name: 'Govern Third-Party Risk',             scf_id: 'TPM' },
    ];
    const nodes: any[] = [
      { id: `m:${master.policy_id}`, type: 'MasterPolicy', data: { name: master.name, policy_id: master.policy_id, is_master: true } },
      ...scfDomains.map(d => ({ id: `scfdomain:${d.scf_id}`, type: 'SCFDomain', data: d })),
      ...objectives.map(o => ({
        id: `objective:${master.policy_id}:${o.name}`,
        type: 'SecurityObjective',
        data: { name: o.name, master_policy_id: master.policy_id, confidence: 0.9 },
      })),
      ...store.policies.filter(p => !p.is_master).slice(0, 10).map(p => ({
        id: `policy:${p.policy_id}`, type: 'ChildPolicy', data: { name: p.name, policy_id: p.policy_id, policy_status: p.policy_status },
      })),
    ];
    const edges: any[] = [
      ...objectives.map(o => ({
        id: `e-def-${o.name}`,
        source: `m:${master.policy_id}`,
        target: `objective:${master.policy_id}:${o.name}`,
        label: 'DEFINES',
        data: { confidence: 0.9 },
      })),
      ...objectives.map(o => ({
        id: `e-map-${o.name}`,
        source: `objective:${master.policy_id}:${o.name}`,
        target: `scfdomain:${o.scf_id}`,
        label: 'MAPS_TO',
        data: { confidence: 0.9 },
      })),
      ...store.policies.filter(p => !p.is_master).slice(0, 10).map(p => ({
        id: `e-has-${p.policy_id}`, source: `m:${master.policy_id}`, target: `policy:${p.policy_id}`, label: 'HAS_CHILD',
      })),
      ...store.policies.filter(p => !p.is_master).slice(0, 8).map((p, i) => ({
        id: `e-cov-${p.policy_id}`,
        source: `policy:${p.policy_id}`,
        target: `scfdomain:${scfDomains[i % scfDomains.length].scf_id}`,
        label: 'COVERS',
        data: { confidence: 0.7 + (i % 3) * 0.1 },
      })),
    ];
    return { nodes, edges } as T;
  }
  if (path === '/api/mapper/health') return { status: 'ok' } as T;

  // ─── Due Diligence & TPRM ──────────────────────────────────────────────────
  // Stateless in production; in demo we synthesise plausible answers from the
  // in-memory control registry so the flow is exercisable without the AI agent.
  if (path === '/api/dd/answer-questionnaire' && method === 'POST') {
    const { headers = [], rows = [], question_column } = JSON.parse((options.body as string) || '{}');
    const qcol = question_column && headers.includes(question_column)
      ? question_column
      : (headers.find((h: string) => /question|requirement|control/i.test(h)) || headers[0]);
    const answers = (rows as Record<string, any>[])
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => String(r[qcol] || '').trim())
      .map(({ i }) => ({
        row_index: i,
        answer: 'Yes',
        comments: 'Addressed by enforced controls in the control registry (demo).',
        evidence: store.controlRegistry[0]?.ctl_id || 'CTL-DEMO-001',
        rationale: 'Demo response — synthesised from in-memory control data.',
      }));
    return {
      status: 'ok',
      question_column: qcol,
      column_map: { answer: null, comments: null, evidence: null, rationale: null },
      answers,
      questions_answered: answers.length,
    } as T;
  }
  if (path === '/api/dd/ask' && method === 'POST') {
    const { question } = JSON.parse((options.body as string) || '{}');
    return {
      status: 'ok',
      answer: `Demo answer for: "${String(question || '').slice(0, 80)}". Grounded responses require the AI agent, which is bypassed in demo mode.`,
      sources: ['demo'],
    } as T;
  }

  // ─── Risk Registry ─────────────────────────────────────────────────────────
  // Synthesise a small demo register so the Risk tab renders without the SCF
  // reference tables / compute function.
  if (path === '/api/risk/register' || (path === '/api/risk/compute' && method === 'POST')) {
    const seed = [
      ['R-AC-1', 'Access Control', 'Inability to maintain individual accountability', 'Critical', 'High', 12, 7, 0.42],
      ['R-GV-1', 'Governance', 'Lack of governance oversight', 'High', 'Medium', 9, 6, 0.34],
      ['R-EX-1', 'External', 'Third-party compromise', 'High', 'High', 8, 2, 0.75],
      ['R-BC-2', 'Business Continuity', 'Inability to recover operations', 'Medium', 'Low', 6, 5, 0.18],
      ['R-IR-1', 'Incident Response', 'Delayed incident detection', 'Medium', 'Medium', 5, 2, 0.45],
    ];
    const computed_at = NOW();
    const register = seed.map(([risk_id, risk_grouping, risk_name, inherent_level, residual_level, total, enforced, gap], i) => ({
      id: `demo-risk-${i}`, org_id: 'demo', risk_id, risk_grouping, risk_name,
      risk_description: 'Demo risk entry synthesised for the ABC News demo tenant.',
      nist_csf_function: 'Govern',
      total_controls: total as number, enforced_controls: enforced as number,
      total_weight: (total as number) * 5, enforced_weight: (enforced as number) * 5,
      gap: gap as number, inherent_score: 80, residual_score: 40,
      inherent_level, residual_level, source: 'computed', computed_at,
    }));
    if (path === '/api/risk/compute') return { status: 'ok', computed_at, count: register.length, register } as T;
    return { computed_at, register } as T;
  }
  if (path === '/api/risk/manual' && method === 'POST') {
    const b = JSON.parse((options.body as string) || '{}');
    return {
      id: `demo-manual-${Date.now()}`, org_id: 'demo', risk_id: 'M-DEMO', source: 'manual',
      risk_grouping: b.risk_grouping || null, risk_name: b.risk_name || '', risk_description: b.risk_description || null,
      nist_csf_function: b.nist_csf_function || null, total_controls: 0, enforced_controls: 0,
      total_weight: 0, enforced_weight: 0, gap: 0, inherent_score: 0, residual_score: 0,
      inherent_level: b.inherent_level || 'Medium', residual_level: b.residual_level || 'Medium', computed_at: NOW(),
    } as T;
  }
  if (path.startsWith('/api/risk/manual/')) {
    return (method === 'DELETE' ? undefined : { id: path.split('/').pop(), source: 'manual' }) as T;
  }

  // ─── Feedback (silent success) ────────────────────────────────────────────
  if (path === '/api/feedback' && method === 'POST') return undefined as T;

  // ─── Health ────────────────────────────────────────────────────────────────
  if (path === '/api/health') return { status: 'ok', demo: true } as T;

  // ─── Fallback: log and return a safe default ──────────────────────────────
  console.warn('[demo] unhandled path', method, path);
  if (method === 'GET') return [] as unknown as T;
  return undefined as T;
};

const safeParse = (body: BodyInit): any => {
  if (typeof body !== 'string') return null;
  try { return JSON.parse(body); } catch { return null; }
};
