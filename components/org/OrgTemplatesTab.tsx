import React, { useCallback, useEffect, useState } from 'react';
import * as SupabaseService from '../../services/supabase';
import { EmailTemplate } from '../../types';
import { marked } from 'marked';
marked.setOptions({ gfm: true, breaks: true });

interface OrgTemplatesTabProps {
    isActive?: boolean;
    readOnly?: boolean;
}

type EmailModalState =
    | { kind: 'closed' }
    | { kind: 'create' }
    | { kind: 'edit'; template: EmailTemplate }
    | { kind: 'delete'; template: EmailTemplate };

type PolicyModalState =
    | { kind: 'closed' }
    | { kind: 'create' }
    | { kind: 'edit'; template: any }
    | { kind: 'delete'; template: any };

const EMAIL_PLACEHOLDERS = ['{{policyName}}', '{{dueDate}}', '{{policyLink}}'];

const STANDARD_PLACEHOLDERS = [
    { code: '{{company_name}}', desc: 'Tenant Name' },
    { code: '{{company_location}}', desc: 'Location' },
    { code: '{{company_website}}', desc: 'Company Website' },
    { code: '{{company_logo}}', desc: 'Company Logo Image' },
    { code: '{{policy_title}}', desc: 'Policy Title' },
    { code: '{{policy_id}}', desc: 'Policy Document ID' },
    { code: '{{policy_ref}}', desc: 'Policy Document Reference' },
    { code: '{{policy_version}}', desc: 'Policy Version' },
    { code: '{{policy_status}}', desc: 'Workflow Status' },
    { code: '{{policy_owner}}', desc: 'Policy Owner Name' },
    { code: '{{policy_refresh_date}}', desc: 'Review Due Date' },
    { code: '{{policy_published_date}}', desc: 'Policy Published Date' },
    { code: '{{policy_content}}', desc: 'Full Markdown Content compiled' },
    { code: '{{signature_block}}', desc: 'Signature Image + Name & Date' },
    { code: '{{header_content}}', desc: 'Custom Header Text' },
    { code: '{{footer_content}}', desc: 'Custom Footer Text' },
    { code: '{{created_name}}', desc: 'Policy Author/Creator Name' },
    { code: '{{created_role}}', desc: 'Policy Author/Creator Role' },
    { code: '{{created_at}}', desc: 'Policy Creation Date' },
    { code: '{{reviewed_name}}', desc: 'Policy Reviewer Name' },
    { code: '{{reviewed_role}}', desc: 'Policy Reviewer Role' },
    { code: '{{reviewed_date}}', desc: 'Policy Review Date' },
    { code: '{{approved_name}}', desc: 'Policy Approver Name' },
    { code: '{{approved_role}}', desc: 'Policy Approver Role' },
    { code: '{{approved_date}}', desc: 'Policy Approval Date' },
    { code: '{{integrity_hash}}', desc: 'Integrity Validation Hash' },
];

