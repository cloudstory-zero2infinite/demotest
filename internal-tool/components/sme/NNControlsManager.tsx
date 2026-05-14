import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listNNControls,
  createNNControl,
  updateNNControl,
  deleteNNControl,
  bulkCreateNNControls,
  bulkDeleteNNControls,
} from '../../services/api';
import { NNControlTemplate, NNControlTemplateCreate } from '../../types';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';
import { exportRowsToXlsx, parseXlsxOrCsv } from '../../utils/xlsx';

type ModalState = { type: 'add' } | { type: 'edit'; row: NNControlTemplate } | null;

const ENFORCEMENT_OPTIONS = ['org_wide', 'per_asset', 'per_capability'];

const emptyForm: NNControlTemplateCreate = {
  ctl_name: '',
  ctl_description: '',
  enforcement_type: 'org_wide',
  ctld_by: [],
  ctl_ref_fw: '',
  ctl_other_details: '',
};

function splitCsv(v: string | null | undefined): string[] {
  if (!v) return [];
  return String(v)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const NNControlsManager: React.FC = () => {
  const [rows, setRows] = useState<NNControlTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<NNControlTemplateCreate>(emptyForm);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { push } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listNNControls();
      setRows(data);
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message || 'Failed to load NN controls');
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
        (r.ctl_name || '').toLowerCase().includes(q) ||
        (r.ctl_description || '').toLowerCase().includes(q) ||
        (r.ctl_ref_fw || '').toLowerCase().includes(q) ||
        (r.enforcement_type || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const openAdd = () => {
    setForm(emptyForm);
    setModal({ type: 'add' });
  };

  const openEdit = (row: NNControlTemplate) => {
    setForm({
      ctl_name: row.ctl_name,
      ctl_description: row.ctl_description || '',
      enforcement_type: row.enforcement_type || 'org_wide',
      ctld_by: row.ctld_by || [],
      ctl_ref_fw: row.ctl_ref_fw || '',
      ctl_other_details: row.ctl_other_details || '',
    });
    setModal({ type: 'edit', row });
  };

  const submit = async () => {
    if (!form.ctl_name.trim()) {
      push('Control name is required', 'error');
      return;
    }
    setBusy(true);
    try {
      if (modal?.type === 'add') {
        await createNNControl(form);
        push('Created NN control template', 'success');
      } else if (modal?.type === 'edit') {
        await updateNNControl(modal.row.id, form);
        push('Updated NN control template', 'success');
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
    if (!confirm('Delete this NN control template?')) return;
    setBusy(true);
    try {
      await deleteNNControl(id);
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
      const res = await bulkDeleteNNControls(Array.from(selected));
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
      ctl_name: r.ctl_name,
      ctl_description: r.ctl_description,
      enforcement_type: r.enforcement_type,
      ctld_by: (r.ctld_by || []).join(', '),
      ctl_ref_fw: r.ctl_ref_fw,
      ctl_other_details: r.ctl_other_details,
    }));
    exportRowsToXlsx(out, `nn-controls-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await parseXlsxOrCsv(file);
      const payload: NNControlTemplateCreate[] = parsed
        .map((r) => ({
          ctl_name: String(r.ctl_name ?? r.Name ?? '').trim(),
          ctl_description: (r.ctl_description ?? r.Description ?? '') as string,
          enforcement_type: (r.enforcement_type ?? 'org_wide') as string,
          ctld_by: splitCsv(r.ctld_by as string),
          ctl_ref_fw: (r.ctl_ref_fw ?? '') as string,
          ctl_other_details: (r.ctl_other_details ?? '') as string,
        }))
        .filter((r) => r.ctl_name);
      if (!payload.length) {
        push('No valid rows found (ctl_name required)', 'error');
        return;
      }
      const inserted = await bulkCreateNNControls(payload);
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
          <h2 className="text-base font-semibold">NN Control Templates</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Master library — these get seeded into each org's control_registry.
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
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Ref FW</th>
                <th className="px-3 py-2 text-left font-medium">Enforcement</th>
                <th className="px-3 py-2 text-left font-medium">Ctld by</th>
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
                  <td className="px-3 py-2 font-medium">{r.ctl_name}</td>
                  <td className="px-3 py-2 max-w-sm truncate text-gray-600 dark:text-gray-300">
                    {r.ctl_description || '—'}
                  </td>
                  <td className="px-3 py-2">{r.ctl_ref_fw || '—'}</td>
                  <td className="px-3 py-2">{r.enforcement_type || '—'}</td>
                  <td className="px-3 py-2 text-xs">{(r.ctld_by || []).join(', ') || '—'}</td>
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
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title={modal?.type === 'edit' ? 'Edit NN Control' : 'Add NN Control'}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Control Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.ctl_name}
              onChange={(e) => setForm({ ...form, ctl_name: e.target.value })}
              className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.ctl_description || ''}
              onChange={(e) => setForm({ ...form, ctl_description: e.target.value })}
              rows={3}
              className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Ref Framework</label>
              <input
                type="text"
                value={form.ctl_ref_fw || ''}
                onChange={(e) => setForm({ ...form, ctl_ref_fw: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Enforcement Type</label>
              <select
                value={form.enforcement_type || 'org_wide'}
                onChange={(e) => setForm({ ...form, enforcement_type: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
              >
                {ENFORCEMENT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Ctld by (comma-separated)
            </label>
            <input
              type="text"
              value={(form.ctld_by || []).join(', ')}
              onChange={(e) => setForm({ ...form, ctld_by: splitCsv(e.target.value) })}
              className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Other Details</label>
            <textarea
              value={form.ctl_other_details || ''}
              onChange={(e) => setForm({ ...form, ctl_other_details: e.target.value })}
              rows={2}
              className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            />
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
