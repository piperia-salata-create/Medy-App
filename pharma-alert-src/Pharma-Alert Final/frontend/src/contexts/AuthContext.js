import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const ROLES = {
  PATIENT: 'patient',
  PHARMACIST_PENDING: 'pharmacist_pending',
  PHARMACIST_VERIFIED: 'pharmacist_verified'
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // Create user profile
  const createProfile = useCallback(async (userId, role, additionalData = {}) => {
    try {
      const profileData = {
        id: userId,
        role: role === 'pharmacist' ? ROLES.PHARMACIST_PENDING : ROLES.PATIENT,
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

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // Do not insert into profiles here; it must happen after OTP verification (session exists)
        // Optional: keep metadata if you want, but do NOT rely on it for routing
        options: {
          data: {
            // keep minimal metadata if needed; safe to remove entirely
            role: role === 'pharmacist' ? ROLES.PHARMACIST_PENDING : ROLES.PATIENT
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

  // Check if user is verified pharmacist
  const isVerifiedPharmacist = useCallback(() => {
    return profile?.role === ROLES.PHARMACIST_VERIFIED;
  }, [profile]);

  // Check if user is pending pharmacist
  const isPendingPharmacist = useCallback(() => {
    return profile?.role === ROLES.PHARMACIST_PENDING;
  }, [profile]);

  // Check if user is patient
  const isPatient = useCallback(() => {
    return profile?.role === ROLES.PATIENT;
  }, [profile]);

  // Check if user is any type of pharmacist
  const isPharmacist = useCallback(() => {
    return profile?.role === ROLES.PHARMACIST_PENDING || profile?.role === ROLES.PHARMACIST_VERIFIED;
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
    error,
    signUp,
    signIn,
    signOut,
    updateProfile,
    isVerifiedPharmacist,
    isPendingPharmacist,
    isPatient,
    isPharmacist,
    ROLES
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
