import { useEffect, useState, useCallback } from 'react';

export const useDataRefresh = (fetchFunction: () => Promise<any>, dependencies: any[] = []) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

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

  // Listen for tab changes
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
