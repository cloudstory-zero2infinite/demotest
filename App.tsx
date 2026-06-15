import React, { useState, useEffect, useRef } from "react";

import * as SupabaseService from "./services/supabase";

import { UserRole } from './types';

import { useTabRefresh } from './hooks/useTabRefresh';

import { DEMO_ORG_NAME, isDemoEnabled } from './services/demo/demoMode';

// Layout & Common Components

import { Header } from "./components/Header";

import { Sidebar, MainTab, OrgSubTab } from "./components/Sidebar";

import { FeedbackModal } from "./components/common/FeedbackModal";

import { NameEntryModal } from "./components/auth/NameEntryModal";

import { OnboardingModal } from "./components/auth/OnboardingModal";

import { ErrorBoundary } from "./components/common/ErrorBoundary";

// Tab Components

import { DashboardTab } from "./components/tabs/DashboardTab";

import { OrganisationTab } from "./components/tabs/OrganisationTab";

import { ProgramTab } from "./components/tabs/ProgramTab";

import { GovernanceTab } from "./components/tabs/GovernanceTab";

import { ComplianceTab } from "./components/tabs/ComplianceTab";
import { RiskTab } from "./components/tabs/RiskTab";
import { ZtiHubServicesTab } from "./components/tabs/ZtiHubServicesTab";

import { ActivityLogsTab } from "./components/tabs/ActivityLogsTab";

