import React, { useState, useCallback, useEffect, useRef, ChangeEvent, useMemo } from 'react';
import { Contact, ContactCreate, ContactUpdate, UserRole } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { UploadIcon, PlusIcon, EyeIcon, PencilIcon, TrashIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { PlatformAdminTab } from '../admin/PlatformAdminTab';

interface ContactModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (contact: ContactCreate | ContactUpdate) => void;
    contactToEdit: Contact | null;
    mode: 'add' | 'edit' | 'view';
}

const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose, onSave, contactToEdit, mode }) => {
    const [formData, setFormData] = useState<Partial<ContactCreate>>({});
    const isViewMode = mode === 'view';

    useEffect(() => {
        if (contactToEdit) {
            const { name, title, level, email, sec_role } = contactToEdit;
            setFormData({ name, title, level, email, sec_role });
        } else {
            setFormData({ name: '', title: '', level: 1, email: '', sec_role: '' });
        }
    }, [contactToEdit, isOpen]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as ContactCreate);
    };

    const title = mode === 'add' ? 'Add New Contact' : mode === 'edit' ? 'Edit Contact' : 'View Contact';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium dark:text-gray-300">Name</label>
                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium dark:text-gray-300">Title</label>
                        <input type="text" name="title" value={formData.title || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium dark:text-gray-300">Email</label>
                        <input type="email" name="email" value={formData.email || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium dark:text-gray-300">Level</label>
                        <input type="number" name="level" min="1" value={formData.level || 1} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium dark:text-gray-300">Security Role</label>
                        <input type="text" name="sec_role" value={formData.sec_role || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                </div>
                 {!isViewMode && (
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700">Save</button>
                    </div>
                )}
            </form>
        </Modal>
    );
};

const ContactsView: React.FC = () => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | null; contact?: Contact | null }>({ type: null });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchContacts = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getContacts();
            setContacts(data);
        } catch(e) {
            setError("Failed to load contacts.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchContacts(); }, [fetchContacts]);

    const closeModal = () => setModalState({ type: null });

    const handleSaveContact = async (formData: ContactCreate | ContactUpdate) => {
        try {
            if (modalState.type === 'edit' && modalState.contact) {
                const updatedContact = await SupabaseService.updateContact(modalState.contact.id, formData);
                await SupabaseService.logAllActivity({
                    action: 'Updated Contact',
                    module: 'Organisation',
                    entity_id: updatedContact.id,
                    entity_name: updatedContact.name,
                    event_data: { changes: formData }
                });
            } else if (modalState.type === 'add') {
                const addedContact = await SupabaseService.addContact(formData as ContactCreate);
                await SupabaseService.logAllActivity({
                    action: 'Created Contact',
                    module: 'Organisation',
                    entity_id: addedContact.id,
                    entity_name: addedContact.name,
                    event_data: { details: formData }
                });
            }
            fetchContacts();
            closeModal();
        } catch (err) {
            setError('Failed to save contact.');
        }
    };
    
    const handleDeleteContact = async () => {
        if (modalState.type === 'delete' && modalState.contact) {
            try {
                await SupabaseService.deleteContact(modalState.contact.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Contact',
                    module: 'Organisation',
                    entity_id: modalState.contact.id,
                    entity_name: modalState.contact.name
                });
                fetchContacts();
                closeModal();
            } catch (err) {
                setError('Failed to delete contact.');
            }
        }
    };

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if(!text) return;
            const lines = text.split('\n').slice(1);
            const newContacts: ContactCreate[] = lines.map(line => {
                const [name, title, level, email, sec_role] = line.split(',').map(s => s.trim());
                if (!name || !title || !level || !email || !sec_role) return null;
                return { name, title, level: Number(level), email, sec_role };
            }).filter((c): c is ContactCreate => c !== null);
            
            if (newContacts.length > 0) {
                try {
                    await SupabaseService.bulkAddContacts(newContacts);
                    await SupabaseService.logAllActivity({
                        action: 'Bulk Imported Contacts',
                        module: 'Organisation',
                        event_data: { count: newContacts.length }
                    });
                    alert(`${newContacts.length} contacts imported successfully!`);
                    fetchContacts();
                } catch (err) {
                    alert('Failed to import contacts.');
                }
            }
        };
        reader.readAsText(file);
        if(fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div>
            <div className="flex justify-end items-center mb-4 space-x-2">
                 <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                 <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                    <UploadIcon className="h-5 w-5" />
                </button>
                <button onClick={() => setModalState({ type: 'add' })} title="Add Contact" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                    <PlusIcon className="h-5 w-5" />
                </button>
            </div>
            
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Title</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Level</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Email</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Security Role</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading contacts...</td></tr>
                            ) : contacts.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-4 text-gray-500 dark:text-gray-400">No contacts found.</td></tr>
                            ) : contacts.map(contact => (
                                <tr key={contact.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{contact.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{contact.title}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{contact.level}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{contact.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{contact.sec_role}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button onClick={() => setModalState({ type: 'view', contact })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'edit', contact })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'delete', contact })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
             <ContactModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSaveContact}
                contactToEdit={modalState.contact || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />
             <DeleteConfirmationModal isOpen={modalState.type === 'delete'} onClose={closeModal} onConfirm={handleDeleteContact} itemName="contact" />
        </div>
    );
};

