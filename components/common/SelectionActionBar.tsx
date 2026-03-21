import React from 'react';

interface SelectionActionBarProps {
    selectedCount: number;
    isEditing: boolean;
    isConfirmingDelete: boolean;
    isSaving?: boolean;
    showEdit?: boolean;
    showDelete?: boolean;
    extraActions?: React.ReactNode;
    onEdit: () => void;
    onSaveAll: () => void;
    onCancelEdit: () => void;
    onDelete: () => void;
    onConfirmDelete: () => void;
    onCancelDelete: () => void;
    onClear: () => void;
}

export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({
    selectedCount,
    isEditing,
    isConfirmingDelete,
    isSaving = false,
    showEdit = true,
    showDelete = true,
    extraActions,
    onEdit,
    onSaveAll,
    onCancelEdit,
    onDelete,
    onConfirmDelete,
    onCancelDelete,
    onClear,
}) => {
    if (selectedCount === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 dark:bg-gray-800 text-white rounded-full shadow-2xl px-5 py-2.5">
            {/* Count + clear */}
            <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center bg-blue-500 text-white text-xs font-bold rounded-full">
                    {selectedCount}
                </span>
                <span className="text-sm font-medium text-gray-200">selected</span>
                <button
                    onClick={onClear}
                    className="ml-1 text-gray-400 hover:text-white transition-colors"
                    title="Clear selection"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="w-px h-5 bg-gray-600" />

            {isEditing ? (
                <>
                    <button
                        onClick={onSaveAll}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 rounded-full text-sm font-medium transition-colors"
                    >
                        {isSaving ? (
                            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        {isSaving ? 'Saving…' : 'Save All'}
                    </button>
                    <button
                        onClick={onCancelEdit}
                        className="px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                    >
                        Cancel
                    </button>
                </>
            ) : isConfirmingDelete ? (
                <>
                    <span className="text-sm text-red-300 font-medium">
                        Delete {selectedCount} item{selectedCount > 1 ? 's' : ''}?
                    </span>
                    <button
                        onClick={onConfirmDelete}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-full text-sm font-medium transition-colors"
                    >
                        Confirm
                    </button>
                    <button
                        onClick={onCancelDelete}
                        className="px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                    >
                        Cancel
                    </button>
                </>
            ) : (
                <>
                    {extraActions}
                    {showEdit && (
                        <button
                            onClick={onEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-full text-sm font-medium transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                        </button>
                    )}
                    {showDelete && (
                        <button
                            onClick={onDelete}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-full text-sm font-medium transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                        </button>
                    )}
                </>
            )}
        </div>
    );
};
