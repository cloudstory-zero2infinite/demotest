import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

type ActivityLogRow = {
  id: string;
  action: string;
  details?: any;
  created_at?: string;
  user_id?: string;
};

export const ActivityLogs: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLogRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('activity_logs')
          .select('*')
          .order('created_at', { ascending: false });

        if (!mounted) return;

        if (error) {
          console.error('Error fetching activity logs:', error);
          setError(error.message || 'Failed to load activity logs');
          setLogs([]);
        } else {
          setLogs((data as ActivityLogRow[]) || []);
        }
      } catch (err: any) {
        console.error('Unexpected error fetching activity logs:', err);
        if (mounted) setError(err.message || String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchLogs();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="p-4">Loading activity logs...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (!logs || logs.length === 0) return <div className="p-4 text-gray-600">No activity yet.</div>;

  return (
    <div className="p-4">
      <h3 className="text-lg font-medium mb-3">Your Activity</h3>
      <div className="overflow-auto max-h-96">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-xs text-gray-500">
              <th className="px-2 py-1">When</th>
              <th className="px-2 py-1">Action</th>
              <th className="px-2 py-1">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} className="border-t">
                <td className="px-2 py-2">{l.created_at ? new Date(l.created_at).toLocaleString() : '-'}</td>
                <td className="px-2 py-2">{l.action}</td>
                <td className="px-2 py-2"><pre className="whitespace-pre-wrap">{typeof l.details === 'string' ? l.details : JSON.stringify(l.details || {}, null, 2)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActivityLogs;
