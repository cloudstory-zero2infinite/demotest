import { useState, useCallback } from 'react';

export function useTableSelection<T>() {
    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
    const [isEditing, setIsEditing] = useState(false);
    const [editValues, setEditValues] = useState<Record<string | number, Partial<T>>>({});
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const toggle = useCallback((id: string | number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback((allIds: (string | number)[]) => {
        setSelectedIds(prev =>
            prev.size === allIds.length && allIds.length > 0 ? new Set() : new Set(allIds)
        );
    }, []);

    const clearAll = useCallback(() => {
        setSelectedIds(new Set());
        setIsEditing(false);
        setEditValues({});
        setIsConfirmingDelete(false);
    }, []);

    const startEdit = useCallback((selectedItems: T[], getId: (item: T) => string | number) => {
        const values: Record<string | number, Partial<T>> = {};
        selectedItems.forEach(item => { values[getId(item)] = { ...item }; });
        setEditValues(values);
        setIsEditing(true);
    }, []);

    const updateField = useCallback(<K extends keyof T>(id: string | number, field: K, value: T[K]) => {
        setEditValues(prev => ({
            ...prev,
            [id]: { ...prev[id], [field]: value },
        }));
    }, []);

    const cancelEdit = useCallback(() => {
        setIsEditing(false);
        setEditValues({});
    }, []);

    return {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving,
        setIsConfirmingDelete, setIsSaving,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    };
}
