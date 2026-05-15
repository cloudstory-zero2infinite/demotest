import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listCompliance,
  createCompliance,
  updateCompliance,
  deleteCompliance,
  bulkCreateCompliance,
  bulkDeleteCompliance,
} from '../../services/api';
import { Compliance, ComplianceCreate } from '../../types';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';
import { exportRowsToXlsx, parseXlsxOrCsv } from '../../utils/xlsx';

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; row: Compliance }
  | { type: 'view'; row: Compliance }
  | null;

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Achieved'];

const emptyForm: ComplianceCreate = {
  compliance_id: '',
  framework: '',
  description: '',
  status: 'Not Started',
};

export const ComplianceManager: React.FC = () => {
  const [rows, setRows] = useState<Compliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<ComplianceCreate>(emptyForm);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { push } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCompliance();
      setRows(data);
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message || 'Failed to load compliance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.compliance_id || '').toLowerCase().includes(q) ||
        (r.framework || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.status || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const openAdd = () => {
    setForm(emptyForm);
    setModal({ type: 'add' });
  };

  const openEdit = (row: Compliance) => {
    setForm({
      compliance_id: row.compliance_id || '',
      framework: row.framework,
      description: row.description || '',
      status: row.status || 'Not Started',
    });
    setModal({ type: 'edit', row });
  };

  const submit = async () => {
    if (!form.framework.trim()) {
      push('Framework is required', 'error');
      return;
    }
    setBusy(true);
    try {
      if (modal?.type === 'add') {
        await createCompliance(form);
        push('Created compliance row', 'success');
      } else if (modal?.type === 'edit') {
        await updateCompliance(modal.row.id, form);
        push('Updated compliance row', 'success');
      }
      setModal(null);
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this compliance row?')) return;
    setBusy(true);
    try {
      await deleteCompliance(id);
      push('Deleted', 'success');
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Delete failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected row(s)?`)) return;
    setBusy(true);
    try {
      const res = await bulkDeleteCompliance(Array.from(selected));
      push(`Deleted ${res.deleted} row(s)`, 'success');
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Bulk delete failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    const out = rows.map((r) => ({
      compliance_id: r.compliance_id,
      framework: r.framework,
      description: r.description,
      status: r.status,
    }));
    exportRowsToXlsx(out, `compliance-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await parseXlsxOrCsv(file);
      const payload: ComplianceCreate[] = parsed
        .map((r) => ({
          compliance_id: (r.compliance_id ?? r.Compliance_ID ?? null) as string | null,
          framework: String(r.framework ?? r.Framework ?? '').trim(),
          description: (r.description ?? r.Description ?? '') as string,
          status: (r.status ?? r.Status ?? 'Not Started') as string,
        }))
        .filter((r) => r.framework);
      if (!payload.length) {
        push('No valid rows found (framework column required)', 'error');
        return;
      }
      const inserted = await bulkCreateCompliance(payload);
      push(`Imported ${inserted.length} row(s)`, 'success');
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Import failed', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Compliance</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Global compliance catalog managed by SMEs.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
          />
          <button
            onClick={handleExport}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Export
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
            }}
          />
          {selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Delete ({selected.size})
            </button>
          )}
          <button
            onClick={openAdd}
            className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            + Add
          </button>
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">Loading…</div>
      ) : error ? (
        <div className="px-5 py-8 text-center text-red-600 dark:text-red-400">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Compliance ID</th>
                <th className="px-3 py-2 text-left font-medium">Framework</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono">{r.compliance_id || '—'}</td>
                  <td className="px-3 py-2 font-medium">{r.framework}</td>
                  <td className="px-3 py-2 max-w-md truncate text-gray-600 dark:text-gray-300">
                    {r.description || '—'}
                  </td>
                  <td className="px-3 py-2">{r.status || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => openEdit(r)} className="text-blue-600 hover:underline mr-3">
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={busy}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!modal && (modal.type === 'add' || modal.type === 'edit')}
        onClose={() => setModal(null)}
        title={modal?.type === 'edit' ? 'Edit Compliance' : 'Add Compliance'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Compliance ID</label>
            <input
              type="text"
              value={form.compliance_id || ''}
              onChange={(e) => setForm({ ...form, compliance_id: e.target.value })}
              className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Framework <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.framework}
              onChange={(e) => setForm({ ...form, framework: e.target.value })}
              className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={form.status || 'Not Started'}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setModal(null)}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
