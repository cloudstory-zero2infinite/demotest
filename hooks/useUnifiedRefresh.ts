import { useEffect, useRef } from 'react';

/**
 * A unified hook to trigger data refresh when a component becomes visually active.
 * It triggers the callback when:
 * 1. The component's `isActive` prop transitions to true.
 * 2. The browser tab regains visibility while the component is active.
 * 3. The browser window regains focus while the component is active.
 * 
 * It automatically debounces multiple rapid fires (e.g., focus and visibilitychange firing simultaneously).
 */
export const useUnifiedRefresh = (isActive: boolean, onRefresh: () => void) => {
    const onRefreshRef = useRef(onRefresh);
    onRefreshRef.current = onRefresh;

    const lastFetchRef = useRef<number>(0);

    useEffect(() => {
        const triggerRefresh = () => {
            const now = Date.now();
            if (now - lastFetchRef.current > 500) { // 500ms debounce
                lastFetchRef.current = now;
                onRefreshRef.current();
            }
        };

        if (isActive) {
            triggerRefresh();
        }

        if (!isActive) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                triggerRefresh();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isActive]);
};
