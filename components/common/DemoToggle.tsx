import React, { useState } from 'react';
import { isDemoEnabled, enableDemoMode, disableDemoMode } from '../../services/demo/demoMode';

// Pill toggle rendered in the header. Only visible for the ABC News tenant.
// Toggling triggers a full page reload so every mounted tab refetches via the
// interceptor (or via the real backend, on the way back out).
export const DemoToggle: React.FC = () => {
  const [active] = useState<boolean>(isDemoEnabled());
  const [confirmTurnOff, setConfirmTurnOff] = useState(false);

  const handleClick = () => {
    if (active) {
      // Confirm before discarding mutations (since they vanish on toggle off)
      setConfirmTurnOff(true);
    } else {
      enableDemoMode();
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        title={active ? 'Demo mode is ON — click to exit and return to real data' : 'Enter demo mode (in-memory, non-persistent)'}
        className={
          active
            ? 'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white shadow-sm hover:bg-amber-600 transition-colors ring-2 ring-amber-300 ring-offset-1 ring-offset-white dark:ring-offset-gray-800 animate-pulse'
            : 'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700 dark:hover:bg-indigo-900/50 transition-colors'
        }
      >
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : 'bg-indigo-500'}`} />
        {active ? 'Demo ON' : 'Demo'}
      </button>

      {confirmTurnOff && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmTurnOff(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Exit Demo Mode?</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                All changes made in demo mode will be <span className="font-semibold">discarded</span>. The app will return to your real data.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setConfirmTurnOff(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 transition"
                >
                  Stay in Demo
                </button>
                <button
                  onClick={disableDemoMode}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 transition"
                >
                  Exit Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
