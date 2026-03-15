import React from 'react';
import { Modal } from './Modal';

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    itemName: string;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ isOpen, onClose, onConfirm, itemName }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={`Confirm Deletion`}>
        <p className="dark:text-gray-300">Are you sure you want to delete this {itemName}? This action cannot be undone.</p>
        <div className="mt-6 flex justify-end space-x-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
            <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">Delete</button>
        </div>
    </Modal>
);

