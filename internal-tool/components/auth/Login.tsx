import React, { useState } from 'react';
import { signInWithGoogle } from '../../services/api';

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setErr(null);
      await signInWithGoogle();
    } catch (e: any) {
      setErr(e?.message || 'Sign-in failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          ZTI Internal Tool
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Sales, analytics, SMEs and CXOs only.
        </p>
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-medium px-4 py-2.5 rounded-md disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.5 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.3C29.5 34.7 26.9 36 24 36c-5.3 0-9.7-3.5-11.3-8.4l-6.6 5.1C9.5 39.4 16.2 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.4l6.5 5.3C40.9 35.7 44 30.4 44 24c0-1.2-.1-2.3-.4-3.5z"
            />
          </svg>
          {loading ? 'Redirecting…' : 'Sign in with Google'}
        </button>
        {err && <p className="text-sm text-red-600 dark:text-red-400 mt-4">{err}</p>}
      </div>
    </div>
  );
};