const App: React.FC = () => {
  // Navigation state

  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");

  const [activeOrgSubTab, setActiveOrgSubTab] = useState<OrgSubTab>("view_org");

  const [governanceSubTab, setGovernanceSubTab] = useState<string | null>(null);

  const [governanceOpenItemId, setGovernanceOpenItemId] = useState<
    string | null
  >(null);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    return localStorage.getItem("sidebarOpen") !== "false";
  });

  // App state

  const [userRole, setUserRole] = useState<UserRole>('user');

  const [platformAdminRole, setPlatformAdminRole] = useState<UserRole | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined" && localStorage.getItem("theme")) {
      return localStorage.getItem("theme") === "dark";
    }

    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });

  const [userName, setUserName] = useState<string | null>(() =>
    sessionStorage.getItem("grcUserName"),
  );

  const [isNameModalOpen, setIsNameModalOpen] = useState<boolean>(false);

  const [authChecked, setAuthChecked] = useState(false);

  const [isOnboarded, setIsOnboarded] = useState<boolean>(true);

  const [onboardingStatus, setOnboardingStatus] = useState<
    "active" | "pending_approval" | null
  >(null);

  const [orgName, setOrgName] = useState<string | null>(null);

  const [logoutToastVisible, setLogoutToastVisible] = useState(false);

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);

  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);

  const [recoveryPassword, setRecoveryPassword] = useState("");

  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState("");

  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const [recoveryMessage, setRecoveryMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [showAlreadyAssociatedError, setShowAlreadyAssociatedError] = useState(false);

  const logoutTimerRef = useRef<number | null>(null);

  // Tab refresh hook

  useTabRefresh(activeTab);

  const handleToggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;

      localStorage.setItem("sidebarOpen", String(next));

      return next;
    });
  };

  const handleNavigate = (tab: MainTab, subTab?: string, itemId?: string) => {
    setActiveTab(tab);
    if (tab === 'organisation' && subTab) setActiveOrgSubTab(subTab as OrgSubTab);
    // Handle governance-related tabs
    if (['governance', 'assets', 'policies', 'vulnerability', 'relationships', 'capabilities', 'control_registry'].includes(tab)) {
      if (subTab) setGovernanceSubTab(subTab);
      setGovernanceOpenItemId(itemId || null);
    }
  };

  // Theme Effect

  useEffect(() => {
    const body = document.body;

    if (isDarkMode) {
      body.classList.add("dark");

      localStorage.setItem("theme", "dark");
    } else {
      body.classList.remove("dark");

      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  // Deep-link: open a specific policy from an email/notification link
  // (e.g. <app>/?policyId=IT-POL-ACME-001). Reuses the same nav state the
  // notification click handler uses, then strips the param from the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("policyId");
    if (!pid) return;
    setActiveTab("governance");
    setGovernanceSubTab("policies");
    setGovernanceOpenItemId(pid);
    params.delete("policyId");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );
  }, []);

  // Auth Initialization

  useEffect(() => {
        if (typeof window !== 'undefined' && window.location.href.includes('type=recovery')) {
            setShowPasswordRecovery(true);
            setIsNameModalOpen(false);
        }

        let authListener: any;

        const initAuth = async () => {
      try {
        const { data } = await SupabaseService.supabase.auth.getSession();

        const session = data.session;

        if (session && session.user) {
          const name =
            (session.user.user_metadata as any)?.full_name ||
            session.user.email ||
            "User";

          const photo =
            (session.user.user_metadata as any)?.avatar_url ||
            (session.user.user_metadata as any)?.picture ||
            null;

          sessionStorage.setItem("grcUserName", name);

          setUserName(name);

          setUserEmail(session.user.email || null);

          setUserPhotoUrl(photo);

          // If it's an invitation, keep the modal open so they can set their password
          if (!window.location.href.includes('type=invite')) {
            setIsNameModalOpen(false);
          }

          const me = await SupabaseService.getOrgMe();

          setPlatformAdminRole(me?.role ?? null);

          setIsOnboarded(me?.isOnboarded ?? false);

          setOnboardingStatus(me?.onboardingStatus ?? null);

          setOrgName(me?.orgName ?? null);

          // Detect if user clicked an invite link but is already in another org
          if ((me?.isOnboarded || me?.onboardingStatus === 'pending_approval') && window.location.href.includes('type=invite')) {
            setShowAlreadyAssociatedError(true);
          }

          // Check if this is a fresh login (not a refresh)

          const isFreshLogin = sessionStorage.getItem("freshLogin") === "true";

          const provider = sessionStorage.getItem("loginProvider");

          if (isFreshLogin) {
            try {
              const action =
                provider === "github" ? "github_login" : "google_login";

              await SupabaseService.logAllActivity({
                action: action,

                module: "Authentication",

                entity_name: name,

                event_data: { provider: provider },
              });

              sessionStorage.removeItem("freshLogin");

              sessionStorage.removeItem("loginProvider");
            } catch (err) {
              console.error("Failed to log login activity", err);
            }
          }
        } else {
          if (!sessionStorage.getItem("grcUserName")) {
            setIsNameModalOpen(true);
          }

          setPlatformAdminRole(null);

          setIsOnboarded(true);

          setOrgName(null);
        }

        setAuthChecked(true);

        const { data: listener } =
          SupabaseService.supabase.auth.onAuthStateChange(
            async (event, session) => {
              // TOKEN_REFRESHED and INITIAL_SESSION fire on browser tab focus / auto-refresh.

              // Ignoring them prevents cascading async setState calls that destabilize the component tree.

              if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")
                return;

              if (event === "SIGNED_OUT") {
                setPlatformAdminRole(null);

                return;
              }

              if (event === "PASSWORD_RECOVERY") {
                setShowPasswordRecovery(true);

                setRecoveryPassword("");

                setRecoveryConfirmPassword("");

                setRecoveryMessage(null);

                return;
              }

              if (session && session.user) {
                const name =
                  (session.user.user_metadata as any)?.full_name ||
                  session.user.email ||
                  "User";

                const photo =
                  (session.user.user_metadata as any)?.avatar_url ||
                  (session.user.user_metadata as any)?.picture ||
                  null;

                sessionStorage.setItem("grcUserName", name);

                setUserName(name);

                setUserEmail(session.user.email || null);

                setUserPhotoUrl(photo);

                // If it's an invitation, keep the modal open so they can set their password
                if (!window.location.href.includes('type=invite')) {
                  setIsNameModalOpen(false);
                }

                const me = await SupabaseService.getOrgMe();

                setPlatformAdminRole(me?.role ?? null);

                setIsOnboarded(me?.isOnboarded ?? false);

                setOnboardingStatus(me?.onboardingStatus ?? null);

                setOrgName(me?.orgName ?? null);

                if (event === "SIGNED_IN") {
                  // Trigger data refresh in all tab components after login

                  window.dispatchEvent(
                    new CustomEvent("tabChanged", {
                      detail: { newTab: "signed_in" },
                    }),
                  );

                  // Only log login for fresh user-initiated logins, not session recovery on tab switch

                  const isFreshLogin =
                    sessionStorage.getItem("freshLogin") === "true";

                  if (isFreshLogin) {
                    try {
                      await SupabaseService.logAllActivity(
                        {
                          action: "login",
                          module: "Authentication",
                          entity_name: name,
                        },
                        session.user,
                      );
                    } catch (err) {
                      console.error("Failed to log login activity", err);
                    }

                    sessionStorage.removeItem("freshLogin");
                  }
                }
              }
            },
          );

        authListener = listener;
      } catch (err) {
        console.error("Auth init error", err);

        setAuthChecked(true);

        setIsNameModalOpen(!sessionStorage.getItem("grcUserName"));

        setPlatformAdminRole(null);
      }
    };

    initAuth();

    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  const handleOnboardingComplete = async () => {
    const me = await SupabaseService.getOrgMe();

    setPlatformAdminRole(me?.role ?? null);

    setIsOnboarded(me?.isOnboarded ?? false);

    setOnboardingStatus(me?.onboardingStatus ?? null);

    setOrgName(me?.orgName ?? null);
  };

  // Display "Consultant" instead of "Consultant1" etc.

  const displayOrgName = orgName
    ? /^Consultant\d+$/i.test(orgName)
      ? "Consultant"
      : orgName
    : null;

  const handleSignOut = async () => {
    const currentUserName = userName;

    try {
      await SupabaseService.supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out failed", err);
    } finally {
      // Log sign-out activity

      try {
        await SupabaseService.logAllActivity({
          action: "logout",

          module: "Authentication",

          entity_name: currentUserName || "User",
        });
      } catch (err) {
        console.error("Failed to log logout activity", err);
      }

      sessionStorage.removeItem("grcUserName");
      // Reset the CXO "escalated only" toggle so it defaults back ON next login.
      sessionStorage.removeItem("program_escalated_only");

      setUserName(null);

      setIsNameModalOpen(true);

      setLogoutToastVisible(true);

      logoutTimerRef.current = window.setTimeout(() => {
        try {
          window.location.replace(window.location.origin);
        } catch (e) {
          window.location.reload();
        }
      }, 900) as unknown as number;
    }
  };

  useEffect(() => {
    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current as any);
    };
  }, []);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const RECOVERY_PASSWORD_RULES = [
    { test: (p: string) => p.length >= 8, label: "At least 8 characters" },

    { test: (p: string) => /[A-Z]/.test(p), label: "One uppercase letter" },

    { test: (p: string) => /[a-z]/.test(p), label: "One lowercase letter" },

    { test: (p: string) => /[0-9]/.test(p), label: "One number" },

    {
      test: (p: string) => /[^A-Za-z0-9]/.test(p),
      label: "One special character",
    },
  ];

  const handleRecoveryPasswordSubmit = async () => {
    setRecoveryMessage(null);

    const failing = RECOVERY_PASSWORD_RULES.filter(
      (r) => !r.test(recoveryPassword),
    );

    if (failing.length > 0) {
      setRecoveryMessage({
        type: "error",
        text: `Password requires: ${failing.map((r) => r.label.toLowerCase()).join(", ")}`,
      });

      return;
    }

    if (recoveryPassword !== recoveryConfirmPassword) {
      setRecoveryMessage({ type: "error", text: "Passwords do not match." });

      return;
    }

    try {
      setRecoveryLoading(true);

      const { error } = await SupabaseService.supabase.auth.updateUser({
        password: recoveryPassword,
      });

      if (error) throw error;

      setRecoveryMessage({
        type: "success",
        text: "Password updated successfully. Redirecting...",
      });

      setTimeout(() => {
        setShowPasswordRecovery(false);

        setRecoveryPassword("");

        setRecoveryConfirmPassword("");
      }, 1500);
    } catch (err: any) {
      setRecoveryMessage({
        type: "error",
        text: err?.message || "Failed to update password.",
      });
    } finally {
      setRecoveryLoading(false);
    }
  };

  const isAdmin = platformAdminRole === 'tenant_admin' || platformAdminRole === 'admin' || platformAdminRole === 'cxo';

  const renderContent = () => {
    if (!authChecked || isNameModalOpen) {
      return (
        <div className="flex items-center justify-center py-24">
          <svg
            className="animate-spin h-8 w-8 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />

            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>

          <p className="ml-3 text-gray-500 dark:text-gray-400 font-medium">
            Authenticating...
          </p>
        </div>
      );
    }

    // All tabs stay mounted after auth — visibility toggled with CSS only.

    // Data refetch is now triggered via isActive prop when tabs become visible.

    return (
      <div
        className={`animate-in fade-in duration-500 ${onboardingStatus === "pending_approval" ? "pointer-events-none select-none" : ""}`}
        style={
          onboardingStatus === "pending_approval"
            ? { filter: "blur(4px)", opacity: 0.4 }
            : undefined
        }
      >
        <div className={activeTab === "dashboard" ? "" : "hidden"}>
          <DashboardTab isActive={activeTab === "dashboard"} />
        </div>

        <div className={activeTab === "organisation" ? "" : "hidden"}>
          <OrganisationTab
            userRole={platformAdminRole}
            isActive={activeTab === "organisation"}
          />
        </div>

        <div className={activeTab === "program" ? "" : "hidden"}>
          <ProgramTab userRole={platformAdminRole ?? 'user'} isActive={activeTab === "program"} />
        </div>

        <div className={activeTab === "governance" ? "" : "hidden"}>
          <GovernanceTab isActive={activeTab === "governance"} externalSubTab={governanceSubTab} externalOpenItemId={governanceOpenItemId} onExternalSubTabConsumed={() => { setGovernanceSubTab(null); setGovernanceOpenItemId(null); }} />
        </div>

        <div className={activeTab === "assets" ? "" : "hidden"}>
          <GovernanceTab isActive={activeTab === "assets"} externalSubTab="assets" externalOpenItemId={null} />
        </div>

        <div className={activeTab === "policies" ? "" : "hidden"}>
          <GovernanceTab isActive={activeTab === "policies"} externalSubTab="policies" externalOpenItemId={null} />
        </div>

        <div className={activeTab === "vulnerability" ? "" : "hidden"}>
          <GovernanceTab isActive={activeTab === "vulnerability"} externalSubTab="vulnerability" externalOpenItemId={null} />
        </div>

        <div className={activeTab === "relationships" ? "" : "hidden"}>
          <GovernanceTab isActive={activeTab === "relationships"} externalSubTab="relationships" externalOpenItemId={null} />
        </div>

        <div className={activeTab === "capabilities" ? "" : "hidden"}>
          <GovernanceTab isActive={activeTab === "capabilities"} externalSubTab="capabilities" externalOpenItemId={null} />
        </div>

        <div className={activeTab === "control_registry" ? "" : "hidden"}>
          <GovernanceTab isActive={activeTab === "control_registry"} externalSubTab="control_registry" externalOpenItemId={null} />
        </div>

        <div className={activeTab === "compliance" ? "" : "hidden"}>
          <ComplianceTab isActive={activeTab === "compliance"} />
        </div>

        <div className={activeTab === "risk" ? "" : "hidden"}>
          <RiskTab isActive={activeTab === "risk"} />
        </div>

        <div className={activeTab === "zti_hub_services" ? "" : "hidden"}>
          <ZtiHubServicesTab isActive={activeTab === "zti_hub_services"} />
        </div>

        <div className={activeTab === "logs" ? "" : "hidden"}>
          <ActivityLogsTab isActive={activeTab === "logs"} />
        </div>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex flex-col">
        {/* Logout toast */}

        {logoutToastVisible && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-5 right-5 z-[200]"
          >
            <div className="max-w-sm w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg px-4 py-3 flex items-center space-x-3">
              <svg
                className="h-5 w-5 text-green-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>

              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Logged out
                </p>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  You have been signed out.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modals */}

        <NameEntryModal isOpen={isNameModalOpen} />

        {authChecked &&
          !isNameModalOpen &&
          !isOnboarded &&
          onboardingStatus !== "pending_approval" && (
            <OnboardingModal onComplete={handleOnboardingComplete} />
          )}

        <FeedbackModal
          isOpen={isFeedbackOpen}
          onClose={() => setIsFeedbackOpen(false)}
        />

        {/* Password Recovery Modal */}
                {showPasswordRecovery && (
                    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-blue-50 dark:bg-blue-900 p-6" aria-modal="true" role="dialog">
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-3 mb-4">
                                <img src="/logo.png" alt="Zero to Infinite" className="h-10 w-10 object-contain flex-shrink-0" />
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Zero to Infinite</h2>
                                    <p className="text-xs text-gray-400 uppercase tracking-widest">Unified Cyber Platform</p>
                                </div>
                            </div>
                            <div className="mb-5">
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Reset Your Password</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enter a new password for your account.</p>
                            </div>
                            <div className="space-y-4">
                                {recoveryMessage && (
                                    <p className={`text-xs px-2 py-1.5 rounded ${recoveryMessage.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'}`}>
                                        {recoveryMessage.text}
                                    </p>
                                )}
                                <input type="password" placeholder="New password" value={recoveryPassword} onChange={e => setRecoveryPassword(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                <input type="password" placeholder="Confirm new password" value={recoveryConfirmPassword} onChange={e => setRecoveryConfirmPassword(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                {recoveryPassword && (
                                    <ul className="text-[11px] text-gray-500 dark:text-gray-400 space-y-0.5">
                                        {RECOVERY_PASSWORD_RULES.map(r => (
                                            <li key={r.label} className={r.test(recoveryPassword) ? 'text-green-500 dark:text-green-400' : ''}>
                                                {r.test(recoveryPassword) ? '✓' : '•'} {r.label}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="pt-2">
                                    <button onClick={handleRecoveryPasswordSubmit} disabled={recoveryLoading}
                                        className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition">
                                        {recoveryLoading ? 'Updating...' : 'Set New Password'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

        {/* Header — full width */}

        <Header
          userRole={userRole}
          setUserRole={setUserRole}
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          onSignOut={handleSignOut}
          userName={userName}
          userEmail={userEmail}
          userPhotoUrl={userPhotoUrl}
          orgName={displayOrgName}
          isAbcNews={orgName === DEMO_ORG_NAME || isDemoEnabled()}
          openFeedback={() => setIsFeedbackOpen(true)}
          onNavigate={(tab, subTab, itemId) =>
            handleNavigate(tab as MainTab, subTab, itemId)
          }
          onDeleteAccount={async () => {
            try {
              await SupabaseService.deleteMyAccount();

              await handleSignOut();
            } catch (err: any) {
              console.error("Delete account failed:", err);
            }
          }}
        />

        {/* Pending approval banner */}

        {authChecked && onboardingStatus === "pending_approval" && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 px-4 py-3">
            <div className="flex items-center gap-3 max-w-full">
              <svg
                className="w-5 h-5 text-amber-500 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>

              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Access Pending Approval
                </p>

                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Your join request has been sent. Your organisation admin needs
                  to approve your access before you can use the platform.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Body: sidebar + content */}

        <div className="flex flex-1 overflow-hidden pt-16">
          <Sidebar
            activeTab={activeTab}
            activeOrgSubTab={activeOrgSubTab}
            isOpen={sidebarOpen}
            onToggle={handleToggleSidebar}
            onNavigate={handleNavigate}
            isAdmin={isAdmin}
          />

          <main className="flex-1 overflow-y-auto">
            <div className="px-4 py-3">{renderContent()}</div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
