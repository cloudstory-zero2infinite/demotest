import React, { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo } from 'react';



import { useUnifiedRefresh } from '../../hooks/useUnifiedRefresh';



import { ControlRegistry, ControlRegistryCreate, ControlRegistryUpdate, ControlStatus, ControlType, EnforcementType, Capability, ControlEvidenceReview, EvidenceFileMetadata, ZtiHubStatus, ControlCheckResult } from '../../types';



import * as SupabaseService from '../../services/supabase';



import { CustomField } from '../../services/supabase';



// ctl_ref_fw moved from TEXT to JSONB (array of framework names) in 2026-05.
// The legacy form/edit UIs still keep the field as a CSV-style string for
// human editing; convert at the API boundary using these helpers.
const toFwArray = (v: unknown): string[] => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
    return String(v)
        .split(/[,;\n]/)
        .map(s => s.trim())
        .filter(Boolean);
};

const fwToString = (v: unknown): string => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
};



import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, BotIcon, FunnelIcon } from '../Icons';
import { FilterDropdown } from '../common/FilterDropdown';



import { parseCSVLine } from '../../utils/csvParser';



import { Modal } from '../common/Modal';



import { AIChatModal } from '../common/AIChatModal';



import { BulkProgressModal } from '../common/BulkProgressModal';



import { useTableSelection } from '../../hooks/useTableSelection';



import { SelectionActionBar } from '../common/SelectionActionBar';



import { processImportData, SYSTEM_FIELDS_CONFIG, applyManualMapping } from '../../utils/importUtils';
import { ImportConfirmationModal } from '../common/ImportConfirmationModal';
import { ImportMappingModal, ColumnMapping } from '../common/ImportMappingModal';
import { parseCSVText } from '../../utils/csvParser';
import CustomFieldsManager from '../common/CustomFieldsManager';







// ─── Multi-Select Dropdown for Capabilities ──────────────────────────────────







interface CapabilityMultiSelectProps {



    values: string[];



    onChange: (values: string[]) => void;



    capabilities: Capability[];



    readOnly?: boolean;



    onCapabilityCreated?: (cap: Capability) => void;



}







const CapabilityMultiSelect: React.FC<CapabilityMultiSelectProps> = ({ values = [], onChange, capabilities, readOnly, onCapabilityCreated }) => {
    // Ensure values is always an array
    const safeValues = Array.isArray(values) ? values : [];




    const [isOpen, setIsOpen] = useState(false);



    const [search, setSearch] = useState('');



    const [creating, setCreating] = useState(false);



    const ref = useRef<HTMLDivElement>(null);



    const inputRef = useRef<HTMLInputElement>(null);







    useEffect(() => {



        const handler = (e: MouseEvent) => {



            if (ref.current && !ref.current.contains(e.target as Node)) { setIsOpen(false); setSearch(''); }



        };



        document.addEventListener('mousedown', handler);



        return () => document.removeEventListener('mousedown', handler);



    }, []);







    const toggleValue = (val: string) => {



        if (safeValues.includes(val)) {
            onChange(safeValues.filter(v => v !== val));
        } else {
            onChange([...safeValues, val]);
        }




    };







    const filtered = capabilities.filter(cap =>



        cap.capab_name.toLowerCase().includes(search.toLowerCase()) ||



        cap.capab_id.toLowerCase().includes(search.toLowerCase())



    );







    const exactMatch = capabilities.some(cap => cap.capab_name.toLowerCase() === search.trim().toLowerCase());







    const handleCreate = async () => {



        const trimmed = search.trim();



        if (!trimmed) return;



        setCreating(true);



        try {



            const created = await SupabaseService.addCapability({



                capab_name: trimmed,



                capab_provider: [],



                capab_cmdb_id: [],



                capab_owner: '',



                capab_other_details: null,



            } as any);



            onCapabilityCreated?.(created);



            onChange([...safeValues, created.capab_name]);



            setSearch('');



        } catch (err: any) {



            alert(err.message || 'Failed to create capability');



        } finally {



            setCreating(false);



        }



    };







    if (readOnly) {
        return (
            <div className="mt-1 flex flex-wrap gap-1.5 min-h-[38px] items-center px-2 py-1.5 rounded-md border bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm">
                {safeValues.length === 0 && <span className="text-gray-400 text-sm">—</span>}
                {safeValues.map((v, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">{v}</span>
                ))}
            </div>
        );
    }







    return (



        <div ref={ref} className="relative mt-1">



            {/* Selected tags + search input */}



            <div



                className="flex flex-wrap gap-1.5 items-center min-h-[38px] w-full rounded-md border px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 cursor-text"



                onClick={() => { setIsOpen(true); inputRef.current?.focus(); }}



            >



                {safeValues.map((v, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                        {v}
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleValue(v); }} className="hover:text-purple-600 dark:hover:text-purple-200 leading-none">&times;</button>
                    </span>
                ))}




                <input



                    ref={inputRef}



                    type="text"



                    value={search}



                    onChange={e => { setSearch(e.target.value); setIsOpen(true); }}



                    onFocus={() => setIsOpen(true)}



                    placeholder={safeValues.length === 0 ? 'Type to search capabilities...' : ''}




                    className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"



                />



            </div>



            {isOpen && (



                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">



                    {filtered.map(cap => (



                        <label key={cap.id} className="flex items-center px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-white">



                            <input



                                type="checkbox"



                                checked={safeValues.includes(cap.capab_name)}




                                onChange={() => toggleValue(cap.capab_name)}



                                className="rounded border-gray-300 dark:border-gray-600 mr-2"



                            />



                            <span className="font-mono text-xs text-gray-400 mr-2">{cap.capab_id}</span>



                            {cap.capab_name}



                        </label>



                    ))}



                    {filtered.length === 0 && !search.trim() && (



                        <div className="px-3 py-2 text-sm text-gray-400">No capabilities found</div>



                    )}



                    {search.trim() && !exactMatch && (



                        <div className="border-t border-gray-200 dark:border-gray-600">



                            <button



                                type="button"



                                onClick={handleCreate}



                                disabled={creating}



                                className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-left font-medium"



                            >



                                {creating ? 'Creating...' : `+ Create "${search.trim()}"`}



                            </button>



                        </div>



                    )}



                </div>



            )}



        </div>



    );



};







// ─── Constants ───────────────────────────────────────────────────────────────







const CTL_STATUS_OPTIONS: ControlStatus[] = ['Enforced', 'NotEnforced'];



const ALL_CTL_STATUSES: ControlStatus[] = ['Enforced', 'NotEnforced', 'In-Review', 'NotAssessed'];



const CTL_TYPE_OPTIONS: ControlType[] = ['NN', 'Regulatory', 'Standard', 'Custom'];



const SYSTEM_CTL_TYPES: ControlType[] = ['NN', 'Regulatory', 'Standard'];



const ENFORCEMENT_TYPE_OPTIONS: EnforcementType[] = ['org_wide', 'Asset_specific', 'BU_specific'];







const ACCEPTED_EVIDENCE_TYPES = '.png,.jpg,.jpeg,.gif,.pdf,.csv,.msg';







const STATUS_BADGE: Record<ControlStatus, string> = {



    Enforced: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',



    NotEnforced: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',



    'In-Review': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',

    NotAssessed: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300',



};







const STATUS_LABEL: Record<ControlStatus, string> = {



    Enforced: 'Enforced',



    NotEnforced: 'NotEnforced',



    'In-Review': 'In-Review',

    NotAssessed: 'NotAssessed',



};







const TYPE_BADGE: Record<ControlType, string> = {



    NN: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',



    Regulatory: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',



    Standard: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',



    Custom: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',



};







const ENFORCEMENT_BADGE: Record<EnforcementType, string> = {



    org_wide: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',



    Asset_specific: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',



    BU_specific: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',



};







// ─── Evidence Enforcement Modal ──────────────────────────────────────────────







interface EvidenceEnforcementModalProps {



    isOpen: boolean;



    onClose: () => void;



    onSubmit: () => void;



    control: ControlRegistry | null;



    requestedStatus: 'Enforced' | 'NotEnforced';



}







