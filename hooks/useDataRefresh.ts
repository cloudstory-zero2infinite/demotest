import { useEffect, useState, useCallback, useRef } from 'react';

export const useDataRefresh = (fetchFunction: () => Promise<any>, dependencies: any[] = [], isActive: boolean = true) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const lastFetchRef = useRef<number>(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchFunction();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [fetchFunction]);

  // Initial fetch and dependency changes
  useEffect(() => {
    fetchData();
  }, [fetchData, ...dependencies]);

  // Refresh when isActive becomes true (with debounce)
  useEffect(() => {
    if (!isActive) return;
    
    const now = Date.now();
    if (now - lastFetchRef.current > 500) {
      lastFetchRef.current = now;
      setRefreshKey(prev => prev + 1);
    }
  }, [isActive]);

  // Refresh when refreshKey changes
  useEffect(() => {
    if (refreshKey > 0) {
      fetchData();
    }
  }, [refreshKey, fetchData]);

  // Listen for tab changes (legacy support)
  useEffect(() => {
    const handleTabChange = () => {
      setRefreshKey(prev => prev + 1);
    };

    window.addEventListener('tabChanged', handleTabChange);
    return () => window.removeEventListener('tabChanged', handleTabChange);
  }, []);

  // Manual refresh function
  const refresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  return {
    data,
    loading,
    error,
    refresh,
    refreshKey
  };
};
