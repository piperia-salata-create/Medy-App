import React, { Suspense, lazy, memo } from 'react';
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import ToastHost from "./components/ToastHost";

// Contexts
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuthSession, useProfileState } from "./contexts/AuthContext";
import { SeniorModeProvider } from "./contexts/SeniorModeContext";
import { NotificationProvider } from "./contexts/NotificationContext";

// Pages
const LandingPage = lazy(() => import("./pages/LandingPage"));
const SignInPage = lazy(() => import("./pages/auth/SignInPage"));
const SignUpPage = lazy(() => import("./pages/auth/SignUpPage"));
const VerifyOtpPage = lazy(() => import("./pages/auth/VerifyOtpPage"));
const FavoritesPage = lazy(() => import("./pages/patient/FavoritesPage"));
const PharmacyDetailPage = lazy(() => import("./pages/patient/PharmacyDetailPage"));
const RemindersPage = lazy(() => import("./pages/patient/RemindersPage"));
const InterPharmacyPage = lazy(() => import("./pages/pharmacist/InterPharmacyPage"));
const PharmacistConnectionsPage = lazy(() => import("./pages/pharmacist/PharmacistConnectionsPage"));
const PharmacistPatientRequestsPage = lazy(() => import("./pages/pharmacist/PharmacistPatientRequestsPage"));
const PharmacyCreatePage = lazy(() => import("./pages/pharmacist/PharmacyCreatePage"));
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

const NeutralRouteFallback = () => (
  <NeutralShell>
    <NeutralSkeleton />
  </NeutralShell>
);

const ProtectedSuspense = ({ children }) => (
  <Suspense fallback={<NeutralRouteFallback />}>
    {children}
  </Suspense>
);
const PublicSuspense = ({ children }) => (
  <Suspense fallback={<div className="min-h-screen bg-pharma-ice-blue" />}>
    {children}
  </Suspense>
);

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

  if (profileStatus !== 'ready') {
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

  if (hasSession && profileStatus !== 'ready') {
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
          <PatientDashboard />
        </ProtectedRoute>
      } />
      <Route path="/patient/dashboard" element={
        <ProtectedRoute requiredRole="patient">
          <PatientDashboard />
        </ProtectedRoute>
      } />
      <Route path="/patient/favorites" element={
        <ProtectedRoute requiredRole="patient">
          <ProtectedSuspense>
            <FavoritesPage />
          </ProtectedSuspense>
        </ProtectedRoute>
      } />
      <Route path="/patient/pharmacy/:id" element={
        <ProtectedRoute requiredRole="patient">
          <ProtectedSuspense>
            <PharmacyDetailPage />
          </ProtectedSuspense>
        </ProtectedRoute>
      } />
      <Route path="/patient/reminders" element={
        <ProtectedRoute requiredRole="patient">
          <ProtectedSuspense>
            <RemindersPage />
          </ProtectedSuspense>
        </ProtectedRoute>
      } />
      <Route path="/patient/notifications" element={
        <ProtectedRoute requiredRole="patient">
          <ProtectedSuspense>
            <NotificationsPage />
          </ProtectedSuspense>
        </ProtectedRoute>
      } />
      <Route path="/patient/settings" element={
        <ProtectedRoute requiredRole="patient">
          <Outlet />
        </ProtectedRoute>
      }>
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

      {/* Pharmacist Routes */}
      <Route path="/pharmacist" element={
        <ProtectedRoute requiredRole="pharmacist">
          <PharmacistDashboard />
        </ProtectedRoute>
      } />
      <Route path="/pharmacist/dashboard" element={
        <ProtectedRoute requiredRole="pharmacist">
          <PharmacistDashboard />
        </ProtectedRoute>
      } />
      <Route path="/pharmacist/inter-pharmacy" element={
        <ProtectedRoute requiredRole="pharmacist">
          <ProtectedSuspense>
            <InterPharmacyPage />
          </ProtectedSuspense>
        </ProtectedRoute>
      } />
      <Route path="/pharmacist/patient-requests" element={
        <ProtectedRoute requiredRole="pharmacist">
          <ProtectedSuspense>
            <PharmacistPatientRequestsPage />
          </ProtectedSuspense>
        </ProtectedRoute>
      } />
      <Route path="/pharmacist/pharmacy/new" element={
        <ProtectedRoute requiredRole="pharmacist">
          <ProtectedSuspense>
            <PharmacyCreatePage />
          </ProtectedSuspense>
        </ProtectedRoute>
      } />
      <Route path="/pharmacist/connections" element={
        <ProtectedRoute requiredRole="pharmacist">
          <ProtectedSuspense>
            <PharmacistConnectionsPage />
          </ProtectedSuspense>
        </ProtectedRoute>
      } />
      <Route path="/pharmacist/notifications" element={
        <ProtectedRoute requiredRole="pharmacist">
          <ProtectedSuspense>
            <NotificationsPage />
          </ProtectedSuspense>
        </ProtectedRoute>
      } />
      <Route path="/pharmacist/settings" element={
        <ProtectedRoute requiredRole="pharmacist">
          <Outlet />
        </ProtectedRoute>
      }>
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
              <div className="App">
                <AppRoutes />
                <ToastHost />
              </div>
            </NotificationProvider>
          </SeniorModeProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