const OrgStructureView: React.FC = () => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showSecurityOnly, setShowSecurityOnly] = useState(false);

    useEffect(() => {
        SupabaseService.getContacts()
            .then(data => {
                setContacts(data);
            })
            .catch(err => {
                setError(err?.message || 'Failed to load contacts');
            })
            .finally(() => setLoading(false));
    }, []);

    const orgData = useMemo(() => {
        const filteredContacts = showSecurityOnly ? contacts.filter(c => c.sec_role && c.sec_role.toLowerCase() !== 'n/a') : contacts;
        return filteredContacts.reduce((acc, contact) => {
            (acc[contact.level] = acc[contact.level] || []).push(contact);
            return acc;
        }, {} as Record<number, Contact[]>);
    }, [contacts, showSecurityOnly]);

    if (loading) return <p className="text-center py-10">Loading organisation structure...</p>;
    if (error) return <p className="text-center text-red-600 py-10">Error: {error}</p>;
    if (contacts.length === 0) return <p className="text-center text-gray-500 py-10">No contacts found. Please add contacts to your organization.</p>;

    return (
        <div>
            <div className="flex justify-end items-center mb-4">
                <label className="flex items-center cursor-pointer">
                    <span className="mr-3 text-sm font-medium text-gray-900 dark:text-gray-300">Show Security Roles Only</span>
                    <div className="relative">
                        <input type="checkbox" checked={showSecurityOnly} onChange={() => setShowSecurityOnly(!showSecurityOnly)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </div>
                </label>
            </div>
            <div className="space-y-8">
                {Object.keys(orgData).sort((a,b) => Number(a)-Number(b)).map(level => (
                    <div key={level}>
                        <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-4 border-b pb-2">Level {level}</h3>
                        <div className="flex flex-wrap gap-4">
                            {orgData[Number(level)].map(contact => (
                                <div key={contact.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 min-w-[250px] flex-1">
                                    <p className="font-bold text-gray-900 dark:text-white">{contact.name}</p>
                                    <p className="text-sm text-blue-600 dark:text-blue-400">{contact.title}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{contact.email}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full inline-block">{contact.sec_role}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface OrganisationTabProps {
    userRole: UserRole | null;
}

export const OrganisationTab: React.FC<OrganisationTabProps> = ({ userRole }) => {
    type SubTab = 'structure' | 'contacts' | 'tenant_admin';
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('structure');
    
    const isPlatformAdmin = userRole === 'tenant_admin';
    
    const subTabs: { id: SubTab; label: string }[] = [
        { id: 'structure', label: 'Organisation Structure' },
        { id: 'contacts', label: 'Contacts' },
        ...(isPlatformAdmin ? [{ id: 'tenant_admin' as const, label: 'Tenant Admin' }] : [])
    ];
    
    const renderContent = () => {
        switch(activeSubTab) {
            case 'structure': return <OrgStructureView />;
            case 'contacts': return <ContactsView />;
            case 'tenant_admin': return isPlatformAdmin ? <PlatformAdminTab /> : null;
            default: return null;
        }
    }

    return (
        <div className="px-4 py-6 sm:px-0">
             <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {subTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`${
                                activeSubTab === tab.id
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
            <div className="mt-6">
                {renderContent()}
            </div>
        </div>
    );
};