const EvidenceEnforcementModal: React.FC<EvidenceEnforcementModalProps> = ({ isOpen, onClose, onSubmit, control, requestedStatus }) => {



    const [files, setFiles] = useState<File[]>([]);



    const [comment, setComment] = useState('');



    const [members, setMembers] = useState<any[]>([]);



    const [selectedMember, setSelectedMember] = useState<any>(null);



    const [memberSearch, setMemberSearch] = useState('');



    const [submitting, setSubmitting] = useState(false);



    const [error, setError] = useState<string | null>(null);



    const evidenceFileInputRef = useRef<HTMLInputElement>(null);







    useEffect(() => {



        if (isOpen) {



            SupabaseService.getOrganizationUsers().then(setMembers);



            setFiles([]);



            setComment('');



            setSelectedMember(null);



            setMemberSearch('');



            setError(null);



        }



    }, [isOpen]);







    const filteredMembers = members.filter(m =>



        m.email?.toLowerCase().includes(memberSearch.toLowerCase()) ||



        m.role?.toLowerCase().includes(memberSearch.toLowerCase())



    );







    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {



        const newFiles = Array.from(e.target.files || []);



        setFiles(prev => [...prev, ...newFiles]);



        if (evidenceFileInputRef.current) evidenceFileInputRef.current.value = '';



    };







    const removeFile = (index: number) => {



        setFiles(prev => prev.filter((_, i) => i !== index));



    };







    const handleDrop = (e: React.DragEvent) => {



        e.preventDefault();



        const droppedFiles = Array.from(e.dataTransfer.files);



        setFiles(prev => [...prev, ...droppedFiles]);



    };







    const handleSubmit = async () => {



        if (!control || !selectedMember) return;



        if (files.length === 0) { setError('At least one evidence file is required.'); return; }







        setSubmitting(true);



        setError(null);



        try {



            const me = await SupabaseService.getOrgMe();



            await SupabaseService.submitControlEnforcement(control.id, {



                requested_status: requestedStatus,



                comment: comment || undefined,



                reviewer_id: selectedMember.user_id || undefined,



                reviewer_name: selectedMember.email,



                reviewer_email: selectedMember.email,



                enforced_by_name: me?.email || '',



                enforced_by_email: me?.email || '',



                files,



            });



            onSubmit();



            onClose();



        } catch (err: any) {



            setError(err?.message || 'Failed to submit enforcement request.');



        } finally {



            setSubmitting(false);



        }



    };







    if (!isOpen || !control) return null;







    return (



        <div className="fixed inset-0 z-50 overflow-y-auto">



            <div className="flex min-h-screen items-center justify-center p-4">



                <div className="fixed inset-0 bg-black/50" onClick={onClose} />



                <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">



                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">



                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">



                            Evidence Collection — {requestedStatus === 'Enforced' ? 'Enforce' : 'Un-enforce'} Control



                        </h3>



                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">



                            {control.ctl_id} — {control.ctl_name}



                        </p>



                    </div>







                    <div className="p-6 space-y-5">



                        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}







                        {/* File Upload */}



                        <div>



                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">



                                Evidence Files <span className="text-red-500">*</span>



                                <span className="text-xs text-gray-400 ml-1">(PNG, JPG, PDF, CSV, MSG)</span>



                            </label>



                            <div



                                onDrop={handleDrop}



                                onDragOver={e => e.preventDefault()}



                                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer"



                                onClick={() => evidenceFileInputRef.current?.click()}



                            >



                                <UploadIcon className="h-8 w-8 mx-auto text-gray-400 mb-2" />



                                <p className="text-sm text-gray-500 dark:text-gray-400">Drag & drop files here or click to browse</p>



                                <input ref={evidenceFileInputRef} type="file" multiple accept={ACCEPTED_EVIDENCE_TYPES} onChange={handleFileChange} className="hidden" />



                            </div>



                            {files.length > 0 && (



                                <ul className="mt-3 space-y-1">



                                    {files.map((f, i) => (



                                        <li key={i} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded text-sm">



                                            <span className="truncate text-gray-700 dark:text-gray-300">{f.name} <span className="text-xs text-gray-400">({(f.size / 1024).toFixed(1)} KB)</span></span>



                                            <button type="button" onClick={() => removeFile(i)} className="text-red-400 hover:text-red-600 ml-2 text-lg leading-none">&times;</button>



                                        </li>



                                    ))}



                                </ul>



                            )}



                        </div>







                        {/* Comment */}



                        <div>



                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comment</label>



                            <textarea



                                value={comment}



                                onChange={e => setComment(e.target.value)}



                                rows={3}



                                placeholder="Add notes about this enforcement action..."



                                className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"



                            />



                        </div>







                        {/* Reviewer Selection */}



                        <div>



                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">



                                Select Peer Reviewer <span className="text-red-500">*</span>



                            </label>



                            <input



                                type="text"



                                placeholder="Search by email..."



                                value={memberSearch}



                                onChange={e => setMemberSearch(e.target.value)}



                                className="mb-2 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"



                            />



                            <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md">



                                {filteredMembers.length === 0 ? (



                                    <div className="px-3 py-2 text-sm text-gray-400">No members found</div>



                                ) : filteredMembers.map(m => (



                                    <div



                                        key={m.id}



                                        onClick={() => setSelectedMember(m)}



                                        className={`px-3 py-2 cursor-pointer text-sm flex justify-between items-center ${



                                            selectedMember?.id === m.id



                                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'



                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white'



                                        }`}



                                    >



                                        <span>{m.email}</span>



                                        <span className="text-xs text-gray-400">{m.role}</span>



                                    </div>



                                ))}



                            </div>



                            {selectedMember && (



                                <div className="mt-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-blue-700 dark:text-blue-300">



                                    Selected: {selectedMember.email} ({selectedMember.role})



                                </div>



                            )}



                        </div>



                    </div>







                    <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-lg flex justify-end space-x-3">



                        <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>



                        <button



                            onClick={handleSubmit}



                            disabled={submitting || files.length === 0 || !selectedMember}



                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"



                        >



                            {submitting ? 'Submitting...' : 'Submit for Review'}



                        </button>



                    </div>



                </div>



            </div>



        </div>



    );



};







// ─── Evidence Review Banner (shown in View modal for reviewer) ───────────────







interface EvidenceReviewBannerProps {



    control: ControlRegistry;



    onActionComplete: () => void;



}







const EvidenceReviewBanner: React.FC<EvidenceReviewBannerProps> = ({ control, onActionComplete }) => {



    const [review, setReview] = useState<ControlEvidenceReview | null>(null);



    const [isApprover, setIsApprover] = useState(false);



    const [showReject, setShowReject] = useState(false);



    const [approveComment, setApproveComment] = useState('');



    const [rejectComment, setRejectComment] = useState('');



    const [processing, setProcessing] = useState(false);



    const [evidenceUrls, setEvidenceUrls] = useState<{ name: string; signed_url: string | null; original_name: string }[]>([]);







    useEffect(() => {



        const isPending = control.ctl_status === 'In-Review';



        if (!isPending) { setReview(null); return; }







        (async () => {



            const rev = await SupabaseService.getControlEvidenceReview(control.id);



            setReview(rev);



            if (rev) {



                const me = await SupabaseService.getOrgMe();



                const idMatch = !!(me?.userId && rev.reviewer_id && rev.reviewer_id === me.userId);



                const emailMatch = !!(me?.email && rev.reviewer_email && me.email.toLowerCase() === rev.reviewer_email.toLowerCase());



                setIsApprover(idMatch || emailMatch);







                // The review endpoint now enriches evidence_files with signed_url



                const fileUrls = (rev.evidence_files || []).map((f: any) => ({



                    name: f.name,



                    signed_url: f.signed_url || null,



                    original_name: f.original_name,



                }));



                setEvidenceUrls(fileUrls);



            }



        })();



    }, [control]);







    const handleApprove = async () => {



        setProcessing(true);



        try {



            await SupabaseService.approveControlEnforcement(control.id, approveComment || undefined);



            onActionComplete();



        } catch { /* silently handled */ } finally { setProcessing(false); }



    };







    const handleReject = async () => {



        if (!rejectComment.trim()) return;



        setProcessing(true);



        try {



            await SupabaseService.rejectControlEnforcement(control.id, rejectComment);



            onActionComplete();



        } catch { /* silently handled */ } finally { setProcessing(false); }



    };







    if (!review) return null;







    return (



        <div className="mb-4 space-y-3">



            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">



                <div className="flex items-start gap-2">



                    <span className="text-yellow-600 dark:text-yellow-400 text-lg leading-none mt-0.5">&#9888;</span>



                    <div className="flex-1">



                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">



                            {isApprover



                                ? `Your review is requested to ${review.requested_status === 'Enforced' ? 'enforce' : 'un-enforce'} this control.`



                                : `Pending ${review.requested_status === 'Enforced' ? 'enforcement' : 'un-enforcement'} review by ${review.reviewer_name}`



                            }



                        </p>



                        <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">



                            Submitted by {review.enforced_by_name} on {new Date(review.created_at).toLocaleDateString()}



                        </p>



                        {review.comment && (



                            <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 italic">&ldquo;{review.comment}&rdquo;</p>



                        )}



                    </div>



                </div>







                {/* Evidence Files */}



                {evidenceUrls.length > 0 && (



                    <div className="mt-3">



                        <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">Evidence Files:</p>



                        <div className="flex flex-wrap gap-2">



                            {evidenceUrls.map((f, i) => (



                                f.signed_url ? (



                                    <a



                                        key={i}



                                        href={f.signed_url}



                                        target="_blank"



                                        rel="noopener noreferrer"



                                        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"



                                        title={f.original_name}



                                    >



                                        &#128206; {f.name}



                                    </a>



                                ) : (



                                    <span key={i} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" title={f.original_name}>



                                        &#128206; {f.name}



                                    </span>



                                )



                            ))}



                        </div>



                    </div>



                )}







                {/* Approver Actions */}



                {isApprover && !showReject && (



                    <div className="mt-4 space-y-2">



                        <textarea



                            value={approveComment}



                            onChange={e => setApproveComment(e.target.value)}



                            placeholder="Optional comment..."



                            rows={2}



                            className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"



                        />



                        <div className="flex gap-2">



                            <button onClick={handleApprove} disabled={processing} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400">



                                {processing ? 'Processing...' : 'Approve'}



                            </button>



                            <button onClick={() => setShowReject(true)} disabled={processing} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400">



                                Reject



                            </button>



                        </div>



                    </div>



                )}







                {isApprover && showReject && (



                    <div className="mt-4 space-y-2">



                        <textarea



                            value={rejectComment}



                            onChange={e => setRejectComment(e.target.value)}



                            placeholder="Reason for rejection (required)..."



                            rows={2}



                            className="block w-full rounded-md border-red-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-red-600 dark:text-white"



                        />



                        <div className="flex gap-2">



                            <button onClick={handleReject} disabled={processing || !rejectComment.trim()} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400">



                                {processing ? 'Processing...' : 'Confirm Rejection'}



                            </button>



                            <button onClick={() => setShowReject(false)} disabled={processing} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500">



                                Cancel



                            </button>



                        </div>



                    </div>



                )}



            </div>



        </div>



    );



};







// ─── Modal ───────────────────────────────────────────────────────────────────







const MANDATORY_LABEL = <span className="text-red-500 ml-0.5">*</span>;







interface ControlModalProps {



    isOpen: boolean;



    onClose: () => void;



    onSave: (data: ControlRegistryCreate | ControlRegistryUpdate) => Promise<void>;



    controlToEdit: ControlRegistry | null;



    mode: 'add' | 'edit' | 'view';



    capabilities: Capability[];



    onCapabilityCreated?: (cap: Capability) => void;



    onRequestEnforcement?: (control: ControlRegistry, requestedStatus: ControlStatus, pendingData?: any) => void;



    onReviewAction?: () => void;



    onEdit?: () => void;



    onDelete?: () => void;



    customFields: CustomField[];



}







type FormData = {



    ctl_id: string;



    ctl_name: string;



    ctl_status: ControlStatus;



    ctl_type: ControlType;



    enforcement_type: EnforcementType;



    ctl_description: string;



    ctld_by: string[];



    ctl_ref_fw: string;



    ctl_other_details: string;



    maturity_score?: number | null;



    custom_fields?: Record<string, any>;



};







const DEFAULT_FORM: FormData = {



    ctl_id: '', // Let server auto-generate



    ctl_name: '',



    ctl_status: 'NotAssessed',



    ctl_type: 'Custom',



    enforcement_type: 'org_wide',



    ctl_description: '',



    ctld_by: [],



    ctl_ref_fw: '',



    ctl_other_details: '',



    maturity_score: 0,



    custom_fields: {},



};







