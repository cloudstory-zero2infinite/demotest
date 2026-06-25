import type { ZtiConfig } from './config.js';

export interface CheckSpec {
  id?: string; // job id when from the queue
  scf_control_id?: string;
  nn_ctl_name?: string; // set for Non-Negotiable controls (CSPM posture scan)
  check_id: string;
  title?: string;
  provider?: string;
  service?: string;
  severity?: string;
}

// One control's aggregated CSPM posture result (uploaded to the workspace).
export interface CspmControlResult {
  scf_control_id?: string | null;
  nn_ctl_name?: string | null;
  control_name: string;
  provider: string;
  checks_total: number;
  checks_passed: number;
  checks_failed: number;
  checks_na: number;
  pass_pct: number;
  result_status: 'pass' | 'partial' | 'fail' | 'na';
  raw: Array<{ check_id: string; status: string; total: number; failed: number }>;
}

export type ResultStatus = 'pass' | 'fail' | 'error';

export interface CheckResult {
  result_status: ResultStatus;
  result: any;
}

export class HubApi {
  constructor(private cfg: ZtiConfig) {
    if (!cfg.token) throw new Error('Not authenticated. Run `zti authenticate` first.');
  }

  private async req<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.cfg.apiBaseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-ZTI-Device-Token': this.cfg.token as string,
          ...(options.headers || {}),
        },
      });
    } catch (e: any) {
      const causeCode = e?.cause?.code ? ` (${e.cause.code})` : '';
      throw new Error(`Network error calling ${url}${causeCode}. Ensure backend is running and API URL is correct.`);
    }
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = (await res.json()) as any;
        msg = j.message || j.error || msg;
      } catch {
        /* ignore */
      }
      throw new Error(`${res.status} ${msg}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  beacon(body: { gcp_integrated?: boolean; gcp_project_id?: string } = {}) {
    return this.req<{ ok: boolean; queued: number }>('/api/zti-hub/beacon', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  jobsNext(limit = 10) {
    return this.req<CheckSpec[]>(`/api/zti-hub/jobs/next?limit=${limit}`);
  }

  postJobResult(jobId: string, r: CheckResult) {
    return this.req<{ ok: boolean }>(`/api/zti-hub/jobs/${jobId}/result`, {
      method: 'POST',
      body: JSON.stringify(r),
    });
  }

  postRun(scf_control_id: string, check_id: string, r: CheckResult) {
    return this.req<{ id: string }>('/api/zti-hub/runs', {
      method: 'POST',
      body: JSON.stringify({ scf_control_id, check_id, ...r }),
    });
  }

  controlChecks(scfControlId: string) {
    return this.req<CheckSpec[]>(`/api/zti-hub/control-checks?scf_control_id=${encodeURIComponent(scfControlId)}`);
  }

  frameworkChecks(framework: string) {
    return this.req<CheckSpec[]>(`/api/zti-hub/framework-checks?framework=${encodeURIComponent(framework)}`);
  }

  allChecks() {
    return this.req<CheckSpec[]>('/api/zti-hub/all-checks');
  }

  // ── CSPM posture scan ──────────────────────────────────────────────────────
  createCspmJob(body: { scope_type: string; scope_value?: string | null; provider?: string | null; is_mock: boolean }) {
    return this.req<{ id: string }>('/api/cspm-scan/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  postCspmStatus(jobId: string, status: 'running' | 'completed' | 'failed', summary?: unknown) {
    return this.req<{ ok: boolean }>(`/api/cspm-scan/jobs/${jobId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, summary }),
    });
  }

  postCspmResults(jobId: string, results: CspmControlResult[]) {
    return this.req<{ staged: number }>(`/api/cspm-scan/jobs/${jobId}/results`, {
      method: 'POST',
      body: JSON.stringify({ results }),
    });
  }

  // ── Vulnerability scan (OpenVAS) ──────────────────────────────────────────
  createScanJob(body: {
    target_type: string;
    target_value?: string | null;
    authorized: boolean;
    consent_by?: string;
    is_mock: boolean;
  }) {
    return this.req<{ id: string }>('/api/vuln-scan/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  postScanStatus(jobId: string, status: 'running' | 'completed' | 'failed', summary?: unknown) {
    return this.req<{ ok: boolean }>(`/api/vuln-scan/jobs/${jobId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, summary }),
    });
  }

  postScanFindings(jobId: string, findings: unknown[]) {
    return this.req<{ staged: number }>(`/api/vuln-scan/jobs/${jobId}/findings`, {
      method: 'POST',
      body: JSON.stringify({ findings }),
    });
  }

  saveOpenvasReport(body: { findings: unknown[]; job_id?: string }) {
    return this.req<{ ok: boolean; path: string; bucket: string; total: number }>(
      '/api/zti-hub/openvas/report',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }
}