export const OrgTemplatesTab: React.FC<OrgTemplatesTabProps> = ({ isActive = true, readOnly = false }) => {
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [policyTemplates, setPolicyTemplates] = useState<any[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    
    const [loading, setLoading] = useState(true);
    const [loadingPolicy, setLoadingPolicy] = useState(false);
    
    const [emailModal, setEmailModal] = useState<EmailModalState>({ kind: 'closed' });
    const [policyModal, setPolicyModal] = useState<PolicyModalState>({ kind: 'closed' });

    const loadEmailTemplates = useCallback(async () => {
        setLoading(true);
        try {
            setTemplates(await SupabaseService.getEmailTemplates());
        } catch {
            /* surfaced via empty state */
        } finally {
            setLoading(false);
        }
    }, []);

    const loadPolicyTemplates = useCallback(async () => {
        setLoadingPolicy(true);
        try {
            const [temps, settings] = await Promise.all([
                SupabaseService.getPolicyTemplates(),
                SupabaseService.getOrgSettings()
            ]);
            
            const dbStandard = temps?.find((t: any) => t.name === 'Standard Template');
            const customTemps = temps?.filter((t: any) => t.name !== 'Standard Template') || [];
            
            const standardTemplate = {
                id: dbStandard ? dbStandard.id : 'standard',
                name: 'Standard Template',
                description: 'The built-in default policy template.',
                is_standard: true,
                placeholders: dbStandard ? dbStandard.placeholders : {},
            };
            
            setPolicyTemplates([standardTemplate, ...customTemps]);
            setSelectedTemplateId(settings?.selected_template_id || null);
        } catch {
            /* surfaced via empty state */
        } finally {
            setLoadingPolicy(false);
        }
    }, []);

    useEffect(() => {
        if (isActive) {
            loadEmailTemplates();
            loadPolicyTemplates();
        }
    }, [isActive, loadEmailTemplates, loadPolicyTemplates]);

    return (
        <div className="max-w-4xl space-y-12">
            {/* Email Templates Content */}
            <div>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Templates</h2>
                                {!readOnly && (
                                    <button
                                        onClick={() => setEmailModal({ kind: 'create' })}
                                        className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                                    >
                                        + New Template
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                                Reusable email templates for your organisation. Select one under Settings →
                                "Policy expiry email template" to drive the policy reminder reminder emails. Placeholders:{' '}
                                {EMAIL_PLACEHOLDERS.map((p) => (
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
                                                        onClick={() => setEmailModal({ kind: 'edit', template: t })}
                                                        title="Edit"
                                                        className="p-1.5 text-blue-650 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => setEmailModal({ kind: 'delete', template: t })}
                                                        title="Delete"
                                                        className="p-1.5 text-red-650 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {(emailModal.kind === 'create' || emailModal.kind === 'edit') && (
                                <EmailTemplateModal
                                    template={emailModal.kind === 'edit' ? emailModal.template : undefined}
                                    onClose={() => setEmailModal({ kind: 'closed' })}
                                    onSaved={() => { setEmailModal({ kind: 'closed' }); loadEmailTemplates(); }}
                                />
                            )}
                            {emailModal.kind === 'delete' && (
                                <EmailDeleteModal
                                    template={emailModal.template}
                                    onClose={() => setEmailModal({ kind: 'closed' })}
                                    onDeleted={() => { setEmailModal({ kind: 'closed' }); loadEmailTemplates(); }}
                                />
                            )}
                        </div>
                    )}
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
                    {loadingPolicy ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Policy Document Templates</h2>
                                {!readOnly && (
                                    <button
                                        onClick={() => setPolicyModal({ kind: 'create' })}
                                        className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                                    >
                                        + Create Template
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                                Upload a Word DOCX template with placeholders to format your exported policies. 
                                Injected placeholders include company logo, headers/footers, metadata, content, and signatures.
                            </p>

                            {policyTemplates.length === 0 ? (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                                    No policy templates yet.{!readOnly && ' Click "Create Template" to upload a DOCX.'}
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                                    {policyTemplates.map((t) => (
                                        <div key={t.id || 'standard'} className="flex items-start justify-between gap-4 px-5 py-4">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
                                                    {t.name}
                                                    {t.id === selectedTemplateId && (
                                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                            Default
                                                        </span>
                                                    )}
                                                </div>
                                                {t.description && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.description}</div>
                                                )}
                                                {!t.is_standard && (
                                                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                                                        <span><strong>File:</strong> <a href={t.file_path} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Download Original DOCX</a></span>
                                                    </div>
                                                )}
                                            </div>
                                            {!readOnly && (
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                                                    {t.id === selectedTemplateId ? (
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await SupabaseService.updateOrgSettings({ selected_template_id: null });
                                                                    await loadPolicyTemplates();
                                                                } catch (err) {
                                                                    console.error("Failed to remove default template", err);
                                                                }
                                                            }}
                                                            className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                                                        >
                                                            Remove Default
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await SupabaseService.updateOrgSettings({ selected_template_id: t.id || null });
                                                                    await loadPolicyTemplates();
                                                                } catch (err) {
                                                                    console.error("Failed to set default template", err);
                                                                }
                                                            }}
                                                            title="Set as Default"
                                                            className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                            <button
                                                                onClick={() => setPolicyModal({ kind: 'edit', template: t })}
                                                                title="Edit"
                                                                className="p-1.5 text-blue-650 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                </svg>
                                                            </button>
                                                            {!t.is_standard && (
                                                                <button
                                                                    onClick={() => setPolicyModal({ kind: 'delete', template: t })}
                                                                    title="Delete"
                                                                    className="p-1.5 text-red-650 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}


                            {policyModal.kind === 'create' && (
                                <PolicyTemplateUploadModal
                                    onClose={() => setPolicyModal({ kind: 'closed' })}
                                    onSaved={(newTemp) => {
                                        loadPolicyTemplates();
                                        setPolicyModal({ kind: 'edit', template: { ...newTemp, is_new: true } });
                                    }}
                                />
                            )}
                            {policyModal.kind === 'edit' && (
                                policyModal.template.is_standard ? (
                                    <StandardTemplateEditModal
                                        template={policyModal.template}
                                        onClose={() => setPolicyModal({ kind: 'closed' })}
                                        onSaved={() => { setPolicyModal({ kind: 'closed' }); loadPolicyTemplates(); }}
                                    />
                                ) : (
                                    <PolicyTemplateEditModal
                                        template={policyModal.template}
                                        onClose={async () => {
                                            if (policyModal.template.is_new) {
                                                try {
                                                    await SupabaseService.deletePolicyTemplate(policyModal.template.id);
                                                } catch (err) {
                                                    console.error("Failed to discard template", err);
                                                }
                                            }
                                            setPolicyModal({ kind: 'closed' });
                                            loadPolicyTemplates();
                                        }}
                                        onSaved={() => { setPolicyModal({ kind: 'closed' }); loadPolicyTemplates(); }}
                                    />
                                )
                            )}
                            {policyModal.kind === 'delete' && (
                                <PolicyTemplateDeleteModal
                                    template={policyModal.template}
                                    onClose={() => setPolicyModal({ kind: 'closed' })}
                                    onDeleted={() => { setPolicyModal({ kind: 'closed' }); loadPolicyTemplates(); }}
                                />
                            )}
                        </div>
                    )}
                </div>
        </div>
    );
};

// ─── Email Template modals ──────────────────────────────────────────────────
const EmailTemplateModal: React.FC<{
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
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">{template ? 'Edit Email Template' : 'New Email Template'}</h3>
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
                            {EMAIL_PLACEHOLDERS.map((p) => (
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

const EmailDeleteModal: React.FC<{
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


// ─── Policy Template modals ──────────────────────────────────────────────────
const PolicyTemplateUploadModal: React.FC<{
    onClose: () => void;
    onSaved: (template: any) => void;
}> = ({ onClose, onSaved }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creationMode, setCreationMode] = useState<'docx' | 'scratch'>('docx');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            setFile(selected);
        }
    };

    const handleUpload = async () => {
        if (!name.trim()) {
            setError('Template name is required.');
            return;
        }
        if (creationMode === 'docx' && !file) {
            setError('Please select a template file.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('name', name.trim());
            formData.append('description', description.trim());
            formData.append('header_text', '');
            formData.append('footer_text', '');
            if (creationMode === 'docx' && file) {
                formData.append('template', file);
            }

            const newTemp = await SupabaseService.createPolicyTemplate(formData);
            onSaved(newTemp);
        } catch (err: any) {
            setError(err?.message || 'Failed to create template');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Create Policy Template</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
                </div>
                <div className="px-6 py-5 overflow-y-auto space-y-4">
                    <div className="flex gap-4 p-1 bg-gray-150 dark:bg-gray-900 rounded-lg mb-4">
                        <button
                            type="button"
                            onClick={() => setCreationMode('docx')}
                            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                                creationMode === 'docx'
                                    ? 'bg-white dark:bg-gray-850 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            Upload Template File
                        </button>
                        <button
                            type="button"
                            onClick={() => setCreationMode('scratch')}
                            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                                creationMode === 'scratch'
                                    ? 'bg-white dark:bg-gray-850 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            Create from Scratch
                        </button>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Executive Corporate Layout"
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                        <input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Short description of the template purpose"
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    {/* Header and Footer texts removed */}
                    {creationMode === 'docx' ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template File</label>
                            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-700 border-dashed rounded-md bg-gray-50 dark:bg-gray-900">
                                <div className="space-y-1 text-center">
                                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-31-31m28 10V12a4 4 0 00-4-4h-8m12 14v-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <div className="flex text-sm text-gray-600 dark:text-gray-400 justify-center">
                                        <label className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 focus-within:outline-none">
                                            <span>Upload template file</span>
                                            <input type="file" accept=".docx,.md,.txt" className="sr-only" onChange={handleFileChange} />
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500">{file ? `Selected: ${file.name}` : 'Word (.docx), Markdown (.md), or Text (.txt) file'}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 rounded-md text-xs text-blue-800 dark:text-blue-300">
                            <strong>Note:</strong> Creating a template from scratch will set up a default layout with placeholders. You can edit formatting, custom CSS, tables, headers, and footer details in the template editor immediately after creation.
                        </div>
                    )}
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                </div>
                <div className="px-6 py-3 border-t dark:border-gray-700 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold font-semibold">Cancel</button>
                    <button onClick={handleUpload} disabled={saving} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 font-semibold shadow-sm transition-colors">
                        {saving ? 'Creating…' : 'Create Template'}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface VisualField {
    id: string;
    type: 'signature' | 'stamp' | 'fullname' | 'signdate' | 'email' | 'company' | 'jobtitle' | 'text' | 'logo';
    x: number; // percentage (0 to 100)
    y: number; // percentage (0 to 100)
    width: number;
    height: number;
    value?: string;
    mapping?: string;
    image_url?: string;
}

const DrawingPad: React.FC<{
    onSave: (base64: string) => void;
}> = ({ onSave }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = React.useState(false);
    const [penColor, setPenColor] = React.useState('#000000');
    const [penWidth, setPenWidth] = React.useState(2);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, []);

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth;
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
    };

    const startDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        ctx.beginPath();
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth;
        ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
        setIsDrawing(true);
    };

    const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleApply = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        onSave(dataUrl);
    };

    return (
        <div className="space-y-2 border border-gray-200 dark:border-gray-700 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/40">
            <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Draw Signature</span>
                <button type="button" onClick={clearCanvas} className="text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium">Clear</button>
            </div>
            <canvas
                ref={canvasRef}
                width={250}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawingTouch}
                onTouchMove={drawTouch}
                onTouchEnd={stopDrawing}
                className="border border-gray-300 dark:border-gray-600 rounded bg-white cursor-crosshair w-full h-[120px]"
            />
            <div className="flex items-center justify-between gap-2 text-xs pt-1">
                <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">Color:</span>
                    <button type="button" onClick={() => setPenColor('#000000')} className={`w-3.5 h-3.5 rounded-full bg-black border ${penColor === '#000000' ? 'ring-1 ring-blue-500' : ''}`} />
                    <button type="button" onClick={() => setPenColor('#1e3a8a')} className={`w-3.5 h-3.5 rounded-full bg-blue-900 border ${penColor === '#1e3a8a' ? 'ring-1 ring-blue-500' : ''}`} />
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-gray-500">Width:</span>
                    <input type="range" min={1} max={5} value={penWidth} onChange={(e) => setPenWidth(Number(e.target.value))} className="w-16 accent-blue-500" />
                </div>
            </div>
            <button
                type="button"
                onClick={handleApply}
                className="w-full mt-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
                Apply Signature
            </button>
        </div>
    );
};

const ImageUploader: React.FC<{
    label: string;
    onUploaded: (url: string) => void;
}> = ({ label, onUploaded }) => {
    const [uploading, setUploading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError(null);
        try {
            const res = await SupabaseService.uploadTemplateAsset({ file });
            onUploaded(res.publicUrl);
        } catch (err: any) {
            setError(err.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-1.5 border border-gray-200 dark:border-gray-700 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/40">
            <span className="block text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
            <label className="flex flex-col items-center justify-center border border-dashed border-gray-300 dark:border-gray-600 rounded-md p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="text-[10px] text-gray-500 text-center font-medium">Click to upload image</span>
                <input type="file" accept="image/*" className="sr-only" onChange={handleFileChange} disabled={uploading} />
            </label>
            {uploading && <p className="text-[10px] text-blue-500 animate-pulse">Uploading asset...</p>}
            {error && <p className="text-[10px] text-red-500">{error}</p>}
        </div>
    );
};

function convertHtmlToMarkdown(html: string) {
    if (!html) return '';
    let md = html;

    // Remove whitespace/newlines between tags to avoid unwanted gaps
    md = md.replace(/>\s+</g, '><');

    // Convert headings
    md = md.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
    md = md.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
    md = md.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
    md = md.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n\n');
    md = md.replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n\n');
    md = md.replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n\n');

    // Convert tables
    const tableRegex = /<table>(.*?)<\/table>/gi;
    md = md.replace(tableRegex, (match, tableContent) => {
        let rows: string[][] = [];
        const trRegex = /<tr>(.*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = trRegex.exec(tableContent)) !== null) {
            let cells: string[] = [];
            const tdRegex = /<(?:td|th)>(.*?)<\/(?:td|th)>/gi;
            let cellMatch;
            while ((cellMatch = tdRegex.exec(rowMatch[1])) !== null) {
                let cellText = cellMatch[1].replace(/<p>(.*?)<\/p>/gi, '$1 ');
                cellText = cellText.replace(/<[^>]+>/g, '').trim();
                cells.push(cellText);
            }
            rows.push(cells);
        }

        if (rows.length === 0) return '';
        let markdownTable = '';
        markdownTable += '| ' + rows[0].join(' | ') + ' |\n';
        markdownTable += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
        for (let i = 1; i < rows.length; i++) {
            markdownTable += '| ' + rows[i].join(' | ') + ' |\n';
        }
        return '\n' + markdownTable + '\n';
    });

    // Convert lists (ul)
    const ulRegex = /<ul>(.*?)<\/ul>/gi;
    md = md.replace(ulRegex, (match, listContent) => {
        let listMd = '';
        const liRegex = /<li>(.*?)<\/li>/gi;
        let liMatch;
        while ((liMatch = liRegex.exec(listContent)) !== null) {
            let itemText = liMatch[1].replace(/<p>(.*?)<\/p>/gi, '$1');
            itemText = itemText.replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
                               .replace(/<b>(.*?)<\/b>/gi, '**$1**')
                               .replace(/<em>(.*?)<\/em>/gi, '*$1*')
                               .replace(/<i>(.*?)<\/i>/gi, '*$1*');
            itemText = itemText.replace(/<[^>]+>/g, '').trim();
            listMd += `* ${itemText}\n`;
        }
        return '\n' + listMd + '\n';
    });

    // Convert lists (ol)
    const olRegex = /<ol>(.*?)<\/ol>/gi;
    md = md.replace(olRegex, (match, listContent) => {
        let listMd = '';
        const liRegex = /<li>(.*?)<\/li>/gi;
        let liMatch;
        let index = 1;
        while ((liMatch = liRegex.exec(listContent)) !== null) {
            let itemText = liMatch[1].replace(/<p>(.*?)<\/p>/gi, '$1');
            itemText = itemText.replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
                               .replace(/<b>(.*?)<\/b>/gi, '**$1**')
                               .replace(/<em>(.*?)<\/em>/gi, '*$1*')
                               .replace(/<i>(.*?)<\/i>/gi, '*$1*');
            itemText = itemText.replace(/<[^>]+>/g, '').trim();
            listMd += `${index}. ${itemText}\n`;
            index++;
        }
        return '\n' + listMd + '\n';
    });

    // Convert paragraphs
    md = md.replace(/<p>(.*?)<\/p>/gi, (match, pContent) => {
        return pContent + '\n\n';
    });

    // Convert inline styles
    md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');

    // Convert line breaks
    md = md.replace(/<br\s*\/?>/gi, '\n');

    // Strip remaining HTML tags
    md = md.replace(/<[^>]+>/g, '');

    // Decode basic HTML entities
    md = md.replace(/&amp;/g, '&')
           .replace(/&lt;/g, '<')
           .replace(/&gt;/g, '>')
           .replace(/&quot;/g, '"')
           .replace(/&#39;/g, "'")
           .replace(/&nbsp;/g, ' ');

    // Clean up excessive newlines
    md = md.replace(/\n{3,}/g, '\n\n');

    return md.trim();
}

const PolicyTemplateEditModal: React.FC<{
    template: any;
    onClose: () => void;
    onSaved: () => void;
}> = ({ template, onClose, onSaved }) => {
    const canvasRef = React.useRef<HTMLDivElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const [name, setName] = useState(template.name || '');
    const [description, setDescription] = useState(template.description || '');
    
    const [contentHtml, setContentHtml] = useState(() => {
        const raw = template.content_html || '';
        // If it looks like HTML, convert it to Markdown for the editor
        if (/<p>|<table|<h[1-6]/i.test(raw)) {
            return convertHtmlToMarkdown(raw);
        }
        return raw;
    });
    
    const [editorTab, setEditorTab] = useState<'visual' | 'source'>('visual');
    
    const [fields, setFields] = useState<VisualField[]>(() => {
        try {
            const parsed = template.placeholders || {};
            return Array.isArray(parsed.fields) ? parsed.fields : [];
        } catch {
            return [];
        }
    });
    
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [sigTab, setSigTab] = useState<'draw' | 'upload'>('draw');
    const zoom = 0.9; // Hardcoded to 90% by default as requested

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const insertTextAtCursor = (textToInsert: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentVal = textarea.value;

        const newVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
        setContentHtml(newVal);

        setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
        }, 0);
    };

    const wrapSelectionOrInsert = (prefix: string, suffix: string = prefix) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentVal = textarea.value;
        const selectedText = currentVal.substring(start, end);

        const replacement = selectedText ? (prefix + selectedText + suffix) : (prefix + "text" + suffix);
        const newVal = currentVal.substring(0, start) + replacement + currentVal.substring(end);
        setContentHtml(newVal);

        setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = start + prefix.length;
            textarea.selectionEnd = start + prefix.length + (selectedText ? selectedText.length : 4);
        }, 0);
    };

    const selectedField = fields.find(f => f.id === selectedFieldId);

    const addField = (type: VisualField['type']) => {
        const id = `field-${type}-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
        
        let width = 150;
        let height = 50;
        if (type === 'signature') { width = 160; height = 60; }
        else if (type === 'stamp') { width = 100; height = 100; }
        else if (type === 'text') { width = 200; height = 80; }
        
        const newField: VisualField = {
            id,
            type,
            x: 20,
            y: 15,
            width,
            height,
            value: '',
            mapping: type === 'fullname' ? 'policy_owner' : type === 'company' ? 'company_name' : type === 'signdate' ? 'current_date' : 'custom',
        };
        
        setFields(prev => [...prev, newField]);
        setSelectedFieldId(id);
    };

    const updateSelectedField = (updates: Partial<VisualField>) => {
        if (!selectedFieldId) return;
        setFields(prev => prev.map(f => f.id === selectedFieldId ? { ...f, ...updates } : f));
    };

    const handleSaveCanvasSignature = async (base64: string) => {
        try {
            const res = await SupabaseService.uploadTemplateAsset({
                base64,
                filename: `sig-${selectedFieldId}.png`
            });
            updateSelectedField({ image_url: res.publicUrl });
        } catch (err: any) {
            alert(err.message || 'Failed to save drawn signature');
        }
    };

    const startDrag = (e: React.MouseEvent, fieldId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedFieldId(fieldId);
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        const canvasRect = canvas.getBoundingClientRect();
        const field = fields.find(f => f.id === fieldId);
        if (!field) return;

        const fieldLeftPx = (field.x / 100) * canvasRect.width;
        const fieldTopPx = (field.y / 100) * canvasRect.height;
        
        const clickXOffset = e.clientX - canvasRect.left - fieldLeftPx;
        const clickYOffset = e.clientY - canvasRect.top - fieldTopPx;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const currentX = moveEvent.clientX - canvasRect.left - clickXOffset;
            const currentY = moveEvent.clientY - canvasRect.top - clickYOffset;

            const clampedX = Math.max(0, Math.min(canvasRect.width - field.width, currentX));
            const clampedY = Math.max(0, Math.min(canvasRect.height - field.height, currentY));

            const newXPercent = (clampedX / canvasRect.width) * 100;
            const newYPercent = (clampedY / canvasRect.height) * 100;

            setFields(prev => prev.map(f => f.id === fieldId ? { 
                ...f, 
                x: parseFloat(newXPercent.toFixed(2)), 
                y: parseFloat(newYPercent.toFixed(2)) 
            } : f));
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const startResize = (e: React.MouseEvent, fieldId: string) => {
        e.preventDefault();
        e.stopPropagation();
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        const canvasRect = canvas.getBoundingClientRect();
        const field = fields.find(f => f.id === fieldId);
        if (!field) return;

        const fieldLeftPx = (field.x / 100) * canvasRect.width;
        const fieldTopPx = (field.y / 100) * canvasRect.height;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const currentWidth = moveEvent.clientX - canvasRect.left - fieldLeftPx;
            const currentHeight = moveEvent.clientY - canvasRect.top - fieldTopPx;

            const newWidth = Math.max(40, Math.min(canvasRect.width - fieldLeftPx, currentWidth));
            const newHeight = Math.max(20, Math.min(canvasRect.height - fieldTopPx, currentHeight));

            setFields(prev => prev.map(f => f.id === fieldId ? { 
                ...f, 
                width: Math.round(newWidth), 
                height: Math.round(newHeight) 
            } : f));
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleSave = async () => {
        if (!name.trim()) { setError('Template name is required.'); return; }
        
        const finalPlaceholders = {
            fields: fields,
        };

        setSaving(true);
        setError(null);
        try {
            await SupabaseService.updatePolicyTemplate(template.id, {
                name: name.trim(),
                description: description.trim(),
                header_text: '',
                footer_text: '',
                content_html: contentHtml,
                placeholders: finalPlaceholders,
            });
            onSaved();
        } catch (e: any) {
            setError(e?.message || 'Failed to update template.');
        } finally {
            setSaving(false);
        }
    };

    const fieldTypes = [
        { type: 'signature', label: 'Signature Pad', icon: '' },
        { type: 'stamp', label: 'Stamp / Seal', icon: '' },
        { type: 'fullname', label: 'Full Name', icon: '' },
        { type: 'signdate', label: 'Sign Date', icon: '' },
        { type: 'email', label: 'Email', icon: '' },
        { type: 'company', label: 'Company', icon: '' },
        { type: 'text', label: 'Text Box', icon: '' },
        { type: 'logo', label: 'Logo', icon: '' },
    ];

    const parsedHtml = React.useMemo(() => {
        // If it looks like HTML (legacy fallback), use it directly
        if (contentHtml && /<p>|<table|<h[1-6]/i.test(contentHtml)) {
            return contentHtml;
        }
        return String(marked.parse(contentHtml || ''));
    }, [contentHtml]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div 
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full h-[92vh] flex flex-col transition-all duration-300 ${
                    editorTab === 'visual' ? 'max-w-7xl' : 'max-w-4xl'
                }`} 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Edit Policy Template — {name}</h3>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Customize the visual layout and print configurations.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
                </div>

                <div className="px-6 py-2 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 flex gap-4 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={() => setEditorTab('visual')}
                        className={`pb-1.5 border-b-2 transition-all flex items-center gap-1.5 ${
                            editorTab === 'visual'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}
                    >
                        Visual Layout Editor
                    </button>
                    <button
                        type="button"
                        onClick={() => setEditorTab('source')}
                        className={`pb-1.5 border-b-2 transition-all flex items-center gap-1.5 ${
                            editorTab === 'source'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}
                    >
                        Markdown Source
                    </button>
                </div>

                {editorTab === 'visual' ? (
                    <div className="flex-1 flex overflow-hidden min-h-0 bg-gray-50 dark:bg-gray-950">
                        <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-6 bg-gray-100 dark:bg-gray-900 border-r dark:border-gray-800">
                            <div className="relative">
                                <style dangerouslySetInnerHTML={{ __html: `
                                    .mammoth-preview {
                                        font-size: 13px;
                                        line-height: 1.6;
                                        color: #1f2937;
                                    }
                                    .mammoth-preview h1, .mammoth-preview h2, .mammoth-preview h3, .mammoth-preview h4 {
                                        color: #1e3a8a;
                                        font-weight: 700;
                                        margin-top: 1.2em;
                                        margin-bottom: 0.4em;
                                    }
                                    .mammoth-preview h1 { font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; }
                                    .mammoth-preview h2 { font-size: 15px; }
                                    .mammoth-preview h3 { font-size: 13px; }
                                    .mammoth-preview p { margin: 6px 0; }
                                    .mammoth-preview table { border-collapse: collapse; width: 100%; margin: 12px 0; }
                                    .mammoth-preview th, .mammoth-preview td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; }
                                    .mammoth-preview th { background: #f3f4f6; font-weight: 600; }
                                    .mammoth-preview blockquote { border-left: 4px solid #3b82f6; padding: 6px 12px; background: #f0f7ff; margin: 8px 0; font-style: italic; }
                                    .mammoth-preview ul, .mammoth-preview ol { padding-left: 18px; margin: 8px 0; }
                                    .mammoth-preview li { margin-bottom: 3px; }
                                `}} />
                                
                                <div
                                    ref={canvasRef}
                                    className="relative bg-white text-gray-900 border border-gray-200 shadow-xl select-none"
                                    style={{
                                        width: '794px',
                                        minHeight: '1123px',
                                        padding: '40px',
                                        boxSizing: 'border-box',
                                        zoom: zoom,
                                    }}
                                >
                                    {contentHtml ? (
                                        <div 
                                            dangerouslySetInnerHTML={{ __html: parsedHtml }} 
                                            className="mammoth-preview"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-32 text-gray-400">
                                            <svg className="w-16 h-16 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <p className="text-base font-semibold">No template layout content found</p>
                                            <p className="text-xs mt-1 max-w-xs text-center">Please enter template content or upload a new template DOCX.</p>
                                        </div>
                                    )}

                                    {fields.map((f) => {
                                        const isSelected = selectedFieldId === f.id;
                                        return (
                                            <div
                                                key={f.id}
                                                onMouseDown={(e) => startDrag(e, f.id)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedFieldId(f.id);
                                                }}
                                                className={`absolute select-none group flex flex-col justify-between border rounded p-1.5 bg-blue-50/95 dark:bg-slate-800/95 shadow-sm transition-all duration-100 ${
                                                    isSelected 
                                                        ? 'border-blue-500 ring-2 ring-blue-500/30 z-30 shadow-md' 
                                                        : 'border-gray-300 hover:border-blue-400 dark:border-gray-600 dark:hover:border-slate-500 z-20'
                                                }`}
                                                style={{
                                                    left: `${f.x}%`,
                                                    top: `${f.y}%`,
                                                    width: `${f.width}px`,
                                                    height: `${f.height}px`,
                                                    cursor: 'move',
                                                }}
                                            >
                                                <div className="flex items-center justify-between pointer-events-none text-[8px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                                    <span>{f.type}</span>
                                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-450 dark:text-gray-400">
                                                        {Math.round(f.x)}%,{Math.round(f.y)}%
                                                    </span>
                                                </div>
                                                
                                                <div className="flex-1 flex items-center justify-center text-[11px] overflow-hidden py-0.5 pointer-events-none text-gray-800 dark:text-gray-200">
                                                    {f.type === 'signature' && (
                                                        f.image_url ? (
                                                            <img src={f.image_url} alt="Signature" className="max-h-full max-w-full object-contain" />
                                                        ) : (
                                                            <span className="italic text-gray-400 font-serif">Sign Here</span>
                                                        )
                                                    )}
                                                    {f.type === 'stamp' && (
                                                        f.image_url ? (
                                                            <img src={f.image_url} alt="Stamp" className="max-h-full max-w-full object-contain" />
                                                        ) : (
                                                            <span className="border border-dashed border-gray-450 px-1 py-0.2 text-gray-400 uppercase font-semibold text-[8px]">Stamp</span>
                                                        )
                                                    )}
                                                    {f.type === 'logo' && (
                                                        f.image_url ? (
                                                            <img src={f.image_url} alt="Logo" className="max-h-full max-w-full object-contain" />
                                                        ) : (
                                                            <span className="border border-dashed border-gray-450 px-2 py-0.5 text-gray-400 uppercase font-semibold text-[9px]">Logo</span>
                                                        )
                                                    )}
                                                    {f.type !== 'signature' && f.type !== 'stamp' && f.type !== 'logo' && (
                                                        <span className="truncate">{f.value || f.mapping || f.type}</span>
                                                    )}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFields(prev => prev.filter(item => item.id !== f.id));
                                                        if (selectedFieldId === f.id) setSelectedFieldId(null);
                                                    }}
                                                    className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center bg-red-500 text-white rounded-full text-xs hover:bg-red-600 shadow z-40 transition-colors"
                                                    style={{ width: '18px', height: '18px', lineHeight: '18px' }}
                                                >
                                                    &times;
                                                </button>

                                                <div
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        startResize(e, f.id);
                                                    }}
                                                    className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500 hover:bg-blue-600 cursor-se-resize rounded-tl-sm shadow z-30"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="w-full max-w-[794px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm flex-shrink-0 mb-4">
                                <h4 className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-450 font-bold mb-3">Placeable Fields</h4>
                                <div className="flex flex-wrap gap-2">
                                    {fieldTypes.map((ft) => (
                                        <button
                                            key={ft.type}
                                            type="button"
                                            onClick={() => addField(ft.type as any)}
                                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-750 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 hover:border-blue-450 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                                        >
                                            {ft.icon && <span className="text-sm">{ft.icon}</span>}
                                            <span>{ft.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="w-80 border-l dark:border-gray-800 p-5 overflow-y-auto space-y-5 bg-white dark:bg-gray-800 flex-shrink-0 flex flex-col justify-between">
                            <div className="space-y-5">
                                <div>
                                    <h4 className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">Field Properties</h4>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">Configure values or dynamic mappings for the selected field.</p>
                                </div>

                                {selectedField ? (
                                    <div className="space-y-4">
                                        <div className="bg-gray-50 dark:bg-gray-900/40 border dark:border-gray-700 rounded-lg p-3 text-xs space-y-1.5">
                                            <div><span className="text-gray-400">Type:</span> <strong className="uppercase text-blue-500">{selectedField.type}</strong></div>
                                            <div><span className="text-gray-400">Position:</span> <strong>X: {Math.round(selectedField.x)}%, Y: {Math.round(selectedField.y)}%</strong></div>
                                            <div><span className="text-gray-400">Dimensions:</span> <strong>{selectedField.width}px × {selectedField.height}px</strong></div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Data Mapping</label>
                                            <select
                                                value={selectedField.mapping || 'custom'}
                                                onChange={(e) => updateSelectedField({ mapping: e.target.value })}
                                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-md dark:bg-gray-750 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            >
                                                {selectedField.type === 'fullname' && (
                                                    <>
                                                        <option value="policy_owner">Policy Owner</option>
                                                        <option value="current_user">Current Signer / User</option>
                                                        <option value="custom">Custom Value (Type below)</option>
                                                    </>
                                                )}
                                                {selectedField.type === 'email' && (
                                                    <>
                                                        <option value="current_user">Current Signer / User Email</option>
                                                        <option value="custom">Custom Value (Type below)</option>
                                                    </>
                                                )}
                                                {selectedField.type === 'company' && (
                                                    <>
                                                        <option value="company_name">Organisation Name</option>
                                                        <option value="custom">Custom Value (Type below)</option>
                                                    </>
                                                )}
                                                {selectedField.type === 'signdate' && (
                                                    <>
                                                        <option value="current_date">Current Date (Real-time)</option>
                                                        <option value="custom">Custom Value (Type below)</option>
                                                    </>
                                                )}
                                                {selectedField.type === 'jobtitle' && (
                                                    <>
                                                        <option value="current_role">Signer Job Role</option>
                                                        <option value="custom">Custom Value (Type below)</option>
                                                    </>
                                                )}
                                                {selectedField.type === 'text' && (
                                                    <option value="custom">Custom Value (Type below)</option>
                                                )}
                                                {selectedField.type === 'signature' && (
                                                    <>
                                                        <option value="custom">Template Specific Signature</option>
                                                        <option value="default_signature">Org Default Signature</option>
                                                    </>
                                                )}
                                                {selectedField.type === 'stamp' && (
                                                    <>
                                                        <option value="custom">Template Specific Stamp</option>
                                                        <option value="default_stamp">Org Default Stamp</option>
                                                    </>
                                                )}
                                                {selectedField.type === 'logo' && (
                                                    <>
                                                        <option value="default_logo">Org Default Logo</option>
                                                        <option value="custom">Template Specific Logo</option>
                                                    </>
                                                )}
                                            </select>
                                        </div>

                                        {selectedField.type !== 'signature' && selectedField.type !== 'stamp' && selectedField.type !== 'logo' && selectedField.mapping === 'custom' && (
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Custom Value</label>
                                                {selectedField.type === 'text' ? (
                                                    <textarea
                                                        value={selectedField.value || ''}
                                                        onChange={(e) => updateSelectedField({ value: e.target.value })}
                                                        rows={4}
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                        placeholder="Enter custom text..."
                                                    />
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={selectedField.value || ''}
                                                        onChange={(e) => updateSelectedField({ value: e.target.value })}
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                        placeholder="Enter value..."
                                                    />
                                                )}
                                            </div>
                                        )}

                                        {selectedField.type === 'signature' && selectedField.mapping === 'custom' && (
                                            <div className="space-y-4">
                                                <div className="flex border-b border-gray-200 dark:border-gray-700 text-xs">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSigTab('draw')}
                                                        className={`flex-1 pb-1.5 font-medium border-b-2 text-center transition-colors ${sigTab === 'draw' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-500'}`}
                                                    >
                                                        Draw
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSigTab('upload')}
                                                        className={`flex-1 pb-1.5 font-medium border-b-2 text-center transition-colors ${sigTab === 'upload' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-500'}`}
                                                    >
                                                        Upload
                                                    </button>
                                                </div>
                                                {sigTab === 'draw' ? (
                                                    <DrawingPad
                                                        onSave={(base64) => handleSaveCanvasSignature(base64)}
                                                    />
                                                ) : (
                                                    <ImageUploader
                                                        label="Upload Signature File"
                                                        onUploaded={(url) => updateSelectedField({ image_url: url })}
                                                    />
                                                )}
                                            </div>
                                        )}

                                        {selectedField.type === 'stamp' && selectedField.mapping === 'custom' && (
                                            <ImageUploader
                                                label="Upload Stamp File"
                                                onUploaded={(url) => updateSelectedField({ image_url: url })}
                                            />
                                        )}

                                        {selectedField.type === 'logo' && selectedField.mapping === 'custom' && (
                                            <ImageUploader
                                                label="Upload Logo File"
                                                onUploaded={(url) => updateSelectedField({ image_url: url })}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/10">
                                        Select any field on the document layout to configure properties.
                                    </div>
                                )}
                            </div>

                            {selectedField && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFields(prev => prev.filter(item => item.id !== selectedFieldId));
                                        setSelectedFieldId(null);
                                    }}
                                    className="w-full py-1.5 border border-red-200 dark:border-red-900 text-red-650 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md text-xs font-semibold transition-colors"
                                >
                                    Delete Selected Field
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="px-6 py-5 overflow-y-auto space-y-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 flex-1">
                        <div className="md:col-span-1 space-y-4">
                            <div>
                                <h4 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-3">Settings</h4>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template name</label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none"
                                />
                            </div>
                            {/* Header and Footer texts removed */}
                        </div>

                        <div className="md:col-span-2 space-y-4 flex flex-col h-full">
                            <div>
                                <h4 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Template Markdown & Text Content</h4>
                                <p className="text-[10px] text-gray-400 mb-2">Edit template layout directly in Markdown or plain text format. Placeholders will be replaced during PDF generation.</p>
                            </div>
                            <div className="flex-1 flex flex-col min-h-[16rem]">
                                <div className="flex flex-wrap gap-2 items-center pb-2 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 rounded-t-md p-1.5 border border-gray-300 dark:border-gray-600 border-b-0">
                                    <button
                                        type="button"
                                        onClick={() => wrapSelectionOrInsert('**')}
                                        className="p-1 px-2 text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-705 dark:text-gray-200"
                                        title="Bold"
                                    >
                                        B
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => wrapSelectionOrInsert('*')}
                                        className="p-1 px-2 text-xs italic hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-705 dark:text-gray-200"
                                        title="Italic"
                                    >
                                        I
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => wrapSelectionOrInsert('# ', '')}
                                        className="p-1 px-2 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-705 dark:text-gray-200"
                                        title="H1"
                                    >
                                        H1
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => wrapSelectionOrInsert('## ', '')}
                                        className="p-1 px-2 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-705 dark:text-gray-200"
                                        title="H2"
                                    >
                                        H2
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => wrapSelectionOrInsert('### ', '')}
                                        className="p-1 px-2 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-705 dark:text-gray-200"
                                        title="H3"
                                    >
                                        H3
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => insertTextAtCursor('\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n')}
                                        className="p-1 px-2 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-705 dark:text-gray-200"
                                        title="Table"
                                    >
                                        Table
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => wrapSelectionOrInsert('* ', '')}
                                        className="p-1 px-2 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-705 dark:text-gray-200"
                                        title="Bullet List"
                                    >
                                        List
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => insertTextAtCursor('<br />')}
                                        className="p-1 px-2 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-705 dark:text-gray-200"
                                        title="Line Break"
                                    >
                                        Line Break
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => insertTextAtCursor('\n---\n')}
                                        className="p-1 px-2 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-705 dark:text-gray-200"
                                        title="Horizontal Rule"
                                    >
                                        Divider
                                    </button>

                                    <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

                                    <select
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                insertTextAtCursor(e.target.value);
                                                e.target.value = '';
                                            }
                                        }}
                                        className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white focus:outline-none"
                                    >
                                        <option value="">Insert Placeholder...</option>
                                        {STANDARD_PLACEHOLDERS.map((p) => (
                                            <option key={p.code} value={p.code}>
                                                {p.code} ({p.desc})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <textarea
                                    ref={textareaRef}
                                    value={contentHtml}
                                    onChange={(e) => setContentHtml(e.target.value)}
                                    className="w-full flex-1 p-3 text-xs border border-gray-300 dark:border-gray-600 rounded-b-md border-t-0 dark:bg-gray-700 dark:text-white focus:outline-none font-mono resize-none overflow-y-auto"
                                    placeholder={"# {{policy_title}}\n\n{{policy_content}}"}
                                />
                            </div>

                            <div>
                                <h4 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Available Placeholders</h4>
                                <div className="grid grid-cols-2 gap-1 text-[11px] max-h-24 overflow-y-auto border border-gray-100 dark:border-gray-700 p-2 rounded bg-gray-50/50 dark:bg-gray-900/10">
                                    {STANDARD_PLACEHOLDERS.map((p) => (
                                        <div key={p.code} className="flex justify-between gap-2">
                                            <code className="text-blue-600 dark:text-blue-400 font-semibold">{p.code}</code>
                                            <span className="text-gray-400">{p.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {error && <p className="px-6 py-2 text-sm text-red-650 dark:text-red-400 bg-red-50 dark:bg-red-950/20">{error}</p>}

                <div className="px-6 py-3.5 border-t dark:border-gray-700 flex justify-end gap-2 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold">Cancel</button>
                    <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 font-semibold shadow-sm transition-colors">
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const PolicyTemplateDeleteModal: React.FC<{
    template: any;
    onClose: () => void;
    onDeleted: () => void;
}> = ({ template, onClose, onDeleted }) => {
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async () => {
        setDeleting(true);
        setError(null);
        try {
            await SupabaseService.deletePolicyTemplate(template.id);
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
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Delete policy template?</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Delete policy template <span className="font-semibold">{template.name}</span>? 
                        Any settings referencing this template will automatically fallback to the system default layout.
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

const StandardTemplateEditModal: React.FC<{
    template: any;
    onClose: () => void;
    onSaved: () => void;
}> = ({ template, onClose, onSaved }) => {
    const [signatureUrl, setSignatureUrl] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [includeLogo, setIncludeLogo] = useState(false);
    const [includeSignature, setIncludeSignature] = useState(true);
    
    const [uploading, setUploading] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sigTab, setSigTab] = useState<'draw' | 'upload'>('draw');

    useEffect(() => {
        SupabaseService.getOrgSettings().then(settings => {
            setSignatureUrl(settings.signature_url || '');
            setLogoUrl((settings as any).logo_url || '');
        }).catch(() => {});
        
        if (template && template.placeholders) {
            setIncludeLogo(!!template.placeholders.include_logo);
            setIncludeSignature(template.placeholders.include_signature !== false);
        }
    }, [template]);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingLogo(true);
        setError(null);
        try {
            const res = await SupabaseService.uploadLogo(file);
            setLogoUrl(res.logo_url);
        } catch (err: any) {
            setError(err.message || 'Failed to upload logo.');
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleRemoveLogo = async () => {
        if (!confirm('Are you sure you want to remove the logo?')) return;
        setSaving(true);
        setError(null);
        try {
            await SupabaseService.updateOrgSettings({ logo_url: null } as any);
            setLogoUrl('');
        } catch (err: any) {
            setError(err.message || 'Failed to remove logo.');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveCanvasSignature = async (base64: string) => {
        setSaving(true);
        try {
            const res = await fetch(base64);
            const blob = await res.blob();
            const file = new File([blob], 'signature.png', { type: 'image/png' });
            
            const uploadRes = await SupabaseService.uploadSignature(file);
            setSignatureUrl(uploadRes.signature_url);
        } catch (err: any) {
            setError(err.message || 'Failed to save signature');
        } finally {
            setSaving(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const res = await SupabaseService.uploadSignature(file);
            setSignatureUrl(res.signature_url);
        } catch (err: any) {
            setError(err.message || 'Failed to upload signature');
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveSignature = async () => {
        if (!confirm('Are you sure you want to remove the signature?')) return;
        setSaving(true);
        try {
            await SupabaseService.updateOrgSettings({ signature_url: null } as any);
            setSignatureUrl('');
        } catch (err: any) {
            setError(err.message || 'Failed to remove signature');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        setError(null);
        try {
            await SupabaseService.updatePolicyTemplate('standard', {
                placeholders: {
                    ...template?.placeholders,
                    include_logo: includeLogo,
                    include_signature: includeSignature
                }
            });
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Edit Standard Template Configuration</h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Layout, headers, footers, formatting, and structure are locked.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-255 text-xl leading-none">&times;</button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {error && (
                        <div className="p-3 text-xs bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-md">
                            {error}
                        </div>
                    )}

                    {/* Logo Section */}
                    <div className="space-y-3 pb-6 border-b dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <span className="block text-sm font-semibold text-gray-750 dark:text-gray-200">Organization Logo</span>
                            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={includeLogo}
                                    onChange={(e) => setIncludeLogo(e.target.checked)}
                                    className="rounded border-gray-300 dark:border-gray-600 text-blue-650 focus:ring-blue-500 h-4 w-4"
                                />
                                Include Logo
                            </label>
                        </div>
                        {logoUrl ? (
                            <div className="relative border dark:border-gray-700 rounded-lg p-4 bg-gray-50/50 dark:bg-gray-900/10 flex flex-col items-center justify-center min-h-[140px]">
                                <img src={logoUrl} alt="Logo" className="max-h-24 object-contain" />
                                <button
                                    type="button"
                                    onClick={handleRemoveLogo}
                                    disabled={saving}
                                    className="mt-3 px-3 py-1 text-xs font-semibold text-red-650 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-md transition-colors shadow-sm"
                                >
                                    {saving ? 'Removing...' : 'Remove Logo'}
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-900/10">
                                <svg className="mx-auto h-8 w-8 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 flex items-center justify-center gap-1.5">
                                    <label className="relative cursor-pointer rounded-md font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                                        <span>{uploadingLogo ? 'Uploading...' : 'Choose a file'}</span>
                                        <input type="file" accept="image/*" className="sr-only" onChange={handleLogoUpload} disabled={uploadingLogo} />
                                    </label>
                                    <span>to upload logo</span>
                                </div>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">PNG, JPG, GIF up to 5MB</p>
                            </div>
                        )}
                    </div>
                    
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="block text-sm font-semibold text-gray-750 dark:text-gray-200">Authorized Signature</span>
                            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={includeSignature}
                                    onChange={(e) => setIncludeSignature(e.target.checked)}
                                    className="rounded border-gray-300 dark:border-gray-600 text-blue-650 focus:ring-blue-500 h-4 w-4"
                                />
                                Include Signature
                            </label>
                        </div>
                        {signatureUrl ? (
                            <div className="relative border dark:border-gray-700 rounded-lg p-4 bg-gray-50/50 dark:bg-gray-900/10 flex flex-col items-center justify-center min-h-[140px]">
                                <img src={signatureUrl} alt="Signature" className="max-h-24 object-contain" />
                                <button
                                    onClick={handleRemoveSignature}
                                    disabled={saving}
                                    className="mt-3 px-3 py-1 text-xs font-semibold text-red-650 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-md transition-colors shadow-sm"
                                >
                                    {saving ? 'Removing...' : 'Remove Signature'}
                                </button>
                            </div>
                        ) : (
                            <div className="border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
                                <div className="flex border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                                    <button
                                        type="button"
                                        onClick={() => setSigTab('draw')}
                                        className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-all ${sigTab === 'draw' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    >
                                        Draw Signature
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSigTab('upload')}
                                        className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-all ${sigTab === 'upload' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    >
                                        Upload Image File
                                    </button>
                                </div>
                                <div className="p-4">
                                    {sigTab === 'draw' ? (
                                        <DrawingPad onSave={handleSaveCanvasSignature} />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-900/10">
                                            <svg className="mx-auto h-8 w-8 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                            <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 flex items-center justify-center gap-1.5">
                                                <label className="relative cursor-pointer rounded-md font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                                                    <span>{uploading ? 'Uploading...' : 'Choose a file'}</span>
                                                    <input type="file" accept="image/*" className="sr-only" onChange={handleFileUpload} disabled={uploading} />
                                                </label>
                                                <span>to upload signature</span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">PNG, JPG, GIF up to 5MB</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end px-6 py-4 bg-gray-50 dark:bg-gray-900/30 border-t dark:border-gray-700 gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold text-gray-750 dark:text-gray-200 border dark:border-gray-650 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveSettings}
                        disabled={saving}
                        className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:bg-gray-300 transition-colors shadow-sm"
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};
