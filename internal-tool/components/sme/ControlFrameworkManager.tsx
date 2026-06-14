import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  listControlFramework,
  listScfDomains,
  listScfControls,
  uploadControlFramework,
  deleteControlFrameworkFile,
  downloadControlFramework,
} from '../../services/api';
import { ScfFile, ScfDomain, ScfControl } from '../../types';
import { useToast } from '../common/Toast';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ControlFrameworkManager: React.FC = () => {
  const [files, setFiles] = useState<ScfFile[]>([]);
  const [counts, setCounts] = useState<{ domains: number; controls: number; risks?: number }>({
    domains: 0,
    controls: 0,
    risks: 0,
  });
  const [domains, setDomains] = useState<ScfDomain[]>([]);
  const [controls, setControls] = useState<ScfControl[]>([]);
  const [controlQuery, setControlQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { push } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meta, dmns, ctrls] = await Promise.all([
        listControlFramework(),
        listScfDomains(),
        listScfControls(),
      ]);
      setFiles(meta.files);
      setCounts(meta.counts);
      setDomains(dmns);
      setControls(ctrls);
    } catch (e: any) {
      setError(e?.message || 'Failed to load Control Framework state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const result = await uploadControlFramework(file);
      push(
        `Uploaded ${result.name} — ${result.counts.domains} domains, ${result.counts.controls} controls, ${result.counts.risks ?? 0} risks` +
          (result.skipped_controls
            ? ` (${result.skipped_controls} controls skipped — unknown domain prefix)`
            : ''),
        'success'
      );
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Upload failed', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDelete = async (name: string) => {
    if (
      !confirm(
        `Delete "${name}" from scf-reference?\n\nThis removes the archived file only. The parsed scf_domains / scf_controls tables stay in place — re-upload a new file to refresh them.`
      )
    )
      return;
    setBusy(true);
    try {
      await deleteControlFrameworkFile(name);
      push(`Deleted ${name}`, 'success');
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Delete failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async (name: string) => {
    try {
      const blob = await downloadControlFramework(name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      push(e?.message || 'Download failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              Control Framework · <span className="font-mono">scf-reference</span> bucket
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Upload the SCF xlsx. Only <span className="font-mono">SCF Domains &amp; Principles</span>{' '}
              and <span className="font-mono">SCF 2026.1</span> are parsed. Each upload wipes and
              repopulates the <span className="font-mono">scf_domains</span> and{' '}
              <span className="font-mono">scf_controls</span> tables that the mapper agent reads
              from. Shared across all tenants.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refresh()}
              disabled={loading || busy}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Working…' : '+ Upload SCF xlsx'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
          </div>
        </div>

        <div className="px-5 py-3 grid grid-cols-3 gap-3 text-sm border-b border-gray-200 dark:border-gray-700">
          <div>
            <div className="text-gray-500 dark:text-gray-400 text-xs uppercase">Parsed domains</div>
            <div className="text-2xl font-semibold">{counts.domains}</div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-gray-400 text-xs uppercase">Parsed controls</div>
            <div className="text-2xl font-semibold">{counts.controls}</div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-gray-400 text-xs uppercase">Parsed risks</div>
            <div className="text-2xl font-semibold">{counts.risks ?? 0}</div>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">Loading…</div>
        ) : error ? (
          <div className="px-5 py-8 text-center text-red-600 dark:text-red-400">{error}</div>
        ) : files.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">
            No SCF file uploaded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                    Name
                  </th>
                  <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                    Size
                  </th>
                  <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                    Updated
                  </th>
                  <th className="px-5 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {files.map((f) => (
                  <tr key={f.name} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                    <td className="px-5 py-2 font-mono break-all">{f.name}</td>
                    <td className="px-5 py-2">{formatBytes(f.size || 0)}</td>
                    <td className="px-5 py-2 text-gray-500 dark:text-gray-400">
                      {f.updatedAt ? new Date(f.updatedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-2 text-right">
                      <button
                        onClick={() => onDownload(f.name)}
                        className="text-blue-600 hover:underline mr-3"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => onDelete(f.name)}
                        disabled={busy}
                        className="text-red-600 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">SCF Controls ({controls.length})</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Live preview from the <span className="font-mono">scf_controls</span> table — every
              control parsed from the latest upload. Grows automatically with each new SCF workbook.
            </p>
          </div>
          <input
            type="text"
            value={controlQuery}
            onChange={(e) => setControlQuery(e.target.value)}
            placeholder="Search id / name / domain…"
            className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 w-64"
          />
        </div>
        {controls.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">
            No controls parsed yet.
          </div>
        ) : (
          (() => {
            const q = controlQuery.trim().toLowerCase();
            const filtered = q
              ? controls.filter(
                  (c) =>
                    c.scf_control_id.toLowerCase().includes(q) ||
                    (c.control_name || '').toLowerCase().includes(q) ||
                    (c.scf_domain_label || c.scf_id).toLowerCase().includes(q)
                )
              : controls;
            const CAP = 300;
            const shown = filtered.slice(0, CAP);
            return (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300 w-28">
                        SCF #
                      </th>
                      <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300 w-20">
                        Domain
                      </th>
                      <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                        Control
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {shown.map((c) => (
                      <tr
                        key={c.scf_control_id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-900/30"
                      >
                        <td className="px-5 py-2 font-mono">{c.scf_control_id}</td>
                        <td className="px-5 py-2 font-mono text-gray-500 dark:text-gray-400">
                          {c.scf_id}
                        </td>
                        <td className="px-5 py-2">{c.control_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > CAP && (
                  <div className="px-5 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
                    Showing first {CAP} of {filtered.length} matches — refine your search to narrow.
                  </div>
                )}
                {filtered.length === 0 && (
                  <div className="px-5 py-6 text-center text-gray-500 dark:text-gray-400">
                    No controls match “{controlQuery}”.
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold">SCF Domains ({domains.length})</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Live preview from the <span className="font-mono">scf_domains</span> table. This is
            the canonical list the mapper agent grounds on.
          </p>
        </div>
        {domains.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">
            No domains parsed yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300 w-16">
                    #
                  </th>
                  <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300 w-20">
                    ID
                  </th>
                  <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                    Domain
                  </th>
                  <th className="px-5 py-2 text-right font-medium text-gray-600 dark:text-gray-300 w-24">
                    Controls
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {domains.map((d) => (
                  <tr key={d.scf_id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                    <td className="px-5 py-2 text-gray-500 dark:text-gray-400">
                      {d.sort_order ?? '—'}
                    </td>
                    <td className="px-5 py-2 font-mono">{d.scf_id}</td>
                    <td className="px-5 py-2">{d.domain_name}</td>
                    <td className="px-5 py-2 text-right">{d.control_count ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
