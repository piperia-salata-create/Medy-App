import React, { useEffect } from 'react';
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

// Contexts
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SeniorModeProvider } from "./contexts/SeniorModeContext";
import { NotificationProvider } from "./contexts/NotificationContext";

// Pages
import LandingPage from "./pages/LandingPage";
import SignInPage from "./pages/auth/SignInPage";
import SignUpPage from "./pages/auth/SignUpPage";
import VerifyOtpPage from "./pages/auth/VerifyOtpPage";
import PatientDashboard from "./pages/patient/PatientDashboard";
import FavoritesPage from "./pages/patient/FavoritesPage";
import PharmacyDetailPage from "./pages/patient/PharmacyDetailPage";
import RemindersPage from "./pages/patient/RemindersPage";
import PharmacistDashboard from "./pages/pharmacist/PharmacistDashboard";
import InterPharmacyPage from "./pages/pharmacist/InterPharmacyPage";
import SettingsPage from "./pages/shared/SettingsPage";
import NotificationsPage from "./pages/shared/NotificationsPage";

// Protected Route Component with loading timeout safeguard
const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, profile, loading, loadingTimedOut, isPharmacist, isPatient } = useAuth();

  // Show loading spinner, but with timeout safeguard
  if (loading && !loadingTimedOut) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue flex items-center justify-center">
        <div className="animate-pulse-soft">
          <div className="w-12 h-12 rounded-2xl bg-pharma-teal flex items-center justify-center">
            <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // Loading timed out - show recoverable error state
  if (loadingTimedOut && !user) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-pharma-dark-slate mb-4">Something went wrong. Please try again.</p>
          <a href="/signin" className="text-pharma-teal underline">Go to Sign In</a>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
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
  const { user, profile, loading, loadingTimedOut, isPharmacist } = useAuth();

  if (loading && !loadingTimedOut) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue flex items-center justify-center">
        <div className="animate-pulse-soft">
          <div className="w-12 h-12 rounded-2xl bg-pharma-teal" />
        </div>
      </div>
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
          <LandingPage />
        </PublicRoute>
      } />
      <Route path="/signin" element={
        <PublicRoute>
          <SignInPage />
        </PublicRoute>
      } />
      <Route path="/signup" element={
        <PublicRoute>
          <SignUpPage />
        </PublicRoute>
      } />
      <Route path="/verify-otp" element={
        <PublicRoute>
          <VerifyOtpPage />
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
          <FavoritesPage />
        </ProtectedRoute>
      } />
      <Route path="/patient/pharmacy/:id" element={
        <ProtectedRoute requiredRole="patient">
          <PharmacyDetailPage />
        </ProtectedRoute>
      } />
      <Route path="/patient/reminders" element={
        <ProtectedRoute requiredRole="patient">
          <RemindersPage />
        </ProtectedRoute>
      } />
      <Route path="/patient/notifications" element={
        <ProtectedRoute requiredRole="patient">
          <NotificationsPage />
        </ProtectedRoute>
      } />
      <Route path="/patient/settings" element={
        <ProtectedRoute requiredRole="patient">
          <SettingsPage />
        </ProtectedRoute>
      } />

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
          <InterPharmacyPage />
        </ProtectedRoute>
      } />
      <Route path="/pharmacist/notifications" element={
        <ProtectedRoute requiredRole="pharmacist">
          <NotificationsPage />
        </ProtectedRoute>
      } />
      <Route path="/pharmacist/settings" element={
        <ProtectedRoute requiredRole="pharmacist">
          <SettingsPage />
        </ProtectedRoute>
      } />

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
                <Toaster 
                  position="top-center"
                  toastOptions={{
                    style: {
                      background: '#FFFFFF',
                      border: '1px solid #E0E0E0',
                      borderRadius: '1rem',
                      boxShadow: '0 4px 12px rgba(44, 62, 80, 0.1)',
                    },
                  }}
                />
              </div>
            </NotificationProvider>
          </SeniorModeProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
