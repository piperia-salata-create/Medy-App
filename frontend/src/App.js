import React, { Suspense, lazy, memo, useEffect } from 'react';
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import ToastHost from "./components/ToastHost";
import { PwaInstallProvider } from "./hooks/usePwaInstall";

// Contexts
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuthSession, useProfileState } from "./contexts/AuthContext";
import { SeniorModeProvider } from "./contexts/SeniorModeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { supabase } from "./lib/supabase";
import { PHARMACY_PRESENCE_HEARTBEAT_MS } from "./lib/pharmacyPresence";

// Pages
const LandingPage = lazy(() => import("./pages/LandingPage"));
const LearnMorePage = lazy(() => import("./pages/LearnMorePage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const ReportBugPage = lazy(() => import("./pages/ReportBugPage"));
const SignInPage = lazy(() => import("./pages/auth/SignInPage"));
const SignUpPage = lazy(() => import("./pages/auth/SignUpPage"));
const VerifyOtpPage = lazy(() => import("./pages/auth/VerifyOtpPage"));
const FavoritesPage = lazy(() => import("./pages/patient/FavoritesPage"));
const PatientPharmaciesPage = lazy(() => import("./pages/patient/PatientPharmaciesPage"));
const PharmacyDetailPage = lazy(() => import("./pages/patient/PharmacyDetailPage"));
const RemindersPage = lazy(() => import("./pages/patient/RemindersPage"));
const InterPharmacyPage = lazy(() => import("./pages/pharmacist/InterPharmacyPage"));
const PharmacistConnectionsPage = lazy(() => import("./pages/pharmacist/PharmacistConnectionsPage"));
const PharmacistPatientRequestsPage = lazy(() => import("./pages/pharmacist/PharmacistPatientRequestsPage"));
const PharmacyCreatePage = lazy(() => import("./pages/pharmacist/PharmacyCreatePage"));
const InventoryPage = lazy(() => import("./pages/pharmacist/InventoryPage"));
const PharmacistChatPage = lazy(() => import("./pages/pharmacist/PharmacistChatPage"));
const SettingsPage = lazy(() => import("./pages/shared/SettingsPage"));
const SettingsProfilePage = lazy(() => import("./pages/shared/SettingsProfilePage"));
const NotificationsPage = lazy(() => import("./pages/shared/NotificationsPage"));
import PatientDashboard from "./pages/patient/PatientDashboard";
import PharmacistDashboard from "./pages/pharmacist/PharmacistDashboard";

const NeutralShell = memo(({ children }) => (
  <div className="min-h-screen bg-pharma-ice-blue">
    <div className="h-14 bg-white shadow-card flex items-center px-4">
      <div className="h-6 w-32 bg-pharma-grey-pale rounded-full animate-pulse" />
    </div>
    <div className="flex">
      <aside className="hidden lg:block w-60 p-4 space-y-3">
        <div className="h-3 w-20 bg-pharma-grey-pale rounded-full animate-pulse" />
        <div className="h-3 w-32 bg-pharma-grey-pale rounded-full animate-pulse" />
        <div className="h-3 w-28 bg-pharma-grey-pale rounded-full animate-pulse" />
        <div className="h-3 w-24 bg-pharma-grey-pale rounded-full animate-pulse" />
      </aside>
      <main className="flex-1 p-4">
        {children}
      </main>
    </div>
  </div>
));

const NeutralSkeleton = memo(() => (
  <div className="space-y-4">
    <div className="h-8 w-48 bg-white rounded-xl shadow-sm animate-pulse" />
    <div className="grid gap-4 md:grid-cols-2">
      <div className="h-40 bg-white rounded-2xl shadow-sm animate-pulse" />
      <div className="h-40 bg-white rounded-2xl shadow-sm animate-pulse" />
    </div>
    <div className="h-32 bg-white rounded-2xl shadow-sm animate-pulse" />
  </div>
));

const NeutralRouteFallback = memo(() => (
  <div className="pointer-events-none fixed right-3 top-3 z-[70] rounded-full border border-pharma-grey-pale bg-white/95 px-3 py-1.5 shadow-sm">
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-pharma-teal animate-pulse" />
      <span className="text-xs text-pharma-slate-grey">Loading...</span>
    </div>
  </div>
));

const ProtectedSuspense = ({ children }) => (
  <Suspense fallback={<NeutralRouteFallback />}>
    {children}
  </Suspense>
);
const PublicSuspense = ({ children }) => (
  <Suspense fallback={
    <div className="pointer-events-none fixed right-3 top-3 z-[70] rounded-full border border-pharma-grey-pale bg-white/95 px-3 py-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-pharma-teal animate-pulse" />
        <span className="text-xs text-pharma-slate-grey">Loading...</span>
      </div>
    </div>
  }>
    {children}
  </Suspense>
);

const PatientRoleShell = memo(() => (
  <div className="min-h-screen bg-pharma-ice-blue">
    <Outlet />
  </div>
));

const PharmacistRoleShell = memo(() => {
  const { user, hasSession } = useAuthSession();
  const { profileStatus, isPharmacist } = useProfileState();
  const userId = user?.id || null;
  const isPharmacistRole = isPharmacist();

  useEffect(() => {
    if (!hasSession || profileStatus !== 'ready' || !isPharmacistRole || !userId) {
      return undefined;
    }

    let canceled = false;
    let heartbeatInFlight = false;
    let pharmacyId = null;
    let isOnDuty = false;
    let heartbeatTimer = null;

    const syncOwnPharmacy = async () => {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('id, is_on_call')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle();

      if (canceled) return;
      if (error || !data) {
        pharmacyId = null;
        isOnDuty = false;
        return;
      }

      pharmacyId = data.id;
      isOnDuty = Boolean(data.is_on_call);
    };

    const sendHeartbeat = async () => {
      if (canceled || heartbeatInFlight || !pharmacyId || !isOnDuty) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      heartbeatInFlight = true;
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('pharmacies')
          .update({ is_on_call: true, updated_at: nowIso })
          .eq('id', pharmacyId)
          .select('is_on_call')
          .maybeSingle();

        if (!canceled && !error && data) {
          isOnDuty = Boolean(data.is_on_call);
        }
      } finally {
        heartbeatInFlight = false;
      }
    };

    const refreshAndHeartbeat = async () => {
      await syncOwnPharmacy();
      await sendHeartbeat();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshAndHeartbeat();
      }
    };

    const onOnline = () => {
      void refreshAndHeartbeat();
    };

    const channel = supabase
      .channel(`pharmacy_presence:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pharmacies', filter: `owner_id=eq.${userId}` },
        (payload) => {
          const row = payload?.new;
          if (!row || typeof row !== 'object') return;
          if (row.id) {
            pharmacyId = row.id;
          }
          if (Object.prototype.hasOwnProperty.call(row, 'is_on_call')) {
            isOnDuty = Boolean(row.is_on_call);
          }
        }
      )
      .subscribe();

    void refreshAndHeartbeat();
    heartbeatTimer = setInterval(() => {
      void sendHeartbeat();
    }, PHARMACY_PRESENCE_HEARTBEAT_MS);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
    }

    return () => {
      canceled = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      supabase.removeChannel(channel);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
      }
    };
  }, [hasSession, profileStatus, isPharmacistRole, userId]);

  return (
    <div className="min-h-screen bg-pharma-ice-blue">
      <Outlet />
    </div>
  );
});

// Protected Route Component
const ProtectedRoute = ({ children, requiredRole }) => {
  const {
    user,
    hasSession,
    signOut
  } = useAuthSession();
  const {
    profileError,
    profileMissing,
    profileStatus,
    isPharmacist,
    isPatient,
    bootstrapAuth
  } = useProfileState();
  const hasResolvedReadyRef = React.useRef(false);
  if (profileStatus === 'ready') {
    hasResolvedReadyRef.current = true;
  }

  if (!hasSession) {
    return <Navigate to="/signin" replace />;
  }

  if (profileError) {
    const errorMessage = profileError === 'SUPABASE_UNREACHABLE'
      ? 'Supabase is unreachable from this browser (network/DNS/project URL).'
      : 'Please try again.';

    return (
      <div className="min-h-screen bg-pharma-ice-blue flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div>
            <p className="text-pharma-dark-slate font-medium">Couldn't load profile</p>
            <p className="text-sm text-pharma-slate-grey">{errorMessage}</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm border border-pharma-grey-pale text-pharma-dark-slate hover:bg-white"
              onClick={() => bootstrapAuth()}
            >
              Retry
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm bg-pharma-teal text-white hover:bg-pharma-teal/90"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (profileStatus !== 'ready' && !hasResolvedReadyRef.current) {
    return (
      <NeutralShell>
        <NeutralSkeleton />
      </NeutralShell>
    );
  }

  if (user && profileMissing) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-pharma-dark-slate mb-2">Profile missing</p>
          <p className="text-sm text-pharma-slate-grey">Please refresh or contact support.</p>
        </div>
      </div>
    );
  }

  // Role-based routing using centralized role checks
  if (requiredRole === 'patient' && isPharmacist()) {
    return <Navigate to="/pharmacist" replace />;
  }

  if (requiredRole === 'pharmacist' && isPatient()) {
    return <Navigate to="/patient" replace />;
  }

  return children;
};

// Public Route - redirect if already logged in
const PublicRoute = ({ children }) => {
  const {
    user,
    hasSession,
    signOut
  } = useAuthSession();
  const {
    profile,
    profileError,
    profileStatus,
    isPharmacist,
    bootstrapAuth
  } = useProfileState();
  const hasResolvedReadyRef = React.useRef(false);
  if (profileStatus === 'ready') {
    hasResolvedReadyRef.current = true;
  }

  if (profileError) {
    const errorMessage = profileError === 'SUPABASE_UNREACHABLE'
      ? 'Supabase is unreachable from this browser (network/DNS/project URL).'
      : 'Please try again.';

    return (
      <div className="min-h-screen bg-pharma-ice-blue flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div>
            <p className="text-pharma-dark-slate font-medium">Couldn't load profile</p>
            <p className="text-sm text-pharma-slate-grey">{errorMessage}</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm border border-pharma-grey-pale text-pharma-dark-slate hover:bg-white"
              onClick={() => bootstrapAuth()}
            >
              Retry
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm bg-pharma-teal text-white hover:bg-pharma-teal/90"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hasSession && user && profileStatus !== 'ready' && !hasResolvedReadyRef.current) {
    return (
      <NeutralShell>
        <NeutralSkeleton />
      </NeutralShell>
    );
  }

  // If user is logged in and has a profile, redirect based on role
  if (user && profile) {
    if (isPharmacist()) {
      return <Navigate to="/pharmacist" replace />;
    }
    return <Navigate to="/patient" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={
        <PublicRoute>
          <PublicSuspense>
            <LandingPage />
          </PublicSuspense>
        </PublicRoute>
      } />
      <Route path="/learn-more" element={
        <PublicRoute>
          <PublicSuspense>
            <LearnMorePage />
          </PublicSuspense>
        </PublicRoute>
      } />
      <Route path="/terms" element={
        <PublicSuspense>
          <TermsPage />
        </PublicSuspense>
      } />
      <Route path="/privacy" element={
        <PublicSuspense>
          <PrivacyPage />
        </PublicSuspense>
      } />
      <Route path="/report-bug" element={
        <PublicSuspense>
          <ReportBugPage />
        </PublicSuspense>
      } />
      <Route path="/signin" element={
        <PublicRoute>
          <PublicSuspense>
            <SignInPage />
          </PublicSuspense>
        </PublicRoute>
      } />
      <Route path="/signup" element={
        <PublicRoute>
          <PublicSuspense>
            <SignUpPage />
          </PublicSuspense>
        </PublicRoute>
      } />
      <Route path="/verify-otp" element={
        <PublicRoute>
          <PublicSuspense>
            <VerifyOtpPage />
          </PublicSuspense>
        </PublicRoute>
      } />

      {/* Patient Routes */}
      <Route path="/patient" element={
        <ProtectedRoute requiredRole="patient">
          <PatientRoleShell />
        </ProtectedRoute>
      }>
        <Route index element={<PatientDashboard />} />
        <Route path="dashboard" element={<PatientDashboard />} />
        <Route path="favorites" element={
          <ProtectedSuspense>
            <FavoritesPage />
          </ProtectedSuspense>
        } />
        <Route path="pharmacies" element={
          <ProtectedSuspense>
            <PatientPharmaciesPage />
          </ProtectedSuspense>
        } />
        <Route path="pharmacy/:id" element={
          <ProtectedSuspense>
            <PharmacyDetailPage />
          </ProtectedSuspense>
        } />
        <Route path="reminders" element={
          <ProtectedSuspense>
            <RemindersPage />
          </ProtectedSuspense>
        } />
        <Route path="notifications" element={
          <ProtectedSuspense>
            <NotificationsPage />
          </ProtectedSuspense>
        } />
        <Route path="settings" element={<Outlet />}>
          <Route index element={
            <ProtectedSuspense>
              <SettingsPage />
            </ProtectedSuspense>
          } />
          <Route path="profile" element={
            <ProtectedSuspense>
              <SettingsProfilePage />
            </ProtectedSuspense>
          } />
          <Route path="*" element={<Navigate to="/patient/settings" replace />} />
        </Route>
      </Route>

      {/* Pharmacist Routes */}
      <Route path="/pharmacist" element={
        <ProtectedRoute requiredRole="pharmacist">
          <PharmacistRoleShell />
        </ProtectedRoute>
      }>
        <Route index element={<PharmacistDashboard />} />
        <Route path="dashboard" element={<PharmacistDashboard />} />
        <Route path="inter-pharmacy" element={
          <ProtectedSuspense>
            <InterPharmacyPage />
          </ProtectedSuspense>
        } />
        <Route path="patient-requests" element={
          <ProtectedSuspense>
            <PharmacistPatientRequestsPage />
          </ProtectedSuspense>
        } />
        <Route path="pharmacy/new" element={
          <ProtectedSuspense>
            <PharmacyCreatePage />
          </ProtectedSuspense>
        } />
        <Route path="inventory" element={
          <ProtectedSuspense>
            <InventoryPage />
          </ProtectedSuspense>
        } />
        <Route path="connections" element={
          <ProtectedSuspense>
            <PharmacistConnectionsPage />
          </ProtectedSuspense>
        } />
        <Route path="chats" element={
          <ProtectedSuspense>
            <PharmacistChatPage />
          </ProtectedSuspense>
        } />
        <Route path="chats/:conversationId" element={
          <ProtectedSuspense>
            <PharmacistChatPage />
          </ProtectedSuspense>
        } />
        <Route path="notifications" element={
          <ProtectedSuspense>
            <NotificationsPage />
          </ProtectedSuspense>
        } />
        <Route path="settings" element={<Outlet />}>
          <Route index element={
            <ProtectedSuspense>
              <SettingsPage />
            </ProtectedSuspense>
          } />
          <Route path="profile" element={
            <ProtectedSuspense>
              <SettingsProfilePage />
            </ProtectedSuspense>
          } />
          <Route path="*" element={<Navigate to="/pharmacist/settings" replace />} />
        </Route>
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  // Analytics and Emergent artifacts removed - no external runtime tooling

  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <SeniorModeProvider>
            <NotificationProvider>
              <PwaInstallProvider>
                <div className="App">
                  <AppRoutes />
                  <ToastHost />
                </div>
              </PwaInstallProvider>
            </NotificationProvider>
          </SeniorModeProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
