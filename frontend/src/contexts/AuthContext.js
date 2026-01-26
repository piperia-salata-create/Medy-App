import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Simplified roles: patient and pharmacist only
export const ROLES = {
  PATIENT: 'patient',
  PHARMACIST: 'pharmacist'
};

// Global loading timeout (10 seconds max)
const LOADING_TIMEOUT_MS = 10000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [error, setError] = useState(null);
  const loadingTimeoutRef = useRef(null);

  // Global loading safeguard - prevents spinner from showing > 10s
  useEffect(() => {
    if (loading && !loadingTimedOut) {
      loadingTimeoutRef.current = setTimeout(() => {
        console.error('AuthContext: Global loading timeout exceeded (10s). Forcing loading=false.');
        setLoading(false);
        setLoadingTimedOut(true);
      }, LOADING_TIMEOUT_MS);
    } else if (!loading && loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [loading, loadingTimedOut]);

  // Fetch user profile
  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      setProfile(data);
      return data;
    } catch (err) {
      console.error('Error fetching profile:', err);
      return null;
    }
  }, []);

  // Create user profile - stores role exactly as provided (patient or pharmacist)
  const createProfile = useCallback(async (userId, role, additionalData = {}) => {
    try {
      // Normalize role: only 'patient' or 'pharmacist' allowed
      const normalizedRole = role === 'pharmacist' ? ROLES.PHARMACIST : ROLES.PATIENT;
      
      const profileData = {
        id: userId,
        role: normalizedRole,
        language: 'el',
        senior_mode: false,
        created_at: new Date().toISOString(),
        ...additionalData
      };

      const { data, error } = await supabase
        .from('profiles')
        .insert([profileData])
        .select()
        .single();

      if (error) throw error;
      
      setProfile(data);
      return data;
    } catch (err) {
      console.error('Error creating profile:', err);
      throw err;
    }
  }, []);

  // Sign up (OTP flow: do NOT create profile here)
  const signUp = useCallback(async (email, password, role, additionalData = {}) => {
    try {
      setError(null);
      // Normalize role for metadata
      const normalizedRole = role === 'pharmacist' ? ROLES.PHARMACIST : ROLES.PATIENT;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: normalizedRole
          }
        }
      });

      if (error) throw error;

      // IMPORTANT: No createProfile here (OTP confirmation required first)
      return { data, error: null };
    } catch (err) {
      setError(err?.message || 'Sign up failed');
      return { data: null, error: err };
    }
  }, []);

  // Sign in
  const signIn = useCallback(async (email, password) => {
    try {
      setError(null);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.user) {
        await fetchProfile(data.user.id);
      }

      return { data, error: null };
    } catch (err) {
      setError(err.message);
      return { data: null, error: err };
    }
  }, [fetchProfile]);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setSession(null);
      setProfile(null);
      
      return { error: null };
    } catch (err) {
      setError(err.message);
      return { error: err };
    }
  }, []);

  // Update profile
  const updateProfile = useCallback(async (updates) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      
      setProfile(data);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }, [user]);

  // Check if user is verified pharmacist (for backward compat - now just checks pharmacist)
  const isVerifiedPharmacist = useCallback(() => {
    return profile?.role === ROLES.PHARMACIST;
  }, [profile]);

  // Check if user is pending pharmacist (deprecated - returns false now)
  const isPendingPharmacist = useCallback(() => {
    return false; // No more pending state
  }, []);

  // Check if user is patient
  const isPatient = useCallback(() => {
    return profile?.role === ROLES.PATIENT;
  }, [profile]);

  // Check if user is any type of pharmacist
  const isPharmacist = useCallback(() => {
    return profile?.role === ROLES.PHARMACIST;
  }, [profile]);

  // Centralized role resolver - single source of truth
  const getRole = useCallback(() => {
    return profile?.role || null;
  }, [profile]);

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session || null);
        
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session || null);
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  const value = {
    user,
    session,
    profile,
    loading,
    loadingTimedOut,
    error,
    signUp,
    signIn,
    signOut,
    updateProfile,
    createProfile,
    fetchProfile,
    isVerifiedPharmacist,
    isPendingPharmacist,
    isPatient,
    isPharmacist,
    getRole,
    ROLES
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
