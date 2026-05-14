import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
    label: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
}

interface Props {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export const MapperContextMenu: React.FC<Props> = ({ x, y, items, onClose }) => {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('mousedown', handleDown);
        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('mousedown', handleDown);
            window.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    // Clamp into viewport so the menu never spawns offscreen.
    const VW = window.innerWidth;
    const VH = window.innerHeight;
    const W = 220;
    const H = items.length * 34 + 8;
    const left = Math.min(x, VW - W - 8);
    const top = Math.min(y, VH - H - 8);

    return (
        <div
            ref={ref}
            className="fixed z-50 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1"
            style={{ left, top, width: W }}
            onContextMenu={e => e.preventDefault()}
        >
            {items.map((item, i) => (
                <button
                    key={i}
                    disabled={item.disabled}
                    onClick={() => { item.onClick(); onClose(); }}
                    className={`w-full text-left px-3 py-1.5 text-xs ${
                        item.disabled
                            ? 'text-gray-400 cursor-not-allowed'
                            : item.danger
                                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
};
