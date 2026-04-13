import { useState, useCallback } from 'react';



export function useTableSelection<T>() {

    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

    const [isEditing, setIsEditing] = useState(false);

    const [editValues, setEditValues] = useState<Record<string | number, Partial<T>>>({});

    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const [isSaving, setIsSaving] = useState(false);



    // Bulk progress state

    const [bulkProgress, setBulkProgress] = useState<{

        total: number;

        completed: number;

        failed: number;

        status: 'idle' | 'processing' | 'done' | 'error';

    }>({ total: 0, completed: 0, failed: 0, status: 'idle' });



    const startBulkOperation = useCallback((total: number) => {

        setBulkProgress({ total, completed: 0, failed: 0, status: 'processing' });

    }, []);



    const incrementBulkProgress = useCallback((success: boolean) => {

        setBulkProgress(prev => ({

            ...prev,

            completed: success ? prev.completed + 1 : prev.completed,

            failed: success ? prev.failed : prev.failed + 1,

        }));

    }, []);



    const finishBulkOperation = useCallback((hasError: boolean = false) => {

        setBulkProgress(prev => ({

            ...prev,

            status: hasError ? 'error' : 'done',

        }));

    }, []);



    const resetBulkProgress = useCallback(() => {

        setBulkProgress({ total: 0, completed: 0, failed: 0, status: 'idle' });

    }, []);



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

        resetBulkProgress();

    }, [resetBulkProgress]);



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

        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving, bulkProgress,

        setIsConfirmingDelete, setIsSaving, startBulkOperation, incrementBulkProgress, finishBulkOperation, resetBulkProgress,

        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,

    };

}

