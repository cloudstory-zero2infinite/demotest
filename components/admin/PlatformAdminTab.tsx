import React, { useState, useCallback, FormEvent, useMemo, useRef, useEffect } from 'react';
import * as SupabaseService from '../../services/supabase';
import { OrgContact, ZtiHubDevice } from '../../types';
import { useTableSelection } from '../../hooks/useTableSelection';
import { SelectionActionBar } from '../common/SelectionActionBar';
import { useDataRefresh } from '../../hooks/useDataRefresh';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, DownloadIcon, UploadIcon, BotIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { AIChatModal } from '../common/AIChatModal';
import { parseCSVLine } from '../../utils/csvParser';

// ─── Status badge ────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ member: any }> = ({ member }) => {
    if (member.status === 'pending_approval') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                Pending Approval
            </span>
        );
    }
    if (!member.user_id) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                Pending Signup
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Active
        </span>
    );
};

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
    const map: Record<string, string> = {
        tenant_admin: 'Tenant Admin',
        admin: 'Admin',
        user: 'User',
        cxo: 'CXO',
    };
    return <span className="text-sm text-gray-600 dark:text-gray-400">{map[role] ?? role}</span>;
};

// ─── Main component ───────────────────────────────────────────────────────────

export const PlatformAdminTab: React.FC<{ isActive?: boolean; readOnly?: boolean }> = ({ isActive = true, readOnly = false }) => {
    const [orgName, setOrgName] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [membersLoading, setMembersLoading] = useState(true);

    // Add members form
    const [emailDescriptionPairs, setEmailDescriptionPairs] = useState<Array<{ email: string; description: string; role: string }>>([
        { email: '', description: '', role: 'user' },
    ]);
    const [addLoading, setAddLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [lastAddedUsers, setLastAddedUsers] = useState<Array<{ email: string; role: string }>>([]);
    const [isInviting, setIsInviting] = useState(false);
    const [inviteSent, setInviteSent] = useState(false);

    // Per-row action loading
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

    // Contact
    const [contacts, setContacts] = useState<OrgContact[]>([]);
    const [contactModal, setContactModal] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | null; contact?: OrgContact }>({ type: null });
    const [contactForm, setContactForm] = useState({ name: '', email: '', department: '' });
    const [contactSaving, setContactSaving] = useState(false);
    const [contactError, setContactError] = useState<string | null>(null);
    const [showContactAI, setShowContactAI] = useState(false);
    const contactFileRef = useRef<HTMLInputElement>(null);

    // ZTI Hub devices
    const [hubDevices, setHubDevices] = useState<ZtiHubDevice[]>([]);
    const [hubLoading, setHubLoading] = useState(true);
    const [hubRevoking, setHubRevoking] = useState<string | null>(null);
    const [hubConfirmRevoke, setHubConfirmRevoke] = useState<string | null>(null);

    const loadHubDevices = useCallback(async () => {
        setHubLoading(true);
        try {
            setHubDevices(await SupabaseService.getHubDevices());
        } catch {
            setHubDevices([]);
        } finally {
            setHubLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isActive || readOnly) return;
        loadHubDevices();
    }, [isActive, readOnly, loadHubDevices]);

    const handleRevokeHubDevice = async (id: string) => {
        setHubRevoking(id);
        try {
            await SupabaseService.revokeHubDevice(id);
            setHubConfirmRevoke(null);
            await loadHubDevices();
        } catch (err: any) {
            alert(err.message || 'Failed to remove device.');
        } finally {
            setHubRevoking(null);
        }
    };

    const {
        selectedIds, isConfirmingDelete, isSaving,
        setIsConfirmingDelete, setIsSaving,
        toggle, toggleAll, clearAll,
    } = useTableSelection<any>();

    const loadMembers = useCallback(async () => {
        const data = await SupabaseService.getOrganizationUsers();
        setMembers(data);
        return data;
    }, []);

    const { data: membersData, loading: membersLoadingState, refresh } = useDataRefresh(loadMembers, [], isActive);

    // Sync local state with hook state
    useMemo(() => {
        if (membersData) setMembers(membersData);
    }, [membersData]);

    useMemo(() => {
        setMembersLoading(membersLoadingState);
    }, [membersLoadingState]);

    useMemo(() => {
        if (!isActive) return;
        const init = async () => {
            const me = await SupabaseService.getOrgMe();
            setOrgName(me?.orgName ?? null);
            setCurrentUserId(me?.userId ?? null);
        };
        init();
    }, [isActive]);

    // ── Approve ────────────────────────────────────────────────────────────────
    const handleApprove = async (id: number) => {
        setActionLoading(id);
        try {
            await SupabaseService.approveMember(id);
            await refresh();
        } catch (err: any) {
            alert(err.message || 'Failed to approve.');
        } finally {
            setActionLoading(null);
        }
    };

    // ── Reject / Remove ───────────────────────────────────────────────────────
    const handleRemove = async (id: number, isPendingApproval: boolean) => {
        setActionLoading(id);
        try {
            if (isPendingApproval) {
                await SupabaseService.rejectMember(id);
            } else {
                await SupabaseService.removeMember(id);
            }
            setConfirmRemove(null);
            await refresh();
        } catch (err: any) {
            alert(err.message || 'Failed to remove member.');
        } finally {
            setActionLoading(null);
        }
    };

    // ── Update Role ───────────────────────────────────────────────────────────
    const handleUpdateRole = async (id: number, role: string) => {
        setActionLoading(id);
        try {
            await SupabaseService.updateMemberRole(id, role);
            await refresh();
        } catch (err: any) {
            alert(err.message || 'Failed to update role.');
        } finally {
            setActionLoading(null);
        }
    };

    // ── Add members form ───────────────────────────────────────────────────────
    const handlePairChange = (index: number, field: 'email' | 'description' | 'role', value: string) => {
        setEmailDescriptionPairs(prev => {
            const updated = [...prev];
            updated[index][field] = value;
            return updated;
        });
    };

    const handleInviteUsers = async (e: FormEvent) => {
        e.preventDefault();
        setAddLoading(true);
        setSuccessMessage('');
        setErrorMessage('');

        try {
            const me = await SupabaseService.getOrgMe();
            const orgId = me?.orgId;
            if (!orgId) throw new Error('No organisation found for current user.');

            const validPairs = emailDescriptionPairs.filter(p => p.email.trim().length > 0);
            if (validPairs.length === 0) throw new Error('Please enter at least one email address.');

            // 1. Send Invitations First
            const results = await Promise.all(validPairs.map(async (pair) => {
                await SupabaseService.inviteMember(pair.email);
                return { email: pair.email, role: pair.role, description: pair.description };
            }));

            setLastAddedUsers(results); 
            setInviteSent(true);
            setShowSuccessModal(true);
            setSuccessMessage(`Invitations sent to ${results.length} user(s). Now add them to the organization.`);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Failed to send invitations.');
        } finally {
            setAddLoading(false);
        }
    };

    const handleAddInvitedMembers = async () => {
        setIsInviting(true);
        try {
            const me = await SupabaseService.getOrgMe();
            const orgId = me?.orgId;
            if (!orgId) throw new Error('No organisation found.');

            await Promise.all(lastAddedUsers.map(user => 
                SupabaseService.onboardUserToOrganization(orgId, user.email, user.role, user.description)
            ));
            
            setSuccessMessage(`Successfully added ${lastAddedUsers.length} member(s) to the organization.`);
            setTimeout(() => {
                setShowSuccessModal(false);
                refresh();
                setEmailDescriptionPairs([{ email: '', description: '', role: 'user' }]);
            }, 2000);
        } catch (err: any) {
            alert(err.message || 'Failed to add members to organization.');
        } finally {
            setIsInviting(false);
        }
    };

    // ── Contacts ───────────────────────────────────────────────────────────────
    const loadContacts = useCallback(async () => {
        const data = await SupabaseService.getOrgContacts();
        setContacts(data);
        return data;
    }, []);

    const { refresh: refreshContacts } = useDataRefresh(loadContacts, [], isActive);

    const openContactModal = (type: 'add' | 'edit' | 'view' | 'delete', contact?: OrgContact) => {
        setContactError(null);
        if (type === 'add') {
            setContactForm({ name: '', email: '', department: '' });
        } else if (type === 'edit' && contact) {
            setContactForm({ name: contact.name, email: contact.email, department: contact.department });
        }
        setContactModal({ type, contact });
    };

    const closeContactModal = () => setContactModal({ type: null });

    const handleSaveContact = async (e: FormEvent) => {
        e.preventDefault();
        if (!contactForm.name.trim() || !contactForm.email.trim()) return;
        setContactSaving(true);
        setContactError(null);
        try {
            if (contactModal.type === 'add') {
                await SupabaseService.addOrgContact(contactForm);
            } else if (contactModal.type === 'edit' && contactModal.contact) {
                await SupabaseService.updateOrgContact(contactModal.contact.id, contactForm);
            }
            closeContactModal();
            await refreshContacts();
        } catch (err: any) {
            setContactError(err.message || 'Failed to save contact');
        } finally {
            setContactSaving(false);
        }
    };

    const handleDeleteContact = async () => {
        if (!contactModal.contact) return;
        setContactSaving(true);
        setContactError(null);
        try {
            await SupabaseService.deleteOrgContact(contactModal.contact.id);
            closeContactModal();
            await refreshContacts();
        } catch (err: any) {
            setContactError(err.message || 'Failed to delete contact');
        } finally {
            setContactSaving(false);
        }
    };

    const handleImportContactsCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { alert('CSV must have a header row and at least one data row.'); return; }

        const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
        const nameIdx = header.indexOf('name');
        const emailIdx = header.indexOf('email');
        const deptIdx = header.indexOf('department');

        if (nameIdx === -1 || emailIdx === -1) { alert('CSV must have "Name" and "Email" columns.'); return; }

        let added = 0;
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            const name = cols[nameIdx]?.trim();
            const email = cols[emailIdx]?.trim();
            const department = deptIdx !== -1 ? (cols[deptIdx]?.trim() || '') : '';
            if (!name || !email) continue;
            try {
                await SupabaseService.addOrgContact({ name, email, department });
                added++;
            } catch { /* skip duplicates / errors */ }
        }
        alert(`Imported ${added} contact(s).`);
        await refreshContacts();
        if (contactFileRef.current) contactFileRef.current.value = '';
    };

    const handleExportContacts = () => {
        if (contacts.length === 0) return;
        const header = 'Name,Email,Department';
        const rows = contacts.map(c => `"${c.name}","${c.email}","${c.department}"`);
        const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'org_contacts.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const pendingApprovalCount = members.filter(m => m.status === 'pending_approval').length;

    const handleBulkApprove = async () => {
        const selectedPending = members.filter(m => selectedIds.has(m.id) && m.status === 'pending_approval');
        if (selectedPending.length === 0) return;
        setIsSaving(true);
        try {
            await Promise.all(selectedPending.map(m => SupabaseService.approveMember(m.id)));
            await refresh();
            clearAll();
        } catch (err: any) {
            alert(err.message || 'Failed to approve members.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleBulkRemove = async () => {
        const removable = members.filter(m => selectedIds.has(m.id) && m.user_id !== currentUserId && m.role !== 'tenant_admin' && m.role !== 'cxo');
        if (removable.length === 0) return;
        setIsSaving(true);
        try {
            await Promise.all(removable.map(m =>
                m.status === 'pending_approval'
                    ? SupabaseService.rejectMember(m.id)
                    : SupabaseService.removeMember(m.id)
            ));
            await refresh();
            clearAll();
        } catch (err: any) {
            alert(err.message || 'Failed to remove members.');
        } finally {
            setIsSaving(false);
            setIsConfirmingDelete(false);
        }
    };

    const selectedPendingCount = members.filter(m => selectedIds.has(m.id) && m.status === 'pending_approval').length;
    const selectedRemovableCount = members.filter(m => selectedIds.has(m.id) && m.user_id !== currentUserId && m.role !== 'tenant_admin' && m.role !== 'cxo').length;
    const allMemberIds = members.map(m => m.id);

    return (
        <div className="space-y-8">

            {/* Org name banner */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-6 py-4 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300">Your Organisation</h3>
                    <p className="text-lg font-bold text-blue-800 dark:text-blue-200 mt-0.5">
                        {orgName ?? 'Loading…'}
                    </p>
                </div>
                {pendingApprovalCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-sm font-medium">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block" />
                        {pendingApprovalCount} pending approval
                    </span>
                )}
            </div>

            {/* ── Members table ── */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                        Organisation Members
                        <span className="ml-2 text-sm font-normal text-gray-400">({members.length})</span>
                    </h2>
                    <button
                        onClick={refresh}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline"
                    >
                        Refresh
                    </button>
                </div>

                {membersLoading ? (
                    <div className="px-6 py-10 text-center text-gray-400 text-sm">Loading members…</div>
                ) : members.length === 0 ? (
                    <div className="px-6 py-10 text-center text-gray-400 text-sm">No members yet.</div>
                ) : (
                    <div className="overflow-auto max-h-[calc(100vh-280px)]">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    {!readOnly && (
                                        <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 w-10">
                                            <input
                                                type="checkbox"
                                                checked={allMemberIds.length > 0 && selectedIds.size === allMemberIds.length}
                                                onChange={() => toggleAll(allMemberIds)}
                                                className="rounded border-gray-300 dark:border-gray-600"
                                            />
                                        </th>
                                    )}
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Email</th>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Role</th>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Status</th>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Added</th>
                                    {!readOnly && (
                                        <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Actions</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                {members.map(member => {
                                    const isSelf = member.user_id === currentUserId;
                                    const isTenantAdmin = member.role === 'tenant_admin' || member.role === 'cxo';
                                    const isPendingApproval = member.status === 'pending_approval';
                                    const isLoading = actionLoading === member.id;
                                    const isConfirming = confirmRemove === member.id;
                                    const isSelected = selectedIds.has(member.id);

                                    return (
                                        <tr key={member.id} className={`${isPendingApproval ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''} ${isSelected ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                                            {!readOnly && (
                                                <td className="px-4 py-4 w-10" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggle(member.id)}
                                                        className="rounded border-gray-300 dark:border-gray-600"
                                                    />
                                                </td>
                                            )}
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                                {member.email}
                                                {isSelf && <span className="ml-2 text-xs text-blue-500">(you)</span>}
                                                {member.description && (
                                                    <p className="text-xs text-gray-400 mt-0.5">{member.description}</p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {!readOnly && !isSelf && member.role !== 'tenant_admin' ? (
                                                    <select
                                                        value={member.role}
                                                        onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                                                        disabled={isLoading}
                                                        className="text-xs rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                                                    >
                                                        <option value="user">User</option>
                                                        <option value="admin">Admin</option>
                                                        <option value="cxo">CXO</option>
                                                    </select>
                                                ) : (
                                                    <RoleBadge role={member.role} />
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <StatusBadge member={member} />
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                                {member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'}
                                            </td>
                                            {!readOnly && (
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {/* Approve button — only for pending_approval */}
                                                        {isPendingApproval && (
                                                            <button
                                                                onClick={() => handleApprove(member.id)}
                                                                disabled={isLoading}
                                                                className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-md transition-colors"
                                                            >
                                                                {isLoading ? '…' : 'Approve'}
                                                            </button>
                                                        )}

                                                        {/* Remove / Reject — not for self or tenant_admin */}
                                                        {!isSelf && !isTenantAdmin && (
                                                            <>
                                                                {isConfirming ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Sure?</span>
                                                                        <button
                                                                            onClick={() => handleRemove(member.id, isPendingApproval)}
                                                                            disabled={isLoading}
                                                                            className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded transition-colors"
                                                                        >
                                                                            {isLoading ? '…' : 'Yes, remove'}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setConfirmRemove(null)}
                                                                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setConfirmRemove(member.id)}
                                                                        className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 rounded-md transition-colors"
                                                                    >
                                                                        {isPendingApproval ? 'Reject' : 'Remove'}
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Placeholder for self / tenant_admin rows */}
                                                        {(isSelf || isTenantAdmin) && !isPendingApproval && (
                                                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Data preservation notice */}
                <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        {readOnly
                            ? 'You have view-only access to member management. Contact your admin to make changes.'
                            : 'Removing a member revokes their access. All data they added to this workspace is preserved.'}
                    </p>
                </div>
            </div>

            {!readOnly && <SelectionActionBar
                selectedCount={selectedIds.size}
                isEditing={false}
                isConfirmingDelete={isConfirmingDelete}
                isSaving={isSaving}
                showEdit={false}
                showDelete={selectedRemovableCount > 0}
                extraActions={selectedPendingCount > 0 ? (
                    <button
                        onClick={handleBulkApprove}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 rounded-full text-sm font-medium transition-colors"
                    >
                        Approve {selectedPendingCount}
                    </button>
                ) : undefined}
                onEdit={() => {}}
                onSaveAll={() => {}}
                onCancelEdit={clearAll}
                onDelete={() => setIsConfirmingDelete(true)}
                onConfirmDelete={handleBulkRemove}
                onCancelDelete={() => setIsConfirmingDelete(false)}
                onClear={clearAll}
            />}

            {/* ── Add Members form ── */}
            {!readOnly && (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">Add Members</h2>

                {successMessage && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                        {successMessage}
                    </div>
                )}
                {errorMessage && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 whitespace-pre-wrap">
                        {errorMessage}
                    </div>
                )}

                <form onSubmit={handleInviteUsers} className="space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Email addresses <span className="text-red-500">*</span>
                        </label>
                        <button
                            type="button"
                            onClick={() => setEmailDescriptionPairs(prev => [...prev, { email: '', description: '', role: 'user' }])}
                            className="text-xs px-2 py-1 text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
                        >
                            + Add row
                        </button>
                    </div>

                    <div className="space-y-3">
                        {emailDescriptionPairs.map((pair, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Email *</label>
                                    <input
                                        type="email"
                                        value={pair.email}
                                        onChange={e => handlePairChange(index, 'email', e.target.value)}
                                        placeholder="user@example.com"
                                        className="block w-full rounded-md border-gray-300 shadow-sm text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Description (optional)</label>
                                    <input
                                        type="text"
                                        value={pair.description}
                                        onChange={e => handlePairChange(index, 'description', e.target.value)}
                                        placeholder="e.g. Security Lead"
                                        className="block w-full rounded-md border-gray-300 shadow-sm text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Role *</label>
                                    <select
                                        value={pair.role}
                                        onChange={e => handlePairChange(index, 'role', e.target.value)}
                                        className="block w-full rounded-md border-gray-300 shadow-sm text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="user">User</option>
                                        <option value="admin">Admin</option>
                                        <option value="cxo">CXO</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    {emailDescriptionPairs.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => setEmailDescriptionPairs(prev => prev.filter((_, i) => i !== index))}
                                            className="w-full px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
                                        >
                                            Remove row
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => { setEmailDescriptionPairs([{ email: '', description: '', role: 'user' }]); setSuccessMessage(''); setErrorMessage(''); }}
                            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
                        >
                            Clear
                        </button>
                        <button
                            type="submit"
                            disabled={addLoading}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            {addLoading ? 'Sending Invitations…' : 'Invite Members'}
                        </button>
                    </div>
                </form>
            </div>
            )}

            {/* ── ZTI Hub devices ── */}
            {!readOnly && (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            ZTI Hub Devices
                            <span className="ml-2 text-sm font-normal text-gray-400">({hubDevices.length})</span>
                        </h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Machines authenticated to run control checks for this organisation. Remove a device to revoke its access.
                        </p>
                    </div>
                    <button onClick={() => loadHubDevices()} disabled={hubLoading} title="Refresh" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" /></svg>
                    </button>
                </div>

                {hubLoading ? (
                    <div className="px-6 py-10 text-center text-gray-400 text-sm">Loading devices…</div>
                ) : hubDevices.length === 0 ? (
                    <div className="px-6 py-10 text-center text-gray-400 text-sm">
                        No hub devices yet. Generate a token from the header <span className="font-mono">Hub</span> menu (or Profile → ZTI Hub CLI token), then run <span className="font-mono">zti authenticate</span>.
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[360px]">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Device</th>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Sources</th>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Last active</th>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Status</th>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                {hubDevices.map(d => {
                                    const isOnline = d.online;
                                    return (
                                        <tr key={d.id}>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">zti-hub</td>
                                            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">
                                                {(d.sources?.length ?? 0) > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {d.sources.map((src) => (
                                                            <span key={src} className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{src}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{d.last_beacon_at ? new Date(d.last_beacon_at).toLocaleString() : '—'}</td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm">
                                                {isOnline ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />Online</span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"><span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />Offline</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-right">
                                                {hubConfirmRevoke === d.id ? (
                                                    <span className="inline-flex items-center gap-2">
                                                        <button onClick={() => handleRevokeHubDevice(d.id)} disabled={hubRevoking === d.id} className="text-xs font-medium text-white bg-red-600 px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50">{hubRevoking === d.id ? 'Removing…' : 'Confirm'}</button>
                                                        <button onClick={() => setHubConfirmRevoke(null)} disabled={hubRevoking === d.id} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                                                    </span>
                                                ) : (
                                                    <button onClick={() => setHubConfirmRevoke(d.id)} title="Remove device" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                                                        <TrashIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            )}

            {/* ── Contacts ── */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            Contacts
                            <span className="ml-2 text-sm font-normal text-gray-400">({contacts.length})</span>
                        </h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Displayed as "Name (Department)" across all tabs.
                        </p>
                    </div>
                    {!readOnly && (
                        <div className="flex space-x-2">
                            <input type="file" accept=".csv" ref={contactFileRef} onChange={handleImportContactsCSV} className="hidden" />
                            <button onClick={() => setShowContactAI(true)} title="AI Assistant" className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                <BotIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => contactFileRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                <UploadIcon className="h-5 w-5" />
                            </button>
                            <button onClick={handleExportContacts} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                <DownloadIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => openContactModal('add')} title="Add Contact" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                <PlusIcon className="h-5 w-5" />
                            </button>
                        </div>
                    )}
                </div>

                {contacts.length === 0 ? (
                    <div className="px-6 py-10 text-center text-gray-400 text-sm">No contacts yet. Click + to add one.</div>
                ) : (
                    <div className="overflow-auto max-h-[400px]">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Name</th>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Email</th>
                                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Department</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                {contacts.map(c => (
                                    <tr key={c.id} onClick={() => openContactModal('view', c)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{c.name}</td>
                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{c.email}</td>
                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{c.department || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Contact Modal (Add / Edit / View) ── */}
            {(contactModal.type === 'add' || contactModal.type === 'edit' || contactModal.type === 'view') && (
                <Modal
                    isOpen={true}
                    onClose={closeContactModal}
                    title={contactModal.type === 'add' ? 'Add Contact' : contactModal.type === 'edit' ? 'Edit Contact' : 'View Contact'}
                    headerActions={contactModal.type === 'view' && !readOnly && (
                        <>
                            <button onClick={() => { closeContactModal(); openContactModal('edit', contactModal.contact); }} title="Edit" className="p-1.5 text-gray-400 hover:text-yellow-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                                <PencilIcon className="h-4 w-4" />
                            </button>
                            <button onClick={() => { closeContactModal(); openContactModal('delete', contactModal.contact); }} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        </>
                    )}
                >
                    <form onSubmit={handleSaveContact} className="space-y-4">
                        {contactError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">{contactError}</div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                value={contactForm.name}
                                onChange={e => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                                readOnly={contactModal.type === 'view'}
                                required
                                placeholder="John Doe"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email <span className="text-red-500">*</span></label>
                            <input
                                type="email"
                                value={contactForm.email}
                                onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                                readOnly={contactModal.type === 'view'}
                                required
                                placeholder="john@example.com"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                            <input
                                type="text"
                                value={contactForm.department}
                                onChange={e => setContactForm(prev => ({ ...prev, department: e.target.value }))}
                                readOnly={contactModal.type === 'view'}
                                placeholder="e.g. Engineering"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        {contactModal.type !== 'view' && contactModal.type !== null && (
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={closeContactModal} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600">
                                    Cancel
                                </button>
                                <button type="submit" disabled={contactSaving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                                    {contactSaving ? 'Saving…' : contactModal.type === 'add' ? 'Add Contact' : 'Save Changes'}
                                </button>
                            </div>
                        )}
                    </form>
                </Modal>
            )}

            {/* ── Contact Delete Confirmation ── */}
            {contactModal.type === 'delete' && contactModal.contact && (
                <Modal isOpen={true} onClose={closeContactModal} title="Delete Contact">
                    <div className="space-y-4">
                        {contactError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">{contactError}</div>
                        )}
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            Are you sure you want to delete <span className="font-semibold">{contactModal.contact.name}</span>?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button onClick={closeContactModal} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600">
                                Cancel
                            </button>
                            <button onClick={handleDeleteContact} disabled={contactSaving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50">
                                {contactSaving ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ── Contact AI Chat ── */}
            {showContactAI && (
                <AIChatModal
                    isOpen={true}
                    onClose={() => setShowContactAI(false)}
                    module="contacts"
                    contextLabel="Organisation Contacts"
                />
            )}
            {/* ── Add Members Success Modal ── */}
            <Modal
                isOpen={showSuccessModal}
                onClose={() => setShowSuccessModal(false)}
                title="Member(s) Invited Successfully"
            >
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-green-600 dark:text-green-400 mb-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-semibold">Successfully added {lastAddedUsers.length} member(s).</span>
                    </div>
                    
                    <ul className="space-y-2 max-h-32 overflow-auto p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                        {lastAddedUsers.map(u => (
                            <li key={u.email} className="text-sm flex justify-between items-center">
                                <span className="text-gray-700 dark:text-gray-300 font-medium">{u.email}</span>
                                <span className="text-[10px] uppercase tracking-wider bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded font-bold text-gray-500 dark:text-gray-400">
                                    {u.role}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                        <div className="flex items-start gap-3">
                            <div className="mt-1">
                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Invitations Sent!</p>
                                <p className="text-xs text-blue-700/70 dark:text-blue-300/60 mt-0.5">
                                    Members have been invited. Now add them to the organization to finalize.
                                </p>
                            </div>
                        </div>

                        <div className="mt-4">
                            <button
                                onClick={handleAddInvitedMembers}
                                disabled={isInviting}
                                className={`w-full py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                                    isInviting
                                    ? 'bg-gray-100 text-gray-400' 
                                    : 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/20 hover:scale-[1.01] active:scale-[0.99]'
                                } disabled:opacity-70`}
                            >
                                {isInviting ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Adding to Organization...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                        </svg>
                                        Add to Organisation
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {!inviteSent && (
                        <button 
                            onClick={() => setShowSuccessModal(false)}
                            className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors font-medium"
                        >
                            Skip for now
                        </button>
                    )}
                </div>
            </Modal>
        </div>
    );
};
