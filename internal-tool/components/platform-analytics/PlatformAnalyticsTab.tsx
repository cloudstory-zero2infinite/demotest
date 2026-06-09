import React, { useEffect, useMemo, useState } from 'react';
import { getPlatformAnalytics } from '../../services/api';
import type { PlatformAnalytics } from '../../types';
import { useToast } from '../common/Toast';
import { TenantsDonut } from './TenantsDonut';
import { UsersPerTenantBar } from './UsersPerTenantBar';
import { SignupTrendChart } from './SignupTrendChart';
import { ModuleUsageRadars } from './ModuleUsageRadars';
import { FeedbackCharts } from './FeedbackCharts';
import { EngagementBar } from './EngagementBar';
import { ReleasesCard } from './ReleasesCard';

export const PlatformAnalyticsTab: React.FC = () => {
  const { push } = useToast();
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fixed "now" for the lifetime of the view so all period maths agree.
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getPlatformAnalytics()
      .then((d) => {
        if (!mounted) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e.message || 'Failed to load analytics');
        push(e.message || 'Failed to load analytics', 'error');
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [push]);

  if (loading) {
    return <p className="text-gray-600 dark:text-gray-300 text-sm">Loading analytics…</p>;
  }
  if (error || !data) {
    return <p className="text-red-600 text-sm">{error || 'No data'}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TenantsDonut tenants={data.tenants} />
        <SignupTrendChart tenants={data.tenants} users={data.users} now={now} />
      </div>

      <UsersPerTenantBar
        tenants={data.tenants}
        orphanCount={data.users.filter((u) => u.type === 'orphan').length}
      />

      <ModuleUsageRadars moduleUsage={data.moduleUsage} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FeedbackCharts feedback={data.feedback} now={now} />
      </div>

      <EngagementBar users={data.users} now={now} />

      <ReleasesCard now={now} />
    </div>
  );
};