const ControlModal: React.FC<ControlModalProps> = ({ isOpen, onClose, onSave, controlToEdit, mode, capabilities, onCapabilityCreated, onRequestEnforcement, onReviewAction, onEdit, onDelete, customFields }) => {



    const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);



    const [isSaving, setIsSaving] = useState(false);



    const isAdd = mode === 'add';



    const isView = mode === 'view';



    const isEnforced = controlToEdit?.ctl_status === 'Enforced';



    const isPending = controlToEdit?.ctl_status === 'In-Review';



    // When enforced, all fields are frozen except status (which only allows NotEnforced, triggering evidence flow)



    const isFieldFrozen = mode === 'edit' && (isEnforced || isPending);



    // System types (NN, Regulatory, Standard): the descriptive fields (name,
    // type, description, ref_fw, enforcement_type) are system-generated and
    // frozen. But for NN, Custom, AND Standard, the OPERATIONAL fields —
    // status, controlled by, other details, maturity, evidence — must stay
    // editable so the user can actually enforce the control. Otherwise the
    // Fw-ControlRegistry agent's "enforced controls survive FW deselection"
    // promise is unreachable (the user could never mark a Standard control as
    // Enforced). Only 'Regulatory' is fully frozen on edit.
    const isNNType = mode === 'edit' && controlToEdit?.ctl_type === 'NN';
    const isCustomType = mode === 'edit' && controlToEdit?.ctl_type === 'Custom';
    const isStandardType = mode === 'edit' && controlToEdit?.ctl_type === 'Standard';
    const isSystemType = mode === 'edit' && SYSTEM_CTL_TYPES.includes(controlToEdit?.ctl_type as ControlType);

    // Freeze descriptive fields (name, type, description, ref_fw, ...) for
    // NN / Custom / Standard. The operational carve-out is applied per-field
    // below (status select, controlled-by, maturity slider, etc.).
    const isNNFieldFrozen = isNNType || isCustomType || isStandardType;

    // Regulatory still freezes everything (legacy behavior — out of scope here).
    const isOtherSystemFieldFrozen = isSystemType && !isNNType && !isStandardType;

    const isSystemFieldFrozen = isFieldFrozen || isOtherSystemFieldFrozen;




    useEffect(() => {
        if (isOpen) {
            if (controlToEdit) {
                // Initialize custom fields data with current values or defaults
                const customFieldsData: Record<string, any> = {};
                customFields.forEach(field => {
                    customFieldsData[field.field_name] = controlToEdit.custom_fields?.[field.field_name] || '';
                });

                setFormData({
                    ctl_id: controlToEdit.ctl_id,
                    ctl_name: controlToEdit.ctl_name,
                    ctl_status: controlToEdit.ctl_status,
                    ctl_type: controlToEdit.ctl_type,
                    enforcement_type: controlToEdit.enforcement_type,
                    ctl_description: controlToEdit.ctl_description ?? '',
                    ctld_by: controlToEdit.ctld_by ?? [],
                    ctl_ref_fw: fwToString(controlToEdit.ctl_ref_fw),
                    ctl_other_details: controlToEdit.ctl_other_details ?? '',
                    maturity_score: controlToEdit.maturity_score ?? 0,
                    custom_fields: customFieldsData,
                });
            } else {
                // Initialize custom fields data for new control
                const customFieldsData: Record<string, any> = {};
                customFields.forEach(field => {
                    customFieldsData[field.field_name] = '';
                });

                setFormData({
                    ...DEFAULT_FORM,
                    custom_fields: customFieldsData,
                });
            }
        }
    }, [controlToEdit, isOpen, customFields]);







    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {



        const { name, value } = e.target;



        // Intercept status changes — only enforcement requires evidence + peer review



        if (name === 'ctl_status' && controlToEdit && mode === 'edit') {



            const newStatus = value as ControlStatus;



            if (newStatus === 'Enforced' && controlToEdit.ctl_status !== 'Enforced') {



                if (!formData.ctld_by || formData.ctld_by.length === 0) {



                    alert('"Controlled By" must be filled before a control can be moved to Enforced.');



                    return;



                }



                if (onRequestEnforcement) {



                    onRequestEnforcement(controlToEdit, newStatus);



                    return;



                }



            }



        }



        setFormData(prev => ({ ...prev, [name]: value }));



    };



    const handleCustomFieldChange = (fieldName: string, value: string) => {

        setFormData(prev => ({

            ...prev,

            custom_fields: {

                ...prev.custom_fields,

                [fieldName]: value

            }

        }));

    };







    const handleSubmit = async (e: React.FormEvent) => {



        e.preventDefault();



        if (formData.ctl_status === 'Enforced' && (!formData.ctld_by || formData.ctld_by.length === 0)) {



            alert('"Controlled By" must be filled before a control can be moved to Enforced.');



            return;



        }

        // Evidence / peer-review gate. Only ENFORCING a control needs review —
        // un-enforcing or editing fields while staying NotEnforced saves
        // directly. Applies to NN, Custom, and (agent-managed) Standard rows.
        if ((isNNType || isCustomType || isStandardType) && controlToEdit) {
            const hasEditableChanges =
                formData.ctl_status !== controlToEdit.ctl_status ||
                JSON.stringify(formData.ctld_by) !== JSON.stringify(controlToEdit.ctld_by || []) ||
                formData.ctl_other_details !== (controlToEdit.ctl_other_details || '');

            const reqStatus = (formData.ctl_status === 'Enforced' || formData.ctl_status === 'NotEnforced')
                ? formData.ctl_status
                : (controlToEdit.ctl_status === 'Enforced' ? 'Enforced' : 'NotEnforced');

            // Only the Enforced direction requires evidence + reviewer
            // sign-off. Going to NotEnforced (or any change while NotEnforced)
            // falls through to the normal direct-save path below.
            if (hasEditableChanges && onRequestEnforcement && reqStatus === 'Enforced') {
                onRequestEnforcement(controlToEdit, reqStatus as any, formData);
                return;
            }
        }



        setIsSaving(true);



        try {



            console.log('Submitting control data:', formData);



            await onSave(formData);



        } finally {



            setIsSaving(false);



        }



    };







    const title = mode === 'add' ? 'Add Control' : mode === 'edit' ? 'Edit Control' : 'View Control';







    // For enforced controls in edit mode, only show status with the opposite option



    const statusOptionsForEdit = (): ControlStatus[] => {



        if (mode !== 'edit' || !controlToEdit) return CTL_STATUS_OPTIONS;



        if (isEnforced) return ['Enforced', 'NotEnforced'];



        if (controlToEdit.ctl_status === 'NotEnforced') return ['NotEnforced', 'Enforced'];



        return CTL_STATUS_OPTIONS;



    };







    return (



        <Modal isOpen={isOpen} onClose={onClose} title={title}



            headerActions={isView && (



                <>



                    <button onClick={() => { onClose(); onEdit?.(); }} title="Edit" className="p-1.5 text-gray-400 hover:text-yellow-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">



                        <PencilIcon className="h-4 w-4" />



                    </button>



                    <button onClick={() => { onClose(); onDelete?.(); }} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">



                        <TrashIcon className="h-4 w-4" />



                    </button>



                </>



            )}



        >



            <form onSubmit={handleSubmit} className="space-y-4">



                {/* Evidence Review Banner for pending controls */}



                {(isView || mode === 'edit') && controlToEdit && isPending && (



                    <EvidenceReviewBanner control={controlToEdit} onActionComplete={() => { onReviewAction?.(); onClose(); }} />



                )}







                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">



                    {mode !== 'add' && controlToEdit && (



                        <div>



                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Control ID</label>



                            <div className="mt-1 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-600 text-sm font-mono text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-500 flex items-center gap-2">



                                {controlToEdit.ctl_id}



                                <span className="text-xs text-gray-400 dark:text-gray-500 font-sans">(auto-generated)</span>



                            </div>



                        </div>



                    )}



                    <div>



                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Control Name {MANDATORY_LABEL}{isNNFieldFrozen && mode === 'edit' && <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">(system generated)</span>}</label>



                        <input type="text" name="ctl_name" value={formData.ctl_name} onChange={handleChange} readOnly={isView || isSystemFieldFrozen || isNNFieldFrozen} required placeholder="e.g. Encrypt Data on End-User Devices" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-50 dark:disabled:bg-gray-800" />



                    </div>



                    <div>



                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status {MANDATORY_LABEL}</label>



                        <select name="ctl_status" value={formData.ctl_status} onChange={handleChange} disabled={isView || isPending} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">



                            {(isPending ? ALL_CTL_STATUSES.filter(s => s === formData.ctl_status) : statusOptionsForEdit()).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}



                        </select>



                    </div>



                    <div>



                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Control Type {MANDATORY_LABEL}{isNNFieldFrozen && mode === 'edit' && <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">(system generated)</span>}</label>



                        <select name="ctl_type" value={formData.ctl_type} onChange={handleChange} disabled={isView || isSystemFieldFrozen || isNNFieldFrozen} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">



                            {CTL_TYPE_OPTIONS.map(t => (



                                <option key={t} value={t} disabled={isAdd && SYSTEM_CTL_TYPES.includes(t)} className={isAdd && SYSTEM_CTL_TYPES.includes(t) ? 'text-gray-400' : ''}>



                                    {t}{isAdd && SYSTEM_CTL_TYPES.includes(t) ? ' (system)' : ''}



                                </option>



                            ))}



                        </select>



                    </div>



                    <div>



                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Enforcement Type {MANDATORY_LABEL}{isNNFieldFrozen && mode === 'edit' && <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">(system generated)</span>}</label>



                        <select name="enforcement_type" value={formData.enforcement_type} onChange={handleChange} disabled={isView || isSystemFieldFrozen || isNNFieldFrozen} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">



                            {ENFORCEMENT_TYPE_OPTIONS.map(e => <option key={e} value={e}>{e === 'org_wide' ? 'Org-Wide' : e === 'Asset_specific' ? 'Asset-Specific' : 'BU-Specific'}</option>)}



                        </select>



                    </div>

                    {(formData.ctl_type === 'NN' || formData.ctl_type === 'Custom' || formData.ctl_type === 'Standard') && (
                        <div className="md:col-span-2 mt-2 mb-2 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                                Control Maturity Score
                                <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400 font-bold">{(formData.maturity_score || 0)}%</span>
                            </label>
                            
                            <input
                                type="range"
                                name="maturity_score"
                                min="0"
                                max="100"
                                step="1"
                                value={(formData.maturity_score || 0)}
                                onChange={e => {
                                    const v = Number(e.target.value);
                                    // Slider hitting 100 auto-promotes status to Enforced. The
                                    // submit handler then triggers the same peer-review evidence
                                    // gate NN/Custom use (see handleSubmit's enforcement check).
                                    setFormData(prev => ({
                                        ...prev,
                                        maturity_score: v,
                                        ctl_status: v === 100 ? 'Enforced' : prev.ctl_status,
                                    }));
                                }}
                                disabled={isView || isSystemFieldFrozen || formData.ctl_status === 'Enforced'}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 accent-blue-600"
                            />
                            
                            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2 px-1">
                                <span className="w-1/5 text-left">Not Implemented (0%)</span>
                                <span className="w-1/5 text-center">Initial (25%)</span>
                                <span className="w-1/5 text-center">Partial (50%)</span>
                                <span className="w-1/5 text-center">Mostly Implemented (75%)</span>
                                <span className="w-1/5 text-right">Fully Implemented (100%)</span>
                            </div>
                        </div>
                    )}

                    <div className="md:col-span-2">



                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">



                            Controlled By (Capabilities)



                            {!isView && !isFieldFrozen && <span className="ml-1 text-xs text-gray-400 font-normal">— select from Capability Register</span>}



                        </label>



                        <CapabilityMultiSelect values={formData.ctld_by} onChange={vals => setFormData(prev => ({ ...prev, ctld_by: vals }))} capabilities={capabilities} readOnly={isView || isFieldFrozen || isOtherSystemFieldFrozen} onCapabilityCreated={onCapabilityCreated} />



                    </div>



                    <div className="md:col-span-2">



                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description{isNNFieldFrozen && mode === 'edit' && <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">(system generated)</span>}</label>



                        <textarea name="ctl_description" value={formData.ctl_description} onChange={handleChange} readOnly={isView || isSystemFieldFrozen || isNNFieldFrozen} rows={2} placeholder="Short description of the control" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />



                    </div>



                    <div>



                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reference Framework{isNNFieldFrozen && mode === 'edit' && <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">(system generated)</span>}</label>



                        <input type="text" name="ctl_ref_fw" value={formData.ctl_ref_fw} onChange={handleChange} readOnly={isView || isSystemFieldFrozen || isNNFieldFrozen} placeholder="e.g. ISO 27001, NIST CSF" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />



                    </div>



                    <div>



                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Other Details</label>



                        <input type="text" name="ctl_other_details" value={formData.ctl_other_details} onChange={handleChange} readOnly={isView || isFieldFrozen || isOtherSystemFieldFrozen} placeholder="Additional notes" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />



                    </div>







                    {/* Evidence Files — shown in view/edit when evidence exists */}



                    {mode !== 'add' && controlToEdit && (controlToEdit.evidence_metadata ?? []).length > 0 && (



                        <div className="md:col-span-2">



                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evidence Files</label>



                            <div className="flex flex-wrap gap-2 mt-1 px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 min-h-[38px]">



                                {(controlToEdit.evidence_metadata ?? []).map((ev, i) => (



                                    <EvidencePill key={i} evidence={ev} controlId={controlToEdit.id} />



                                ))}



                            </div>



                        </div>



                    )}







                    {/* Enforced By / Reviewed By info */}



                    {mode !== 'add' && controlToEdit && (controlToEdit.enforced_by || controlToEdit.reviewed_by) && (



                        <>



                            {controlToEdit.enforced_by && (



                                <div>



                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Enforced By</label>



                                    <div className="mt-1 px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-600 text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-500">



                                        {controlToEdit.enforced_by}



                                    </div>



                                </div>



                            )}



                            {controlToEdit.reviewed_by && (



                                <div>



                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reviewed By</label>



                                    <div className="mt-1 px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-600 text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-500">



                                        {controlToEdit.reviewed_by}



                                    </div>



                                </div>



                            )}



                        </>



                    )}



                {/* Custom Fields Section */}

                {customFields.length > 0 && (

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">

                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Custom Fields</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            {customFields.map(field => (

                                <div key={field.id}>

                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">

                                        {field.field_label}

                                        {field.is_required && <span className="text-red-500 ml-1">*</span>}

                                    </label>

                                    <input

                                        type="text"

                                        value={formData.custom_fields?.[field.field_name] || ''}

                                        onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}

                                        readOnly={isView}

                                        required={field.is_required}

                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"

                                        placeholder={`Enter ${field.field_label}`}

                                    />

                                </div>

                            ))}

                        </div>

                    </div>

                )}



                </div>



                {!isView && !isPending && (



                    <div className="mt-6 flex justify-end space-x-3">



                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>



                        {(!isFieldFrozen || formData.ctl_status === 'NotEnforced') && (



                            <button type="submit" disabled={isSaving} className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed min-w-[5rem]">



                                {isSaving ? (



                                    <>



                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">



                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>



                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>



                                        </svg>



                                        Saving...



                                    </>



                                ) : 'Save'}



                            </button>



                        )}



                    </div>



                )}



            </form>



        </Modal>



    );



};







// ─── Main View ───────────────────────────────────────────────────────────────







// ─── Evidence Pill (clickable file link in table) ────────────────────────────







const EvidencePill: React.FC<{ evidence: EvidenceFileMetadata; controlId: string }> = ({ evidence, controlId }) => {



    const [url, setUrl] = useState<string | null>(null);







    const handleClick = async (e: React.MouseEvent) => {



        e.stopPropagation();



        if (url) { window.open(url, '_blank'); return; }



        try {



            const allFiles = await SupabaseService.getControlEvidenceFiles(controlId);



            const match = allFiles.find(f => f.storage_path === evidence.storage_path);



            if (match?.signed_url) {



                setUrl(match.signed_url);



                window.open(match.signed_url, '_blank');



            }



        } catch { /* fail silently */ }



    };







    return (



        <button



            onClick={handleClick}



            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer"



            title={evidence.original_name}



        >



            &#128206; {evidence.display_name}



        </button>



    );



};







type ModalState = { type: 'add' | 'edit' | 'view' | 'delete' | 'import' | 'mapping' | null; item?: ControlRegistry | null };







interface ControlRegistryViewProps {



    isActive?: boolean;



    autoOpenControlId?: string | null;



    onAutoOpenConsumed?: () => void;



}







export const ControlRegistryView: React.FC<ControlRegistryViewProps> = ({ isActive = true, autoOpenControlId, onAutoOpenConsumed }) => {



    const [controls, setControls] = useState<ControlRegistry[]>([]);



    const [capabilities, setCapabilities] = useState<Capability[]>([]);



    const [loading, setLoading] = useState(true);



    const [deleting, setDeleting] = useState(false);



    const [error, setError] = useState<string | null>(null);



    const [modalState, setModalState] = useState<ModalState>({ type: null });



    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── ZTI Hub (control checks) ──
    const [hubStatus, setHubStatus] = useState<ZtiHubStatus>({ active: false });
    const [checkScfIds, setCheckScfIds] = useState<Set<string>>(new Set());
    const [checkNnNames, setCheckNnNames] = useState<Set<string>>(new Set());
    const [enqueuingId, setEnqueuingId] = useState<string | null>(null);
    const [resultsModal, setResultsModal] = useState<{ control: ControlRegistry; results: ControlCheckResult[]; loading: boolean } | null>(null);
    const [hubToken, setHubToken] = useState<string | null>(null);
    const [hubTokenCopied, setHubTokenCopied] = useState(false);
    const [registeringHub, setRegisteringHub] = useState(false);



    const [filter, setFilter] = useState('');



    const [sortConfig, setSortConfig] = useState<{ key: keyof ControlRegistry; direction: 'ascending' | 'descending' } | null>(null);



    const [currentPage, setCurrentPage] = useState(1);



    const [itemsPerPage, setItemsPerPage] = useState(100);



    const [importData, setImportData] = useState<{ newControls: ControlRegistryCreate[]; duplicates: string[] }>({ newControls: [], duplicates: [] });
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [totalToImport, setTotalToImport] = useState(0);
    const [importedCount, setImportedCount] = useState(0);
    const [importErrors, setImportErrors] = useState(0);



    const [showAIChat, setShowAIChat] = useState(false);

    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
    const [openFilterDropdown, setOpenFilterDropdown] = useState<{key: string, rect: DOMRect} | null>(null);

    const [enforcementModal, setEnforcementModal] = useState<{ isOpen: boolean; control: ControlRegistry | null; requestedStatus: 'Enforced' | 'NotEnforced'; pendingData?: any }>({ isOpen: false, control: null, requestedStatus: 'Enforced' });



    // Custom fields state



    const [customFields, setCustomFields] = useState<CustomField[]>([]);



    const [showColumnManagement, setShowColumnManagement] = useState(false);
    const [newFieldsToCreate, setNewFieldsToCreate] = useState<any[]>([]);
    const [pendingImportData, setPendingImportData] = useState<any[]>([]);
    const [importHeaders, setImportHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<any[]>([]);







    const {



        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving, bulkProgress,



        setIsConfirmingDelete, setIsSaving, startBulkOperation, incrementBulkProgress, finishBulkOperation, resetBulkProgress,



        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,



    } = useTableSelection<ControlRegistry>();







    const fetchControls = useCallback(async () => {



        try {



            setError(null);



            const data = await SupabaseService.getControlRegistry();



            setControls(data);



        } catch (e) {



            setError("Failed to load controls.");



        } finally {



            setLoading(false);



        }



    }, []);







    const fetchCapabilities = useCallback(async () => {



        try {



            const data = await SupabaseService.getCapabilities();



            setCapabilities(data);



        } catch (e) {



            // silently fail - capabilities are optional context



        }



    }, []);







    const fetchCustomFields = useCallback(async () => {



        try {



            const fields = await SupabaseService.getCustomFields('control_registry');



            setCustomFields(fields);



        } catch (e) {



            console.error('Failed to load custom fields:', e);



        }



    }, []);







    useEffect(() => { 



        fetchControls(); 



        fetchCapabilities(); 



        fetchCustomFields();



    }, [fetchControls, fetchCapabilities, fetchCustomFields]);







    const refreshAll = useCallback(() => {



        fetchControls();



        fetchCapabilities();



        fetchCustomFields();



    }, [fetchControls, fetchCapabilities, fetchCustomFields]);



    useUnifiedRefresh(isActive, refreshAll);

    // Which controls have associated checks (decides ▶ visibility): SCF by
    // scf_control_id, NN by ctl_name. Global, fetched when the tab activates.
    useEffect(() => {
        if (!isActive) return;
        SupabaseService.getCheckAssociatedControls()
            .then(({ scf, nn }) => { setCheckScfIds(new Set(scf)); setCheckNnNames(new Set(nn)); })
            .catch(() => { /* non-fatal: button just won't appear */ });
    }, [isActive]);

    // Resolve a control row to its check target (or null if it has no checks).
    const checkTargetFor = useCallback((ctl: ControlRegistry): { scf_control_id?: string; nn_ctl_name?: string } | null => {
        if (ctl.scf_control_id && checkScfIds.has(ctl.scf_control_id)) return { scf_control_id: ctl.scf_control_id };
        if (ctl.ctl_type === 'NN' && ctl.ctl_name && checkNnNames.has(ctl.ctl_name)) return { nn_ctl_name: ctl.ctl_name };
        return null;
    }, [checkScfIds, checkNnNames]);

    // Poll hub online status while the tab is active (drives ▶ enabled state).
    useEffect(() => {
        if (!isActive) return;
        let cancelled = false;
        const tick = () => SupabaseService.getZtiHubStatus()
            .then(s => { if (!cancelled) setHubStatus(s); })
            .catch(() => { if (!cancelled) setHubStatus({ active: false }); });
        tick();
        const iv = setInterval(tick, 25000);
        return () => { cancelled = true; clearInterval(iv); };
    }, [isActive]);

    const handleRunChecks = useCallback(async (ctl: ControlRegistry) => {
        const target = checkTargetFor(ctl);
        if (!target) return;
        setEnqueuingId(ctl.id);
        try {
            const r = await SupabaseService.enqueueControlChecks(target);
            alert(`Queued ${r.queued} check${r.queued === 1 ? '' : 's'} for ${ctl.ctl_id}. The ZTI Hub will run them on its next cycle.`);
        } catch (e: any) {
            alert(e?.message || 'Failed to queue checks');
        } finally {
            setEnqueuingId(null);
        }
    }, [checkTargetFor]);

    const handleViewResults = useCallback(async (ctl: ControlRegistry) => {
        const target = checkTargetFor(ctl);
        if (!target) return;
        setResultsModal({ control: ctl, results: [], loading: true });
        try {
            const results = await SupabaseService.getControlCheckResults(target);
            setResultsModal({ control: ctl, results, loading: false });
        } catch {
            setResultsModal({ control: ctl, results: [], loading: false });
        }
    }, [checkTargetFor]);

    const handleConnectHub = useCallback(async () => {
        setRegisteringHub(true);
        try {
            const r = await SupabaseService.registerHubDevice('zti-hub');
            setHubToken(r.token);
            setHubTokenCopied(false);
        } catch (e: any) {
            alert(e?.message || 'Failed to register hub device');
        } finally {
            setRegisteringHub(false);
        }
    }, []);







    // Auto-open a specific control from notification click



    const pendingAutoOpenRef = useRef<string | null>(null);



    useEffect(() => {



        if (autoOpenControlId) {



            pendingAutoOpenRef.current = autoOpenControlId;



            // Force a fresh fetch to get latest status



            fetchControls();



            onAutoOpenConsumed?.();



        }



    }, [autoOpenControlId]);







    useEffect(() => {



        if (pendingAutoOpenRef.current && controls.length > 0) {



            const target = controls.find(c => c.id === pendingAutoOpenRef.current);



            if (target) {



                setModalState({ type: 'view', item: target });



            }



            pendingAutoOpenRef.current = null;



        }



    }, [controls]);







    const filteredAndSorted = useMemo(() => {



        let items = [...controls];



        if (filter) {



            const q = filter.toLowerCase();



            items = items.filter(c =>



                c.ctl_id.toLowerCase().includes(q) ||



                c.ctl_name.toLowerCase().includes(q) ||



                c.ctl_status.toLowerCase().includes(q) ||



                c.ctl_type.toLowerCase().includes(q) ||



                c.enforcement_type.toLowerCase().includes(q) ||



                (c.ctl_description ?? '').toLowerCase().includes(q) ||



                (c.ctld_by ?? []).some(v => v.toLowerCase().includes(q)) ||



                fwToString(c.ctl_ref_fw).toLowerCase().includes(q) ||



                (c.ctl_other_details ?? '').toLowerCase().includes(q)



            );



        }



        // Apply column-level filters
        if (Object.keys(columnFilters).length > 0) {
            items = items.filter(item => {
                return Object.entries(columnFilters).every(([key, selectedValues]) => {
                    if (!selectedValues || selectedValues.length === 0) return true;
                    
                    let val;
                    if (key.startsWith('custom_field_')) {
                        val = item.custom_fields?.[key.replace('custom_field_', '')];
                    } else {
                        val = (item as any)[key];
                    }
                    
                    const displayVal = val !== undefined && val !== null && val !== "" ? String(val) : '-';
                    return selectedValues.includes(displayVal);
                });
            });
        }

        if (sortConfig !== null) {



            items.sort((a, b) => {



                const aVal = a[sortConfig.key];



                const bVal = b[sortConfig.key];



                if (aVal === null || aVal === undefined) return 1;



                if (bVal === null || bVal === undefined) return -1;



                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;



                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;



                return 0;



            });



        }



        return items;



    }, [controls, filter, sortConfig, columnFilters]);







    // Pagination: Get current page items



    const startIndex = (currentPage - 1) * itemsPerPage;



    const endIndex = startIndex + itemsPerPage;



    const paginatedControls = filteredAndSorted.slice(startIndex, endIndex);







    // Reset to page 1 when filter changes to prevent empty pages



    useEffect(() => {



        setCurrentPage(1);



    }, [filter, columnFilters]);







    const requestSort = (key: keyof ControlRegistry, direction?: 'ascending' | 'descending') => {
        if (direction) {
            setSortConfig({ key, direction });
            return;
        }

        let newDirection: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            newDirection = 'descending';
        }
        setSortConfig({ key, direction: newDirection });
    };







    const getSortIconFor = (key: keyof ControlRegistry) => {



        if (!sortConfig || sortConfig.key !== key) return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;



        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;



    };







    const closeModal = () => { setError(null); setModalState({ type: null }); };







    const handleSave = async (data: ControlRegistryCreate | ControlRegistryUpdate) => {

        // Form keeps ctl_ref_fw as a CSV-style string for human editing; the
        // DB expects JSONB (array). Normalise at the API boundary.
        const normalized: any = { ...data, ctl_ref_fw: toFwArray((data as any).ctl_ref_fw) };

        try {



            if (modalState.type === 'edit' && modalState.item) {



                const updated = await SupabaseService.updateControlRegistry(modalState.item.id, normalized as ControlRegistryUpdate);



                await SupabaseService.logAllActivity({ action: 'Updated Control', module: 'Governance', entity_id: updated.id, entity_name: updated.ctl_name, event_data: { changes: normalized } });



            } else if (modalState.type === 'add') {



                const created = await SupabaseService.addControlRegistry(normalized as ControlRegistryCreate);



                await SupabaseService.logAllActivity({ action: 'Created Control', module: 'Governance', entity_id: created.id, entity_name: created.ctl_name, event_data: { details: normalized } });



            }



            fetchControls();



            closeModal();



        } catch (err) {



            console.error('Save control error:', err);



            setError(`Failed to save control: ${err.message}`);



        }



    };







    const handleDelete = async () => {



        if (modalState.type === 'delete' && modalState.item) {



            try {



                setDeleting(true);



                setError(null);



                await SupabaseService.deleteControlRegistry(modalState.item.id);



                await SupabaseService.logAllActivity({ action: 'Deleted Control', module: 'Governance', entity_id: modalState.item.id, entity_name: modalState.item.ctl_name });



                fetchControls();



                closeModal();



            } catch (err: any) {



                setError(err?.message || 'Failed to delete control.');



            } finally {



                setDeleting(false);



            }



        }



    };






    const handleBulkDelete = async () => {

        setIsConfirmingDelete(false);

        startBulkOperation(selectedIds.size);

        try {

            const ids = Array.from(selectedIds) as string[];

            const result = await SupabaseService.deleteControlRegistryBulk(ids);

            // Update progress based on results
            for (let i = 0; i < result.deleted; i++) {
                incrementBulkProgress(true);
            }

            for (let i = 0; i < result.errors; i++) {
                incrementBulkProgress(false);
            }

            finishBulkOperation(result.errors > 0);

            await SupabaseService.logAllActivity({ 
                action: 'Bulk Deleted Controls', 
                module: 'Governance', 
                event_data: { 
                    count: result.deleted, 
                    total: result.total, 
                    errors: result.errors 
                } 
            });

        } catch (err) {

            console.error('Bulk delete failed:', err);

            finishBulkOperation(true);

            await SupabaseService.logAllActivity({ 
                action: 'Bulk Delete Controls Failed', 
                module: 'Governance', 
                event_data: { 
                    count: selectedIds.size, 
                    error: err.message 
                } 
            });

        }

        fetchControls();

    };


// ... (rest of the code remains the same)




    const handleCloseBulkProgress = () => { resetBulkProgress(); clearAll(); };







    const handleSaveAll = async () => {



        try {



            setIsSaving(true);



            for (const [id, changes] of Object.entries(editValues)) {

                // Inline edits store ctl_ref_fw as a CSV string for the input;
                // convert to array before the API call.
                const c: any = { ...changes };
                if (c.ctl_ref_fw !== undefined) c.ctl_ref_fw = toFwArray(c.ctl_ref_fw);

                await SupabaseService.updateControlRegistry(id, c as ControlRegistryUpdate);



            }



            await SupabaseService.logAllActivity({ action: 'Bulk Edited Controls', module: 'Governance', event_data: { count: Object.keys(editValues).length } });



            cancelEdit();



            fetchControls();



        } catch (err) {



            setError('Failed to save changes.');



        } finally {



            setIsSaving(false);



        }



    };







    const handleAIChatConfirm = async (records: Record<string, unknown>[]) => {



        try {



            const payloads = records.map(r => ({



                ctl_name: String(r.ctl_name ?? ''),



                ctl_status: (CTL_STATUS_OPTIONS.includes(r.ctl_status as ControlStatus) ? r.ctl_status : 'NotAssessed') as ControlStatus,



                ctl_type: (CTL_TYPE_OPTIONS.includes(r.ctl_type as ControlType) ? r.ctl_type : 'NN') as ControlType,



                enforcement_type: (ENFORCEMENT_TYPE_OPTIONS.includes(r.enforcement_type as EnforcementType) ? r.enforcement_type : 'org_wide') as EnforcementType,



                ctl_description: r.ctl_description ? String(r.ctl_description) : null,



                ctld_by: Array.isArray(r.ctld_by) ? r.ctld_by : String(r.ctld_by ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),



                ctl_ref_fw: toFwArray(r.ctl_ref_fw),



                ctl_other_details: r.ctl_other_details ? String(r.ctl_other_details) : null,



            })) as unknown as ControlRegistryCreate[];



            await SupabaseService.bulkAddControlRegistry(payloads);



            await SupabaseService.logAllActivity({ action: 'Bulk Created Controls via AI', module: 'Governance', entity_name: `${records.length} controls created via AI`, event_data: { count: records.length, records } });



            fetchControls();



        } catch (err) {



            setError('Failed to save AI-generated controls.');



        }



    };







    // ── CSV Import ──



    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target?.result as string;
            if (!content) return;

            try {
                const parsed = parseCSVText(content);
                setImportHeaders(parsed.headers);
                setRawRows(parsed.rows);
                setModalState({ type: 'mapping' });
            } catch (err) {
                setError('Failed to parse import file.');
            }
        };
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };

    const handleConfirmMapping = (mapping: ColumnMapping[]) => {
        try {
            const { records, newFields } = applyManualMapping(mapping, rawRows, customFields, 'control_registry');
            
            if (newFields.length > 0) {
                setNewFieldsToCreate(newFields);
                setPendingImportData(records);
                return;
            }

            prepareImportData(records);
        } catch (err) {
            setError('Failed to process mapping.');
        }
    };

    const prepareImportData = (records: any[]) => {
        const existingNames = new Set(controls.map(c => c.ctl_name.toLowerCase()));
        const newControls = records.filter(c => !existingNames.has(c.ctl_name.toLowerCase()));
        const duplicates = records.filter(c => existingNames.has(c.ctl_name.toLowerCase())).map(c => c.ctl_name);

        setImportData({ newControls, duplicates });
        setModalState({ type: 'import' });
    };

    const handleConfirmNewFields = async () => {
        try {
            await Promise.all(newFieldsToCreate.map(field => 
                SupabaseService.createCustomField('control_registry', field)
            ));
            
            // Refresh custom fields definitions
            const fields = await SupabaseService.getCustomFields('control_registry');
            setCustomFields(fields);
            
            // Clear confirmation state and proceed
            const data = [...pendingImportData];
            setNewFieldsToCreate([]);
            setPendingImportData([]);
            prepareImportData(data);
        } catch (err) {
            setError('Failed to create new custom fields.');
        }
    };







    const handleConfirmImport = async () => {
        if (importData.newControls.length === 0) return;
        
        try {
            setIsImporting(true);
            setTotalToImport(importData.newControls.length);
            setImportedCount(0);
            setImportErrors(0);
            setImportProgress(0);

            // Use bulk import for efficiency
            const result = await SupabaseService.bulkAddControlRegistry(importData.newControls);
            
            setImportedCount(importData.newControls.length);
            setImportProgress(100);

            await SupabaseService.logAllActivity({ 
                action: 'Bulk Imported Controls', 
                module: 'Governance', 
                entity_name: `${importData.newControls.length} controls imported`, 
                event_data: { count: importData.newControls.length } 
            });

            fetchControls();
            setModalState({ type: null });
            setImportData({ newControls: [], duplicates: [] });
        } catch (err) {
            console.error('Import error:', err);
            setError('Failed to import controls.');
        } finally {
            setIsImporting(false);
        }
    };







    // ── CSV Export ──



    const handleExportCSV = () => {
        // Start with standard headers (Using labels from STANDARD_FIELD_MAPS)
        let headers = ['Control ID', 'Name', 'Status', 'Type', 'Enforcement Type', 'Description', 'Controlled By', 'Reference FW', 'Other Details'];
        
        // Add custom field labels
        const customFieldLabels = customFields.map(field => field.field_label);
        headers = [...headers, ...customFieldLabels];

        const csvContent = [
            headers.join(','),
            ...filteredAndSorted.map(c => {
                // Start with standard fields
                let row = [
                    c.ctl_id,
                    `"${(c.ctl_name || '').replace(/"/g, '""')}"`,
                    c.ctl_status,
                    c.ctl_type,
                    c.enforcement_type,
                    `"${(c.ctl_description || '').replace(/"/g, '""')}"`,
                    `"{${(c.ctld_by ?? []).join(';')}}"`,
                    `"${(c.ctl_ref_fw ?? []).join(';').replace(/"/g, '""')}"`,
                    `"${(c.ctl_other_details || '').replace(/"/g, '""')}"`,
                ];

                // Add custom field values
                const customFieldValues = customFields.map(field => {
                    const value = c.custom_fields?.[field.field_name] ?? '';
                    return `"${String(value).replace(/"/g, '""')}"`;
                });



                row = [...row, ...customFieldValues];

                return row.join(',');

            })



        ].join('\n');



        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });



        const link = document.createElement('a');



        link.href = URL.createObjectURL(blob);



        link.download = `control-registry-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };







    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";







    return (



        <div>



            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">



                <div className="w-full sm:w-1/3">



                    <input



                        type="text"



                        placeholder="Filter controls..."



                        value={filter}



                        onChange={e => setFilter(e.target.value)}



                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"



                        aria-label="Filter controls"



                    />



                </div>



                <div className="flex space-x-2">



                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />



                    {/* Hub connectivity pill moved to the global header (next to the
                        demo toggle). The hubStatus poll above still gates the ▶ buttons. */}

                    <button onClick={handleConnectHub} disabled={registeringHub} title="Generate a ZTI Hub device token" className="p-2 text-gray-400 hover:text-emerald-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5v14" /></svg>
                    </button>

                    <button onClick={() => setShowAIChat(true)} title="AI Assistant" className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">



                        <BotIcon className="h-5 w-5" />



                    </button>



                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">



                        <UploadIcon className="h-5 w-5" />



                    </button>



                    <button onClick={handleExportCSV} title="Export CSV" data-testid="control-registry-export-csv" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">



                        <DownloadIcon className="h-5 w-5" />



                    </button>



                    <button onClick={() => setModalState({ type: 'add' })} title="Add Control" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">



                        <PlusIcon className="h-5 w-5" />



                    </button>



                </div>



            </div>







            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}







            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">



                <div className="overflow-auto max-h-[calc(100vh-280px)]">



                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">



                        <thead className="bg-gray-50 dark:bg-gray-800">



                            <tr>



                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 w-16 px-2 py-3">



                                    <input



                                        type="checkbox"



                                        checked={filteredAndSorted.length > 0 && filteredAndSorted.every(i => selectedIds.has(i.id))}



                                        onChange={() => toggleAll(filteredAndSorted.map(i => i.id))}



                                        className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"



                                    />



                                    <button onClick={() => setShowColumnManagement(true)} title="Manage Columns" className="ml-2 p-1 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">



                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">



                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />



                                        </svg>



                                    </button>



                                </th>



                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">



                                    <button onClick={() => requestSort('ctl_id')} className="flex items-center w-full text-left focus:outline-none">Control ID {getSortIconFor('ctl_id')}</button>



                                </th>



                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">



                                    <button onClick={() => requestSort('ctl_name')} className="flex items-center w-full text-left focus:outline-none">Name {getSortIconFor('ctl_name')}</button>



                                </th>



                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <div className="flex items-center">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                if (openFilterDropdown?.key === 'ctl_status') {
                                                    setOpenFilterDropdown(null);
                                                } else {
                                                    setOpenFilterDropdown({ key: 'ctl_status', rect });
                                                }
                                            }} 
                                            className={`flex items-center text-left focus:outline-none flex-grow ${columnFilters['ctl_status']?.length ? 'text-blue-600 font-semibold' : ''}`}
                                        >
                                            Status {getSortIconFor('ctl_status')}
                                        </button>
                                    </div>
                                    {openFilterDropdown?.key === 'ctl_status' && (
                                        <FilterDropdown
                                            columnKey="ctl_status"
                                            items={controls}
                                            columnFilters={columnFilters}
                                            setColumnFilters={setColumnFilters}
                                            onClose={() => setOpenFilterDropdown(null)}
                                            triggerRect={openFilterDropdown.rect}
                                            sortConfig={sortConfig}
                                            requestSort={requestSort as any}
                                            hasFilter={true}
                                        />
                                    )}
                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <div className="flex items-center">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                requestSort('maturity_score' as keyof ControlRegistry);
                                            }}
                                            className={`flex items-center text-left focus:outline-none flex-grow ${sortConfig?.key === 'maturity_score' ? 'text-blue-600 font-semibold' : ''}`}
                                        >
                                            Maturity Score {getSortIconFor('maturity_score' as keyof ControlRegistry)}
                                        </button>
                                    </div>
                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <div className="flex items-center">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                if (openFilterDropdown?.key === 'ctl_type') {
                                                    setOpenFilterDropdown(null);
                                                } else {
                                                    setOpenFilterDropdown({ key: 'ctl_type', rect });
                                                }
                                            }} 
                                            className={`flex items-center text-left focus:outline-none flex-grow ${columnFilters['ctl_type']?.length ? 'text-blue-600 font-semibold' : ''}`}
                                        >
                                            Type {getSortIconFor('ctl_type')}
                                        </button>
                                    </div>
                                    {openFilterDropdown?.key === 'ctl_type' && (
                                        <FilterDropdown
                                            columnKey="ctl_type"
                                            items={controls}
                                            columnFilters={columnFilters}
                                            setColumnFilters={setColumnFilters}
                                            onClose={() => setOpenFilterDropdown(null)}
                                            triggerRect={openFilterDropdown.rect}
                                            sortConfig={sortConfig}
                                            requestSort={requestSort as any}
                                            hasFilter={true}
                                        />
                                    )}
                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <div className="flex items-center">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                if (openFilterDropdown?.key === 'enforcement_type') {
                                                    setOpenFilterDropdown(null);
                                                } else {
                                                    setOpenFilterDropdown({ key: 'enforcement_type', rect });
                                                }
                                            }} 
                                            className={`flex items-center text-left focus:outline-none flex-grow ${columnFilters['enforcement_type']?.length ? 'text-blue-600 font-semibold' : ''}`}
                                        >
                                            Enforcement {getSortIconFor('enforcement_type')}
                                        </button>
                                    </div>
                                    {openFilterDropdown?.key === 'enforcement_type' && (
                                        <FilterDropdown
                                            columnKey="enforcement_type"
                                            items={controls}
                                            columnFilters={columnFilters}
                                            setColumnFilters={setColumnFilters}
                                            onClose={() => setOpenFilterDropdown(null)}
                                            triggerRect={openFilterDropdown.rect}
                                            sortConfig={sortConfig}
                                            requestSort={requestSort as any}
                                            hasFilter={true}
                                        />
                                    )}
                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Controlled By</th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Ref Framework</th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300" title="Run cloud control checks via ZTI Hub">Checks</th>

                                {/* Custom Fields Columns */}
                                {customFields.map((field) => {
                                    const colKey = `custom_field_${field.field_name}`;
                                    const shouldShowFilter = field.field_type === 'select' || field.field_type === 'boolean';
                                    
                                    return (
                                        <th key={field.id} scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                            <div className="flex items-center">
                                                <button 
                                                    onClick={(e) => {
                                                        if (shouldShowFilter) {
                                                            e.stopPropagation();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            if (openFilterDropdown?.key === colKey) {
                                                                setOpenFilterDropdown(null);
                                                            } else {
                                                                setOpenFilterDropdown({ key: colKey, rect });
                                                            }
                                                        } else {
                                                            requestSort(colKey as keyof ControlRegistry);
                                                        }
                                                    }} 
                                                    className={`flex items-center text-left focus:outline-none flex-grow ${columnFilters[colKey]?.length ? 'text-blue-600 font-semibold' : ''}`}
                                                >
                                                    {field.field_label}
                                                    {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                                    {getSortIconFor(colKey as keyof ControlRegistry)}
                                                </button>
                                            </div>
                                            {openFilterDropdown?.key === colKey && shouldShowFilter && (
                                                <FilterDropdown
                                                    columnKey={colKey}
                                                    items={controls}
                                                    columnFilters={columnFilters}
                                                    setColumnFilters={setColumnFilters}
                                                    onClose={() => setOpenFilterDropdown(null)}
                                                    triggerRect={openFilterDropdown.rect}
                                                    sortConfig={sortConfig}
                                                    requestSort={requestSort as any}
                                                    hasFilter={shouldShowFilter}
                                                />
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>



                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">



                            {loading ? (



                                <tr><td colSpan={9 + customFields.length} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading controls...</td></tr>



                            ) : paginatedControls.length === 0 ? (



                                <tr><td colSpan={9 + customFields.length} className="text-center py-4 text-gray-500 dark:text-gray-400">No controls found.</td></tr>



                            ) : paginatedControls.map(ctl => (



                                <tr



                                    key={ctl.id}



                                    onClick={() => !isEditing && setModalState({ type: 'view', item: ctl })}



                                    className={`cursor-pointer transition-colors ${



                                        selectedIds.has(ctl.id) ? 'bg-blue-50 dark:bg-blue-900/20' :



                                        'hover:bg-gray-50 dark:hover:bg-gray-800/50'



                                    } ${isEditing && !selectedIds.has(ctl.id) ? 'opacity-40 pointer-events-none' : ''}`}



                                >



                                    <td onClick={e => e.stopPropagation()} className="w-10 px-4 py-4">



                                        <input



                                            type="checkbox"



                                            checked={selectedIds.has(ctl.id)}



                                            onChange={() => toggle(ctl.id)}



                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"



                                        />



                                    </td>



                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900 dark:text-white">



                                        {ctl.ctl_id}



                                    </td>



                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">



                                        {isEditing && selectedIds.has(ctl.id) ? (



                                            <input type="text" value={editValues[ctl.id]?.ctl_name ?? ctl.ctl_name} onChange={e => updateField(ctl.id, 'ctl_name', e.target.value)} className={editInputCls} />



                                        ) : ctl.ctl_name}



                                    </td>



                                    <td className="px-6 py-4 whitespace-nowrap text-sm">



                                        {isEditing && selectedIds.has(ctl.id) && ctl.ctl_status !== 'In-Review' ? (



                                            <select



                                                value={editValues[ctl.id]?.ctl_status ?? ctl.ctl_status}



                                                onChange={e => {



                                                    const newStatus = e.target.value as ControlStatus;



                                                    if (newStatus === 'Enforced' && ctl.ctl_status !== 'Enforced') {



                                                        cancelEdit();



                                                        setEnforcementModal({ isOpen: true, control: ctl, requestedStatus: newStatus });



                                                    } else {



                                                        updateField(ctl.id, 'ctl_status', newStatus);



                                                    }



                                                }}



                                                className={editInputCls}



                                            >



                                                {CTL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}



                                            </select>



                                        ) : (



                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ctl.ctl_status]}`}>{STATUS_LABEL[ctl.ctl_status]}</span>



                                        )}



                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {(ctl.ctl_type === 'NN' || ctl.ctl_type === 'Custom' || ctl.ctl_type === 'Standard') ? (
                                            <div className="flex items-center space-x-2 w-32">
                                                {isEditing && selectedIds.has(ctl.id) ? (
                                                    <input 
                                                        type="range" 
                                                        min="0" max="100" step="1"
                                                        value={editValues[ctl.id]?.maturity_score ?? ctl.maturity_score ?? 0}
                                                        onChange={e => updateField(ctl.id, 'maturity_score', Number(e.target.value))}
                                                        disabled={ctl.ctl_status === 'Enforced'}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                                                    />
                                                ) : (
                                                    <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700 mt-1">
                                                        <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${ctl.maturity_score ?? 0}%` }}></div>
                                                    </div>
                                                )}
                                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-8 text-right">
                                                    {isEditing && selectedIds.has(ctl.id)
                                                        ? `${editValues[ctl.id]?.maturity_score ?? ctl.maturity_score ?? 0}%`
                                                        : `${ctl.maturity_score ?? 0}%`}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400">—</span>
                                        )}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm">

                                        {isEditing && selectedIds.has(ctl.id) ? (



                                            <select value={editValues[ctl.id]?.ctl_type ?? ctl.ctl_type} onChange={e => updateField(ctl.id, 'ctl_type', e.target.value)} className={editInputCls}>



                                                {CTL_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}



                                            </select>



                                        ) : (



                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[ctl.ctl_type]}`}>{ctl.ctl_type}</span>



                                        )}



                                    </td>



                                    <td className="px-6 py-4 whitespace-nowrap text-sm">



                                        {isEditing && selectedIds.has(ctl.id) ? (



                                            <select value={editValues[ctl.id]?.enforcement_type ?? ctl.enforcement_type} onChange={e => updateField(ctl.id, 'enforcement_type', e.target.value)} className={editInputCls}>



                                                {ENFORCEMENT_TYPE_OPTIONS.map(e => <option key={e} value={e}>{e === 'org_wide' ? 'Org-Wide' : e === 'Asset_specific' ? 'Asset-Specific' : 'BU-Specific'}</option>)}



                                            </select>



                                        ) : (



                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ENFORCEMENT_BADGE[ctl.enforcement_type]}`}>



                                                {ctl.enforcement_type === 'org_wide' ? 'Org-Wide' : ctl.enforcement_type === 'Asset_specific' ? 'Asset-Specific' : 'BU-Specific'}



                                            </span>



                                        )}



                                    </td>



                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">



                                        {isEditing && selectedIds.has(ctl.id) ? (



                                            <CapabilityMultiSelect 
                                                values={editValues[ctl.id]?.ctld_by ?? ctl.ctld_by ?? []} 
                                                onChange={vals => {
                                                    console.log(`Control ${ctl.id} - Before:`, editValues[ctl.id]?.ctld_by ?? ctl.ctld_by ?? []);
                                                    console.log(`Control ${ctl.id} - New values:`, vals);
                                                    updateField(ctl.id, 'ctld_by', vals);
                                                }} 
                                                capabilities={capabilities} 
                                                readOnly={false}
                                            />



                                        ) : (



                                            <div className="flex flex-wrap gap-1">



                                                {(ctl.ctld_by ?? []).map((v, i) => (



                                                    <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{v}</span>



                                                ))}



                                            </div>



                                        )}



                                    </td>



                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-[150px] truncate" title={fwToString(ctl.ctl_ref_fw)}>



                                        {isEditing && selectedIds.has(ctl.id) ? (



                                            <input type="text" value={fwToString((editValues[ctl.id] as any)?.ctl_ref_fw ?? ctl.ctl_ref_fw)} onChange={e => updateField(ctl.id, 'ctl_ref_fw', e.target.value as any)} className={editInputCls} />



                                        ) : (fwToString(ctl.ctl_ref_fw) || '---')}



                                    </td>



                                    {/* ZTI Hub checks: ▶ run + results. Only shown when the control (SCF or NN) has associated checks. */}
                                    <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                                        {checkTargetFor(ctl) ? (
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRunChecks(ctl)}
                                                    disabled={!hubStatus.active || enqueuingId === ctl.id}
                                                    title={hubStatus.active ? 'Run associated control checks via ZTI Hub' : 'ZTI Hub is offline — start the hub to run checks'}
                                                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors ${hubStatus.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-300 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'}`}
                                                >
                                                    {enqueuingId === ctl.id ? (
                                                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewResults(ctl)}
                                                    title="View latest check results"
                                                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                                                >
                                                    results
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-gray-300 dark:text-gray-600">—</span>
                                        )}
                                    </td>

                                    {/* Custom Fields Data Cells */}
                                    {customFields.map((field) => {
                                        const customFieldValue = ctl.custom_fields?.[field.field_name];
                                        const editValue = editValues[ctl.id]?.custom_fields?.[field.field_name];
                                        return (
                                            <td key={field.id} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                {isEditing && selectedIds.has(ctl.id) ? (
                                                    <input
                                                        type="text"
                                                        value={editValue ?? customFieldValue ?? ''}
                                                        onChange={(e) => {
                                                    const currentCustomFields = editValues[ctl.id]?.custom_fields || ctl.custom_fields || {};
                                                    updateField(ctl.id, 'custom_fields' as any, {
                                                        ...currentCustomFields,
                                                        [field.field_name]: e.target.value
                                                    });
                                                }}
                                                        className={editInputCls}
                                                        placeholder={`Enter ${field.field_label}`}
                                                        required={field.is_required}
                                                    />
                                                ) : (
                                                    customFieldValue || '-'
                                                )}
                                            </td>
                                        );
                                    })}

                                </tr>


                            ))}



                        </tbody>



                    </table>



                </div>



            </div>







            {/* Pagination Controls */}



            {controls.length > 0 && (



                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 mt-6">



                    <div className="flex items-center space-x-2">



                        <button



                            onClick={() => setCurrentPage(currentPage - 1)}



                            disabled={currentPage === 1}



                            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-white"



                        >



                            Previous



                        </button>



                        <div className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300 bg-white border border-gray-300 rounded-md shadow-sm dark:bg-gray-800 dark:border-gray-600">



                            {currentPage} of {Math.ceil(filteredAndSorted.length / itemsPerPage)}



                        </div>



                        <button



                            onClick={() => setCurrentPage(currentPage + 1)}



                            disabled={currentPage === Math.ceil(filteredAndSorted.length / itemsPerPage)}



                            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-white"



                        >



                            Next



                        </button>



                    </div>



                    <div className="flex items-center space-x-4">



                        <div className="text-sm text-gray-700 dark:text-gray-300">



                            Showing {startIndex + 1} to {Math.min(endIndex, filteredAndSorted.length)} of {filteredAndSorted.length} results



                        </div>



                        <div className="flex items-center space-x-2">



                            <span className="text-sm text-gray-700 dark:text-gray-300">



                                Items per page:



                            </span>



                            <select



                                value={itemsPerPage}



                                onChange={e => setItemsPerPage(Number(e.target.value))}



                                className="rounded-md border-gray-300 shadow-sm text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white"



                            >



                                <option value={50}>50</option>



                                <option value={100}>100</option>



                                <option value={200}>200</option>



                                <option value={500}>500</option>



                            </select>



                        </div>



                    </div>



                </div>



            )}







            {/* Add / Edit / View Modal */}



            <ControlModal



                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}



                onClose={closeModal}



                onSave={handleSave}



                controlToEdit={modalState.item ?? null}



                mode={modalState.type as 'add' | 'edit' | 'view'}



                capabilities={capabilities}



                onCapabilityCreated={(cap) => setCapabilities(prev => [...prev, cap])}



                onRequestEnforcement={(ctl, status, pendingData) => {



                    closeModal();



                    setEnforcementModal({ 
                        isOpen: true, 
                        control: ctl, 
                        requestedStatus: (status === 'Enforced' || status === 'NotEnforced') ? status : (ctl.ctl_status === 'Enforced' ? 'Enforced' : 'NotEnforced'),
                        pendingData 
                    });



                }}



                onReviewAction={() => { closeModal(); fetchControls(); }}



                onEdit={() => setModalState({ type: 'edit', item: modalState.item })}



                onDelete={() => { setError(null); setModalState({ type: 'delete', item: modalState.item }); }}



                customFields={customFields}



            />







            {/* Evidence Enforcement Modal */}



            <EvidenceEnforcementModal



                isOpen={enforcementModal.isOpen}



                onClose={() => setEnforcementModal({ isOpen: false, control: null, requestedStatus: 'Enforced' })}



                onSubmit={async () => {
                    if (enforcementModal.pendingData && enforcementModal.control) {
                        try {
                            // Save the pending changes for NN control
                            // Force status to In-Review so it matches the enforcement flow
                            const dataToSave = { 
                                ...enforcementModal.pendingData, 
                                ctl_status: 'In-Review' 
                            };
                            await SupabaseService.updateControlRegistry(enforcementModal.control.id, dataToSave);
                        } catch (e) {
                            console.error('Failed to save pending NN changes:', e);
                        }
                    }
                    fetchControls();
                }}



                control={enforcementModal.control}



                requestedStatus={enforcementModal.requestedStatus}



            />







            {/* Delete Confirm Modal */}



            {modalState.type === 'delete' && modalState.item && (



                <div className="fixed inset-0 z-50 overflow-y-auto">



                    <div className="flex min-h-screen items-center justify-center p-4">



                        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">



                            <div className="px-6 py-4">



                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Delete Control</h3>



                            </div>



                            <div className="p-6">



                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete this control?</p>



                                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md mb-4">



                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{modalState.item.ctl_id} - {modalState.item.ctl_name}</p>



                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Type: {modalState.item.ctl_type} | Status: {modalState.item.ctl_status}</p>



                                </div>



                            </div>



                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-lg flex justify-end space-x-3">



                                <button onClick={closeModal} disabled={deleting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>



                                <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">{deleting ? 'Deleting...' : 'Delete'}</button>



                            </div>



                        </div>



                    </div>



                </div>



            )}







            {/* Import CSV Preview Modal */}



            <Modal isOpen={modalState.type === 'import'} onClose={closeModal} title="Import CSV Preview">



                <div className="space-y-4">



                    <div>



                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">New Controls to Import ({importData.newControls.length})</h4>



                        {importData.newControls.length > 0 ? (



                            <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3">



                                {importData.newControls.map((c, idx) => (



                                    <div key={idx} className="py-2 px-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm dark:text-gray-300">



                                        <div className="font-medium">{c.ctl_name}</div>



                                        <div className="text-xs text-gray-500 dark:text-gray-400">Type: {c.ctl_type} | Status: {c.ctl_status} | Enforcement: {c.enforcement_type}</div>



                                    </div>



                                ))}



                            </div>



                        ) : (



                            <div className="text-gray-500 dark:text-gray-400 text-sm">No new controls to import.</div>



                        )}



                    </div>



                    {importData.duplicates.length > 0 && (



                        <div>



                            <h4 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">Duplicates Skipped ({importData.duplicates.length})</h4>



                            <div className="text-sm text-yellow-700 dark:text-yellow-300">{importData.duplicates.join(', ')}</div>



                        </div>



                    )}



                    <div className="mt-6 flex justify-end space-x-3">



                        <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>



                        <button onClick={handleConfirmImport} disabled={importData.newControls.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">



                            Import {importData.newControls.length} Controls



                        </button>



                    </div>



                </div>



            </Modal>







            {/* Import Confirm Modal */}
            <Modal
                isOpen={modalState.type === 'import'}
                onClose={() => setModalState({ type: null })}
                title="Confirm Import"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        You are about to import <span className="font-bold text-gray-900 dark:text-white">{importData.newControls.length}</span> controls.
                    </p>
                    <div className="max-h-60 overflow-auto border rounded-md">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {importData.newControls.slice(0, 10).map((record, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-sm dark:text-gray-300 font-mono text-xs">{record.ctl_id}</td>
                                        <td className="px-4 py-2 text-sm dark:text-gray-300">{record.ctl_name}</td>
                                        <td className="px-4 py-2 text-sm dark:text-gray-300">{record.ctl_status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {importData.newControls.length > 10 && (
                            <div className="p-2 text-center text-xs text-gray-400">
                                ... and {importData.newControls.length - 10} more rows
                            </div>
                        )}
                    </div>
                    {importData.duplicates.length > 0 && (
                        <div>
                            <h4 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">Duplicates Skipped ({importData.duplicates.length})</h4>
                            <div className="text-sm text-yellow-700 dark:text-yellow-300">{importData.duplicates.join(', ')}</div>
                        </div>
                    )}
                    <div className="flex justify-end space-x-3 mt-6">
                        <button onClick={() => setModalState({ type: null })} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-600 dark:text-white dark:border-gray-500">Cancel</button>
                        <button onClick={handleConfirmImport} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Confirm Import</button>
                    </div>
                </div>
            </Modal>

            <BulkProgressModal
                isOpen={isImporting}
                title="Importing Controls"
                progress={{
                    total: totalToImport,
                    completed: importedCount - importErrors,
                    failed: importErrors,
                    status: isImporting ? 'processing' : 'idle'
                }}
                onClose={() => {}} 
            />

            {/* Selection Action Bar */}

            {bulkProgress.status === 'idle' && (

                <SelectionActionBar

                    selectedCount={selectedIds.size}

                    isEditing={isEditing}

                    isConfirmingDelete={isConfirmingDelete}

                    isSaving={isSaving}

                    onEdit={() => startEdit(filteredAndSorted.filter(i => selectedIds.has(i.id)), i => i.id)}

                    onSaveAll={handleSaveAll}

                    onCancelEdit={cancelEdit}

                    onDelete={() => setIsConfirmingDelete(true)}

                    onConfirmDelete={handleBulkDelete}

                    onCancelDelete={() => setIsConfirmingDelete(false)}

                    onClear={clearAll}

                />

            )}







            {/* AI Chat Modal */}



            <AIChatModal



                isOpen={showAIChat}



                onClose={() => setShowAIChat(false)}



                module="control_registry"



                onConfirm={handleAIChatConfirm}



            />







            {/* Bulk Progress Modal */}



            <BulkProgressModal



                isOpen={bulkProgress.status !== 'idle'}



                title="Deleting Controls"



                progress={bulkProgress}



                onClose={handleCloseBulkProgress}



            />



            {/* Custom Fields Manager */}



            <CustomFieldsManager



                isOpen={showColumnManagement}



                onClose={() => setShowColumnManagement(false)}



                onFieldChange={() => {



                    fetchCustomFields();



                    fetchControls();



                }}
                moduleName="control_registry"
            />

            <ImportConfirmationModal
                isOpen={newFieldsToCreate.length > 0}
                onClose={() => { setNewFieldsToCreate([]); setPendingImportData([]); }}
                onConfirm={handleConfirmNewFields}
                newFields={newFieldsToCreate}
                moduleName="Control Registry"
            />

            <ImportMappingModal
                isOpen={modalState.type === 'mapping'}
                onClose={() => setModalState({ type: null })}
                onConfirm={handleConfirmMapping}
                headers={importHeaders}
                moduleName="Control Registry"
                systemFields={SYSTEM_FIELDS_CONFIG.control_registry}
                existingCustomFields={customFields}
            />

            {/* ── ZTI Hub: check results modal ── */}
            {resultsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setResultsModal(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold dark:text-white">Control check results</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{resultsModal.control.ctl_id} · {resultsModal.control.scf_control_id}</p>
                            </div>
                            <button onClick={() => setResultsModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
                        </div>
                        <div className="p-5">
                            {resultsModal.loading ? (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading…</div>
                            ) : resultsModal.results.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">No runs yet. Press ▶ to queue checks for the hub to run.</div>
                            ) : (
                                <ul className="space-y-2">
                                    {resultsModal.results.map(r => {
                                        const badge = r.result_status === 'pass'
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                            : r.result_status === 'fail'
                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                            : r.result_status === 'error'
                                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
                                        const label = r.result_status || r.status;
                                        return (
                                            <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 rounded border border-gray-100 dark:border-gray-700">
                                                <div className="min-w-0">
                                                    <div className="font-mono text-sm break-all dark:text-gray-200">{r.check_id}</div>
                                                    {r.result?.summary && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{r.result.summary}</div>}
                                                    {r.finished_at && <div className="text-[11px] text-gray-400 mt-0.5">{new Date(r.finished_at).toLocaleString()}</div>}
                                                </div>
                                                <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium uppercase ${badge}`}>{label}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── ZTI Hub: device token modal ── */}
            {hubToken && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setHubToken(null); setHubTokenCopied(false); }}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-base font-semibold dark:text-white">ZTI Hub device token</h3>
                        </div>
                        <div className="p-5 space-y-3 text-sm">
                            <p className="text-gray-600 dark:text-gray-300">Copy this token and paste it into the CLI when prompted by <span className="font-mono">zti authenticate</span>. It is shown only once.</p>
                            <div className="flex gap-2">
                                <input readOnly value={hubToken} className="flex-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 font-mono text-xs dark:text-gray-200" />
                                <button
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard?.writeText(hubToken);
                                            setHubTokenCopied(true);
                                        } catch {
                                            setHubTokenCopied(false);
                                            alert('Copy failed. Please select the token and copy manually.');
                                        }
                                    }}
                                    className={`px-3 py-1.5 rounded text-white text-sm ${hubTokenCopied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                >
                                    {hubTokenCopied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <p className="text-xs text-amber-600 dark:text-amber-400">Store it securely — it grants the hub read/run access scoped to your organization.</p>
                        </div>
                        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                            <button onClick={() => { setHubToken(null); setHubTokenCopied(false); }} className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700 text-sm dark:text-gray-200">Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>



    );



};













