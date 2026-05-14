import React, { useCallback, useEffect, useState } from 'react';
import { listOntology, getOntologyContent } from '../../services/api';
import { OntologyFile } from '../../types';
import { useToast } from '../common/Toast';

export const OntologyEditor: React.FC = () => {
  const [files, setFiles] = useState<OntologyFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [editing, setEditing] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOntology();
      setFiles(data);
      if (data.length > 0 && !active) {
        setActive(data[0].name);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to list ontology files');
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setContentLoading(true);
    getOntologyContent(active)
      .then((r) => {
        if (!cancelled) {
          setContent(r.content);
          setEditing(r.content);
        }
      })
      .catch((e) => !cancelled && push(e?.message || 'Failed to load file', 'error'))
      .finally(() => !cancelled && setContentLoading(false));
    return () => {
      cancelled = true;
    };
  }, [active, push]);

  const dirty = editing !== content;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-base font-semibold">Ontology File Editor</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Ontology files live in GitHub. Editing is local-preview only — save is disabled until the
          GitHub editing flow is wired up.
        </p>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">Loading…</div>
      ) : error ? (
        <div className="px-5 py-8 text-center text-red-600 dark:text-red-400">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] min-h-[500px]">
          <aside className="border-r border-gray-200 dark:border-gray-700">
            <ul>
              {files.map((f) => (
                <li key={f.name}>
                  <button
                    onClick={() => setActive(f.name)}
                    className={`w-full text-left px-4 py-2 text-sm font-mono break-all ${
                      active === f.name
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}
                    title={f.description}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
              {files.length === 0 && (
                <li className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                  No ontology files found.
                </li>
              )}
            </ul>
          </aside>

          <section className="flex flex-col">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
              <div className="font-mono text-gray-700 dark:text-gray-200">
                {active || 'No file selected'}
              </div>
              <div className="flex gap-2 items-center">
                {dirty && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Unsaved local changes
                  </span>
                )}
                <button
                  disabled
                  title="Save is disabled — GitHub editing flow not wired up yet"
                  className="text-sm px-3 py-1.5 rounded bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500"
                >
                  Save (disabled)
                </button>
              </div>
            </div>
            <div className="flex-1 p-4">
              {contentLoading ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-12">Loading…</div>
              ) : (
                <textarea
                  value={editing}
                  onChange={(e) => setEditing(e.target.value)}
                  spellCheck={false}
                  className="w-full h-[500px] font-mono text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 text-gray-900 dark:text-gray-100"
                />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
