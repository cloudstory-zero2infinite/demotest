import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  listPolicyCorpus,
  uploadPolicyCorpus,
  deletePolicyCorpus,
  downloadPolicyCorpus,
} from '../../services/api';
import { PolicyCorpusFile } from '../../types';
import { useToast } from '../common/Toast';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const PolicyCorpusManager: React.FC = () => {
  const [files, setFiles] = useState<PolicyCorpusFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { push } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPolicyCorpus();
      setFiles(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load files');
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
      await uploadPolicyCorpus(file);
      push(`Uploaded ${file.name}`, 'success');
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Upload failed', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDelete = async (name: string) => {
    if (!confirm(`Delete "${name}" from policy-corpus? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deletePolicyCorpus(name);
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
      const blob = await downloadPolicyCorpus(name);
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Policy Vector DB · `policy-corpus` bucket</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Files here are the reference corpus used for policy vectorization.
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
            + Upload file
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">Loading…</div>
      ) : error ? (
        <div className="px-5 py-8 text-center text-red-600 dark:text-red-400">{error}</div>
      ) : files.length === 0 ? (
        <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">
          No files in the corpus yet.
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
  );
};
