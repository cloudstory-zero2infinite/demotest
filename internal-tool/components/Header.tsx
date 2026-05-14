import React from 'react';
import { AuthUser } from '../types';

interface Props {
  user: AuthUser;
  onSignOut: () => Promise<void>;
}

export const Header: React.FC<Props> = ({ user, onSignOut }) => {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold">
            Z
          </div>
          <div>
            <div className="text-base font-semibold leading-tight">ZTI Internal Tool</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
              Sales · Analytics · SME · CXO
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium">{user.name || user.email}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
          </div>
          {user.picture ? (
            <img
              src={user.picture}
              alt=""
              className="w-9 h-9 rounded-full border border-gray-300 dark:border-gray-600"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-200 text-sm font-medium">
              {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <button
            onClick={() => onSignOut()}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
};
