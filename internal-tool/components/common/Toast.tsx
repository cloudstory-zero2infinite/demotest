import React, { createContext, useCallback, useContext, useState } from 'react';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: Kind;
}

interface Ctx {
  push: (message: string, kind?: Kind) => void;
}
const ToastCtx = createContext<Ctx>({ push: () => {} });

export const useToast = () => useContext(ToastCtx);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur, { id, message, kind }]);
    setTimeout(() => {
      setItems((cur) => cur.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed top-4 right-4 z-[60] space-y-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded shadow text-sm text-white max-w-sm break-words ${
              t.kind === 'success'
                ? 'bg-green-600'
                : t.kind === 'error'
                ? 'bg-red-600'
                : 'bg-gray-700'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};
