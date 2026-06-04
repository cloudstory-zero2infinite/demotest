import React, { useCallback, useEffect, useState } from 'react';
import * as SupabaseService from '../../services/supabase';
import { EmailTemplate } from '../../types';

interface OrgTemplatesTabProps {
    isActive?: boolean;
    readOnly?: boolean;
}

type ModalState =
    | { kind: 'closed' }
    | { kind: 'create' }
    | { kind: 'edit'; template: EmailTemplate }
    | { kind: 'delete'; template: EmailTemplate };

const PLACEHOLDERS = ['{{policyName}}', '{{dueDate}}', '{{policyLink}}'];

export const OrgTemplatesTab: React.FC<OrgTemplatesTabProps> = ({ isActive = true, readOnly = false }) => {
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setTemplates(await SupabaseService.getEmailTemplates());
        } catch {
            /* surfaced via empty state */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isActive) load();
    }, [isActive, load]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Templates</h2>
                {!readOnly && (
                    <button
                        onClick={() => setModal({ kind: 'create' })}
                        className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                    >
                        + New Template
                    </button>
                )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                Reusable email templates for your organisation. Select one under Settings →
                "Policy expiry email template" to drive the policy reminder emails. Placeholders:{' '}
                {PLACEHOLDERS.map((p) => (
                    <code key={p} className="mx-0.5 px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{p}</code>
                ))}
            </p>

            {templates.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    No templates yet.{!readOnly && ' Click "New Template" to create one.'}
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                    {templates.map((t) => (
                        <div key={t.id} className="flex items-start justify-between gap-4 px-5 py-4">
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                    <span className="font-medium">Subject:</span> {t.subject || <span className="italic">(none)</span>}
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{t.body}</div>
                            </div>
                            {!readOnly && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                        onClick={() => setModal({ kind: 'edit', template: t })}
                                        className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => setModal({ kind: 'delete', template: t })}
                                        className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                                    >
                                        Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {(modal.kind === 'create' || modal.kind === 'edit') && (
                <TemplateModal
                    template={modal.kind === 'edit' ? modal.template : undefined}
                    onClose={() => setModal({ kind: 'closed' })}
                    onSaved={() => { setModal({ kind: 'closed' }); load(); }}
                />
            )}
            {modal.kind === 'delete' && (
                <DeleteModal
                    template={modal.template}
                    onClose={() => setModal({ kind: 'closed' })}
                    onDeleted={() => { setModal({ kind: 'closed' }); load(); }}
                />
            )}
        </div>
    );
};

const TemplateModal: React.FC<{
    template?: EmailTemplate;
    onClose: () => void;
    onSaved: () => void;
}> = ({ template, onClose, onSaved }) => {
    const [name, setName] = useState(template?.name || '');
    const [subject, setSubject] = useState(template?.subject || '');
    const [body, setBody] = useState(template?.body || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!name.trim()) { setError('Template name is required.'); return; }
        setSaving(true);
        setError(null);
        try {
            if (template) {
                await SupabaseService.updateEmailTemplate(template.id, { name: name.trim(), subject, body });
            } else {
                await SupabaseService.createEmailTemplate({ name: name.trim(), subject, body });
            }
            onSaved();
        } catch (e: any) {
            setError(e?.message || 'Failed to save template.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">{template ? 'Edit Template' : 'New Template'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
                </div>
                <div className="px-6 py-5 overflow-y-auto space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Policy Expiry — Urgent"
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                        <input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Urgent: Information Security Policy Nearing Expiration"
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body</label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={10}
                            placeholder="Our {{policyName}} will expire on {{dueDate}}…"
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        />
                        <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                            Placeholders:{' '}
                            {PLACEHOLDERS.map((p) => (
                                <code key={p} className="mx-0.5 px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{p}</code>
                            ))}
                            . If you omit <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">{'{{policyLink}}'}</code>, a "Review the policy" button is appended automatically.
                        </p>
                    </div>
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                </div>
                <div className="px-6 py-3 border-t dark:border-gray-700 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
                    <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300">
                        {saving ? 'Saving…' : template ? 'Save Changes' : 'Create Template'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const DeleteModal: React.FC<{
    template: EmailTemplate;
    onClose: () => void;
    onDeleted: () => void;
}> = ({ template, onClose, onDeleted }) => {
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async () => {
        setDeleting(true);
        setError(null);
        try {
            await SupabaseService.deleteEmailTemplate(template.id);
            onDeleted();
        } catch (e: any) {
            setError(e?.message || 'Failed to delete template.');
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-5">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Delete template?</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Delete <span className="font-semibold">{template.name}</span>? If it's selected for policy
                        expiry reminders, those will fall back to the built-in default template.
                    </p>
                    {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
                </div>
                <div className="px-6 py-3 border-t dark:border-gray-700 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
                    <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300">
                        {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
};
