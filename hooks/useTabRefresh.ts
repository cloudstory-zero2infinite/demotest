import { useEffect, useRef } from 'react';

export const useTabRefresh = (activeTab: string, dependencies: any[] = []) => {
  const previousTabRef = useRef<string>(activeTab);
  const tabChangeCountRef = useRef<number>(0);

  useEffect(() => {
    // Only trigger when tab actually changes
    if (previousTabRef.current !== activeTab) {
      previousTabRef.current = activeTab;
      tabChangeCountRef.current++;
      
      // Emit a custom event that components can listen to
      const event = new CustomEvent('tabChanged', {
        detail: { 
          newTab: activeTab, 
          previousTab: previousTabRef.current,
          changeCount: tabChangeCountRef.current
        }
      });
      window.dispatchEvent(event);
    }
  }, [activeTab, ...dependencies]);

  return {
    tabChangeCount: tabChangeCountRef.current,
    currentTab: activeTab,
    previousTab: previousTabRef.current
  };
};
