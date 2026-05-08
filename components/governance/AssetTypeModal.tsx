import React, { useState, useEffect } from 'react';
import { AssetType, saveAssetTypes } from '../../services/supabase';
import { XIcon, PlusIcon, TrashIcon } from '../Icons';
import { Modal } from '../common/Modal';

interface AssetTypeModalProps {
    isOpen: boolean;
    onClose: () => void;
    assetTypes: AssetType[];
    onSave: (newTypes: AssetType[]) => void;
}

export const AssetTypeModal: React.FC<AssetTypeModalProps> = ({ isOpen, onClose, assetTypes, onSave }) => {
    const [localTypes, setLocalTypes] = useState<AssetType[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLocalTypes(JSON.parse(JSON.stringify(assetTypes)));
        }
    }, [isOpen, assetTypes]);

    const handleAddType = () => {
        const newType: AssetType = {
            id: `type-${Date.now()}`,
            name: 'New Asset Type',
            fields: ['Name', 'Criticality']
        };
        setLocalTypes([...localTypes, newType]);
    };

    const handleUpdateTypeName = (id: string, name: string) => {
        setLocalTypes(localTypes.map(t => t.id === id ? { ...t, name } : t));
    };

    const handleAddField = (typeId: string) => {
        setLocalTypes(localTypes.map(t => {
            if (t.id === typeId) {
                return { ...t, fields: [...t.fields, ''] };
            }
            return t;
        }));
    };

    const handleUpdateField = (typeId: string, fieldIndex: number, value: string) => {
        setLocalTypes(localTypes.map(t => {
            if (t.id === typeId) {
                const newFields = [...t.fields];
                newFields[fieldIndex] = value;
                return { ...t, fields: newFields };
            }
            return t;
        }));
    };

    const handleRemoveField = (typeId: string, fieldIndex: number) => {
        setLocalTypes(localTypes.map(t => {
            if (t.id === typeId) {
                return { ...t, fields: t.fields.filter((_, i) => i !== fieldIndex) };
            }
            return t;
        }));
    };

    const handleRemoveType = (id: string) => {
        setLocalTypes(localTypes.filter(t => t.id !== id));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const saved = await saveAssetTypes(localTypes);
            onSave(saved);
            onClose();
        } catch (err) {
            console.error('Failed to save asset types', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manage Asset Types">
            <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
                {localTypes.map(type => (
                    <div key={type.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex justify-between items-center mb-4">
                            <input
                                type="text"
                                value={type.name}
                                onChange={e => handleUpdateTypeName(type.id, e.target.value)}
                                className="text-lg font-semibold bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none dark:text-white"
                                placeholder="Asset Type Name"
                            />
                            <button onClick={() => handleRemoveType(type.id)} className="text-red-500 hover:text-red-700">
                                <TrashIcon className="h-5 w-5" />
                            </button>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fields</label>
                            <div className="grid grid-cols-2 gap-2">
                                {type.fields.map((field, idx) => (
                                    <div key={idx} className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            value={field}
                                            onChange={e => handleUpdateField(type.id, idx, e.target.value)}
                                            className="flex-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:text-white"
                                            placeholder="Field Label"
                                        />
                                        <button onClick={() => handleRemoveField(type.id, idx)} className="text-gray-400 hover:text-red-500">
                                            <XIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => handleAddField(type.id)}
                                className="mt-2 flex items-center text-sm text-blue-600 hover:text-blue-700"
                            >
                                <PlusIcon className="h-4 w-4 mr-1" /> Add Field
                            </button>
                        </div>
                    </div>
                ))}

                <button
                    onClick={handleAddType}
                    className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-500 transition-colors flex items-center justify-center"
                >
                    <PlusIcon className="h-5 w-5 mr-2" /> Add New Asset Type
                </button>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </Modal>
    );
};
