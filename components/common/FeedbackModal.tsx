import React, { useState } from 'react';
import { XIcon } from '../Icons';
import * as SupabaseService from '../../services/supabase';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
    const [rating, setRating] = useState(0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (rating === 0) {
            setError('Please select a rating');
            return;
        }

        setError('');
        setIsSubmitting(true);
        try {
            const response = await fetch('https://formspree.io/f/mpqyzqzy', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    rating,
                    description,
                    _subject: 'New feedback from Rapid Dev app',
                }),
            });

            if (!response.ok) {
                let message = 'Failed to submit feedback. Please try again.';
                try {
                    const data = await response.json();
                    if (data?.errors && data.errors.length > 0 && data.errors[0]?.message) {
                        message = data.errors[0].message;
                    }
                } catch {
                    // ignore JSON parse errors and use default message
                }
                throw new Error(message);
            }

            await SupabaseService.logAllActivity({
                action: 'Submitted Feedback',
                module: 'Feedback',
                event_data: { rating, description }
            });

            alert('Thank you for your feedback!');
            setRating(0);
            setDescription('');
            setError('');
            onClose();
        } catch (err: any) {
            console.error('Failed to submit feedback', err);
            const errorMsg = err?.message || 'Failed to submit feedback. Please try again.';
            setError(errorMsg);
            alert(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[300] flex justify-center items-center p-4" onClick={onClose} aria-modal="true" role="dialog">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-6">
                    <button onClick={onClose} className="float-right text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close">
                        <XIcon className="w-5 h-5" />
                    </button>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">How would you rate us?</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Pick a rate *</p>

                    <div className="flex justify-center gap-2 mb-6">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHoveredRating(star)}
                                onMouseLeave={() => setHoveredRating(0)}
                                className="focus:outline-none transition-transform hover:scale-110"
                            >
                                <svg
                                    className={`w-10 h-10 ${
                                        star <= (hoveredRating || rating)
                                            ? 'fill-green-500 text-green-500'
                                            : 'fill-gray-300 text-gray-300 dark:fill-gray-600 dark:text-gray-600'
                                    }`}
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                            </button>
                        ))}
                    </div>

                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tell us more about your experience
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Share your thoughts, suggestions, or issues..."
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white dark:bg-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {error && (
                        <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-600 text-red-700 dark:text-red-200 text-sm rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
