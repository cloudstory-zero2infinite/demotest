import React, { useEffect, useState } from 'react';
import { supabase } from './services/supabaseClient';
import { signOut } from './services/api';
import { AuthUser } from './types';
import { Login } from './components/auth/Login';
import { Header } from './components/Header';
import { SmeTab } from './components/sme/SmeTab';
import { PlatformAnalyticsTab } from './components/platform-analytics/PlatformAnalyticsTab';

type TopTab = 'sme' | 'platform-analytics';

const App: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TopTab>('sme');

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const s = data.session;
      if (s?.user) {
        const u = s.user;
        setUser({
          id: u.id,
          email: u.email || '',
          name: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || null,
          picture: (u.user_metadata?.avatar_url as string) || null,
        });
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!mounted) return;
      if (session?.user) {
        const u = session.user;
        setUser({
          id: u.id,
          email: u.email || '',
          name: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || null,
          picture: (u.user_metadata?.avatar_url as string) || null,
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300">Loading…</p>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header user={user} onSignOut={signOut} />
      <nav className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab('sme')}
              className={`py-3 px-1 border-b-2 text-sm font-medium ${
                activeTab === 'sme'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              SME
            </button>
            <button
              onClick={() => setActiveTab('platform-analytics')}
              className={`py-3 px-1 border-b-2 text-sm font-medium ${
                activeTab === 'platform-analytics'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              Platform Analytics
            </button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'sme' && <SmeTab />}
        {activeTab === 'platform-analytics' && <PlatformAnalyticsTab />}
      </main>
    </div>
  );
};

export default App;
