import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';

const DEBUG_AUTH = false;
const PROFILE_SELECT_FIELDS = 'id, role, full_name, honorific, pharmacy_name, email';

const AuthContext = createContext();
const AuthSessionContext = createContext();
const ProfileContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthSession = () => {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error('useAuthSession must be used within an AuthProvider');
  }
  return context;
};

export const useProfileState = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfileState must be used within an AuthProvider');
  }
  return context;
};

// Simplified roles: patient and pharmacist only
export const ROLES = {
  PATIENT: 'patient',
  PHARMACIST: 'pharmacist'
};

let timeLabelCounter = 0;

const timed = async (label, promise) => {
  const uniqueLabel = DEBUG_AUTH ? `${label}#${++timeLabelCounter}` : label;
  if (DEBUG_AUTH) {
    console.time(uniqueLabel);
  }
  try {
    return await promise;
  } finally {
    if (DEBUG_AUTH) {
      console.timeEnd(uniqueLabel);
    }
  }
};

const logStep = (step, details = {}) => {
  if (!DEBUG_AUTH) return;
  console.info(`[auth] ${step}`, details);
};

const startDiagnostics = (label, context = {}, isActive) => {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  let done = false;
  let warn3s;
  let warn10s;

  if (DEBUG_AUTH) {
    console.info(`[auth] ${label}:start`, { ...context, startedAt, startedAtIso });
  }

  warn3s = setTimeout(() => {
    if (done || !DEBUG_AUTH) return;
    if (typeof isActive === 'function' && !isActive()) return;
    console.warn(`[auth] ${label}:pending`, { ...context, pendingForMs: 3000, startedAt, startedAtIso });
  }, 3000);

  warn10s = setTimeout(() => {
    if (done || !DEBUG_AUTH) return;
    if (typeof isActive === 'function' && !isActive()) return;
    console.warn(`[auth] ${label}:pending`, { ...context, pendingForMs: 10000, startedAt, startedAtIso });
  }, 10000);

  return (result = {}) => {
    if (done) return;
    done = true;
    clearTimeout(warn3s);
    clearTimeout(warn10s);
    const endedAt = Date.now();
    const endedAtIso = new Date(endedAt).toISOString();
    if (DEBUG_AUTH) {
      console.info(`[auth] ${label}:end`, {
        ...context,
        startedAt,
        startedAtIso,
        endedAt,
        endedAtIso,
        durationMs: endedAt - startedAt,
        active: typeof isActive === 'function' ? isActive() : true,
        ...result
      });
    }
  };
};

const getInitialHasSession = () => {
  if (typeof window === 'undefined') return false;
  if (!supabaseUrl) return false;
  try {
    const match = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/i);
    if (!match) return false;
    const storageKey = `sb-${match[1]}-auth-token`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.access_token);
  } catch (err) {
    return false;
  }
};

export const AuthProvider = ({ children }) => {
  const initialHasSession = getInitialHasSession();
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [hasSession, setHasSession] = useState(initialHasSession);
  const [profileStatus, setProfileStatus] = useState(initialHasSession ? 'loading' : 'idle');
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [error, setError] = useState(null);
  const initAuthRef = useRef(false);
  const profileLoadCounterRef = useRef(0);
  const isMountedRef = useRef(true);
  const bootstrapRunIdRef = useRef(0);
  const bootstrapInFlightRef = useRef(null);
  const safetyRunIdRef = useRef(0);
  const loggedSupabaseRef = useRef(false);
  const sessionRef = useRef(null);
  const healthDiagnosticsRunRef = useRef(null);

  const healthTimeoutMs = 5000;

  const fetchWithTimeout = useCallback(async (url, options, timeoutMs, label, context = {}, isActive) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const diagEnd = startDiagnostics(label, { url, ...context }, isActive);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      diagEnd({ ok: true, status: response.status, statusText: response.statusText });
      return { ok: true, status: response.status, statusText: response.statusText };
    } catch (err) {
      const isAbort = err?.name === 'AbortError';
      if (DEBUG_AUTH) {
        console.warn(`[auth] ${label}:error`, {
          url,
          aborted: isAbort,
          message: err?.message
        });
      }
      diagEnd({ ok: false, aborted: isAbort, error: err?.message || 'fetch_failed' });
      return { ok: false, aborted: isAbort, error: err };
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const checkSupabaseHealth = useCallback(async (currentSession, meta = {}) => {
    const bootstrapId = meta?.bootstrapId || null;
    const isActive = meta?.isActive;
    if (!supabaseUrl || !supabaseAnonKey) {
      return { ok: false, unreachable: true, reason: 'missing_config' };
    }

    const baseUrl = supabaseUrl.replace(/\/$/, '');
    const authHeaders = currentSession?.access_token
      ? { Authorization: `Bearer ${currentSession.access_token}` }
      : {};
    const headers = { apikey: supabaseAnonKey, ...authHeaders };
    const authHealthUrl = `${baseUrl}/auth/v1/health`;
    const restRootUrl = `${baseUrl}/rest/v1/`;
    const profilePingUrl = `${baseUrl}/rest/v1/profiles?select=id&limit=1`;

    const authHealth = await fetchWithTimeout(
      authHealthUrl,
      { method: 'GET', headers },
      healthTimeoutMs,
      'health:auth',
      { bootstrapId },
      isActive
    );
    if (!authHealth.ok) {
      return { ok: false, unreachable: true, step: 'auth', ...authHealth };
    }

    const restHealth = await fetchWithTimeout(
      restRootUrl,
      { method: 'GET', headers },
      healthTimeoutMs,
      'health:rest',
      { bootstrapId },
      isActive
    );
    if (!restHealth.ok) {
      return { ok: false, unreachable: true, step: 'rest', ...restHealth };
    }

    if (currentSession?.access_token) {
      const profileHealth = await fetchWithTimeout(
        profilePingUrl,
        {
          method: 'GET',
          headers
        },
        healthTimeoutMs,
        'health:profiles',
        { bootstrapId },
        isActive
      );
      if (!profileHealth.ok) {
        return { ok: false, unreachable: true, step: 'profiles', ...profileHealth };
      }
    }

    return { ok: true };
  }, [fetchWithTimeout, healthTimeoutMs]);

  const triggerHealthDiagnostics = useCallback(async (reason, meta = {}) => {
    if (!DEBUG_AUTH) return;
    const runId = meta?.runId || meta?.bootstrapId || 'unknown';
    if (healthDiagnosticsRunRef.current === runId) return;
    const isActive = meta?.isActive;
    if (typeof isActive === 'function' && !isActive()) return;
    healthDiagnosticsRunRef.current = runId;
    logStep('healthCheck:trigger', { reason, runId });
    const activeSession = meta?.session || sessionRef.current;
    const healthStatus = await checkSupabaseHealth(activeSession, { bootstrapId: meta?.bootstrapId, isActive });
    if (healthStatus?.unreachable && (!isActive || isActive())) {
      setProfileError('SUPABASE_UNREACHABLE');
      setProfileStatus('error');
      setProfileLoading(false);
      setLoading(false);
      setAuthReady(true);
    }
  }, [checkSupabaseHealth]);

  // Fetch user profile - creates if missing using metadata role
  async function fetchProfileImpl(userId, source = 'unknown', meta = {}) {
    if (!userId) return null;
    if (!isMountedRef.current) return null;
    logStep('fetchProfile:start', { source });
    const requestId = profileLoadCounterRef.current + 1;
    profileLoadCounterRef.current = requestId;
    const runId = meta?.runId || null;
    const isActiveRequest = () => {
      if (!isMountedRef.current) return false;
      if (profileLoadCounterRef.current !== requestId) return false;
      if (runId && bootstrapRunIdRef.current !== runId) return false;
      return true;
    };
    const bootstrapId = meta?.bootstrapId || null;
    const diagEnd = startDiagnostics('fetchProfile', { requestId, source, bootstrapId, runId }, isActiveRequest);
    const activeSession = meta?.session || sessionRef.current;
    let pendingDiagnosticsTimer;
    if (isActiveRequest()) {
      setProfileStatus('loading');
      setProfileLoading(true);
      setProfileError(null);
      setProfileMissing(false);
    }
    if (DEBUG_AUTH) {
      pendingDiagnosticsTimer = setTimeout(() => {
        if (!isActiveRequest()) return;
        triggerHealthDiagnostics('pending>3s', {
          bootstrapId,
          runId,
          session: activeSession,
          isActive: isActiveRequest
        });
      }, 3000);
    }
    if (DEBUG_AUTH) {
      console.info('[auth] fetchProfile query', {
        table: 'profiles',
        filters: { id: userId },
        source,
        requestId,
        bootstrapId,
        runId
      });
    }
    try {
      const selectDiagEnd = startDiagnostics('fetchProfile:select', { requestId, source, bootstrapId, runId }, isActiveRequest);
      const { data, error, status, statusText } = await timed(
        'auth:fetchProfile:select',
        supabase
          .from('profiles')
          .select(PROFILE_SELECT_FIELDS)
          .eq('id', userId)
          .maybeSingle()
      );
      selectDiagEnd({
        ok: !error,
        status,
        statusText,
        hasData: Boolean(data)
      });

      if (error) {
        if (DEBUG_AUTH) {
          console.info('[auth] fetchProfile error', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            status,
            statusText
          });
        }
        logStep('fetchProfile:select:error', { source, code: error.code, status: error.status });
        if (isActiveRequest()) {
          setProfile(null);
          setProfileError(error?.message || 'Failed to load profile.');
          setProfileStatus('error');
        }
        triggerHealthDiagnostics('fetchProfile:error', {
          bootstrapId,
          runId,
          session: activeSession,
          isActive: isActiveRequest
        });
        diagEnd({ ok: false, status, statusText, errorCode: error.code || null });
        throw error;
      }

      if (DEBUG_AUTH) {
        console.info('[auth] fetchProfile result', {
          status,
          statusText,
          hasData: Boolean(data),
          id: data?.id || null
        });
      }

      if (!data) {
        if (isActiveRequest()) {
          setProfileMissing(true);
        }
        // Profile doesn't exist - this can happen if trigger didn't fire
        // Get current user to read metadata
        const getUserDiagEnd = startDiagnostics('fetchProfile:getUser', { requestId, source, bootstrapId, runId }, isActiveRequest);
        const { data: userData, error: userError } = await timed(
          'auth:fetchProfile:getUser',
          supabase.auth.getUser()
        );
        getUserDiagEnd({ ok: !userError, hasUser: Boolean(userData?.user) });

        if (userError) {
          logStep('fetchProfile:getUser:error', { source, code: userError.code, status: userError.status });
          if (isActiveRequest()) {
            setProfile(null);
            setProfileError(userError?.message || 'Failed to load profile.');
            setProfileMissing(false);
            setProfileStatus('error');
          }
          triggerHealthDiagnostics('fetchProfile:error', {
            bootstrapId,
            runId,
            session: activeSession,
            isActive: isActiveRequest
          });
          diagEnd({ ok: false, errorCode: userError.code || null });
          return null;
        }

        const currentUser = userData?.user;
        const metadataRole = currentUser?.user_metadata?.role;
        const finalRole = (metadataRole === 'pharmacist') ? 'pharmacist' : 'patient';

        logStep('fetchProfile:create', { source, role: finalRole });

        // Create or ensure profile with role from metadata
        const createDiagEnd = startDiagnostics('fetchProfile:createProfile', { requestId, source, bootstrapId, runId }, isActiveRequest);
        const { data: newProfile, error: createError } = await timed(
          'auth:fetchProfile:createProfile',
          supabase
            .from('profiles')
            .upsert([{
              id: userId,
              role: finalRole,
              email: currentUser?.email,
              full_name: currentUser?.user_metadata?.full_name || '',
              pharmacy_name: currentUser?.user_metadata?.pharmacy_name || null,
              language: 'el',
              senior_mode: false
            }], { onConflict: 'id' })
            .select()
            .single()
        );
        createDiagEnd({ ok: !createError, hasData: Boolean(newProfile) });

        if (createError) {
          logStep('fetchProfile:create:error', { source, code: createError.code, status: createError.status });
          if (DEBUG_AUTH) {
            console.error('fetchProfile: create profile failed', {
              message: createError?.message,
              code: createError?.code,
              status: createError?.status
            });
          }
          if (isActiveRequest()) {
            setProfile(null);
            setProfileError(createError?.message || 'Failed to create profile.');
            setProfileMissing(false);
            setProfileStatus('error');
          }
          triggerHealthDiagnostics('fetchProfile:error', {
            bootstrapId,
            runId,
            session: activeSession,
            isActive: isActiveRequest
          });
          diagEnd({ ok: false, errorCode: createError.code || null });
          return null;
        }

        if (DEBUG_AUTH) {
          console.log('[auth] profile ensured via upsert', { userId, source });
        }
        if (isActiveRequest()) {
          setProfile(newProfile);
          setProfileError(null);
          setProfileMissing(false);
          setProfileStatus('ready');
        }
        logStep('fetchProfile:success', { source, created: true });
        diagEnd({ ok: true, created: true });
        return newProfile;
      }

      if (isActiveRequest()) {
        setProfile(data);
        setProfileError(null);
        setProfileMissing(false);
        setProfileStatus('ready');
      }
      logStep('fetchProfile:success', { source, created: false });
      diagEnd({ ok: true, created: false });
      return data;
    } catch (err) {
      logStep('fetchProfile:error', { source, name: err?.name, message: err?.message });
      if (isActiveRequest()) {
        setProfile(null);
        setProfileError(err?.message || 'Failed to load profile.');
        setProfileMissing(false);
        setProfileStatus('error');
      }
      triggerHealthDiagnostics('fetchProfile:error', {
        bootstrapId,
        runId,
        session: activeSession,
        isActive: isActiveRequest
      });
      diagEnd({ ok: false, errorCode: err?.code || null });
      return null;
    } finally {
      if (pendingDiagnosticsTimer) {
        clearTimeout(pendingDiagnosticsTimer);
      }
      if (isMountedRef.current && profileLoadCounterRef.current === requestId) {
        setProfileLoading(false);
      }
    }
  }

  const fetchProfile = useCallback(fetchProfileImpl, [triggerHealthDiagnostics]);

  async function bootstrapAuthImpl() {
    if (!isMountedRef.current) return;
    if (bootstrapInFlightRef.current) return bootstrapInFlightRef.current;

    const bootstrapId = bootstrapRunIdRef.current + 1;
    bootstrapRunIdRef.current = bootstrapId;
    const isActiveRun = () => isMountedRef.current && bootstrapRunIdRef.current === bootstrapId;

    const runPromise = (async () => {
      logStep('bootstrap:start', { bootstrapId });
      if (isActiveRun()) {
        setAuthReady(false);
        setProfileLoading(false);
        setProfileError(null);
        setProfileMissing(false);
        setLoading(true);
      }

      try {
        if (DEBUG_AUTH && !loggedSupabaseRef.current) {
          loggedSupabaseRef.current = true;
          console.info('[auth] supabaseUrl', supabaseUrl);
        }
        const getSessionDiagEnd = startDiagnostics('getSession', { bootstrapId }, isActiveRun);
        const { data, error } = await timed(
          'auth:bootstrap:getSession',
          supabase.auth.getSession()
        );
        getSessionDiagEnd({ ok: !error, hasSession: Boolean(data?.session) });

        if (!isActiveRun()) return;

        if (error) {
          logStep('bootstrap:getSession:error', { code: error.code, status: error.status });
        }

        const nextSession = data?.session || null;
        setSession(nextSession);
        setHasSession(Boolean(nextSession));
        sessionRef.current = nextSession;

        if (!nextSession?.user) {
          setUser(null);
          setProfile(null);
          setProfileError(null);
          setProfileMissing(false);
          setProfileStatus('idle');
          logStep('bootstrap:session', { hasUser: false });
          return;
        }

        setUser(nextSession.user);
        logStep('bootstrap:session', { hasUser: true });
        setProfileStatus('loading');
        setProfileLoading(true);
        await fetchProfile(nextSession.user.id, 'bootstrap', {
          bootstrapId,
          runId: bootstrapId,
          session: nextSession
        });
      } catch (err) {
        logStep('bootstrap:error', { bootstrapId, name: err?.name, message: err?.message });
      } finally {
        if (isActiveRun()) {
          setProfileLoading(false);
          setLoading(false);
          setAuthReady(true);
        }
        logStep('bootstrap:end', { bootstrapId, loading: false });
      }
    })();

    bootstrapInFlightRef.current = runPromise;
    return runPromise.finally(() => {
      if (bootstrapInFlightRef.current === runPromise) {
        bootstrapInFlightRef.current = null;
      }
    });
  }

  const bootstrapAuth = useCallback(bootstrapAuthImpl, [fetchProfile]);

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

      const { data, error } = await timed(
        'auth:createProfile',
        supabase
          .from('profiles')
          .insert([profileData])
          .select()
          .single()
      );

      if (error) {
        throw error;
      }
      
      setProfile(data);
      setProfileMissing(false);
      setProfileStatus('ready');
      return data;
    } catch (err) {
      if (DEBUG_AUTH) {
        console.error('createProfile failed (profiles.insert):', {
          message: err?.message,
          code: err?.code,
          status: err?.status
        });
      }
      throw err;
    }
  }, []);

  // Sign up (OTP flow: do NOT create profile here)
  const signUp = useCallback(async (email, password, role, additionalData = {}) => {
    try {
      setError(null);
      // Normalize role for metadata
      const normalizedRole = role === 'pharmacist' ? ROLES.PHARMACIST : ROLES.PATIENT;

      const { data, error } = await timed(
        'auth:signUp',
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: normalizedRole
            }
          }
        })
      );

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
      
      const { data, error } = await timed(
        'auth:signIn',
        supabase.auth.signInWithPassword({
          email,
          password
        })
      );

      if (error) throw error;

      if (data.user) {
        setHasSession(true);
        await fetchProfile(data.user.id, 'signIn');
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
      const { error } = await timed(
        'auth:signOut',
        supabase.auth.signOut()
      );
      if (error) throw error;
      
      setUser(null);
      setSession(null);
      setProfile(null);
      setHasSession(false);
      setProfileStatus('idle');
      setProfileError(null);
      setProfileMissing(false);
      
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
      const { data, error } = await timed(
        'auth:updateProfile',
        supabase
          .from('profiles')
          .update(updates)
          .eq('id', user.id)
          .select()
          .single()
      );

      if (error) throw error;
      
      setProfile(data);
      return { data, error: null };
    } catch (err) {
      if (DEBUG_AUTH) {
        console.error('updateProfile failed (profiles.update):', {
          message: err?.message,
          code: err?.code,
          status: err?.status
        });
      }
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
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    isMountedRef.current = true;
    if (initAuthRef.current) return;
    initAuthRef.current = true;
    bootstrapAuth();
    return () => {
      isMountedRef.current = false;
    };
  }, [bootstrapAuth]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      logStep('authStateChange', { event, hasSession: !!session, hasUser: !!session?.user });
      if (!isMountedRef.current) return;

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setHasSession(false);
        setProfileStatus('idle');
        setProfileError(null);
        setProfileMissing(false);
        setProfileLoading(false);
        setAuthReady(true);
        return;
      }

      setSession(session || null);
      setUser(session?.user || null);
      setHasSession(Boolean(session));
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (profileStatus !== 'loading') return;
    const safetyId = safetyRunIdRef.current + 1;
    safetyRunIdRef.current = safetyId;
    const safetyTimer = setTimeout(() => {
      if (!isMountedRef.current) return;
      if (safetyRunIdRef.current !== safetyId) return;
      if (profileStatus === 'loading') {
        if (DEBUG_AUTH) {
          console.warn('[auth] ui-safety triggered', {
            profileStatus,
            hasUser: Boolean(user)
          });
        }
        setProfileError('PROFILE_LOAD_STUCK');
        setProfileStatus('error');
        setProfileLoading(false);
        setLoading(false);
        setAuthReady(true);
      }
    }, 12000);

    return () => {
      clearTimeout(safetyTimer);
    };
  }, [profileStatus, user]);

  const authSessionValue = useMemo(() => ({
    user,
    session,
    hasSession,
    authReady,
    loading,
    error,
    signUp,
    signIn,
    signOut
  }), [
    user,
    session,
    hasSession,
    authReady,
    loading,
    error,
    signUp,
    signIn,
    signOut
  ]);

  const profileValue = useMemo(() => ({
    profile,
    profileStatus,
    profileLoading,
    profileError,
    profileMissing,
    fetchProfile,
    bootstrapAuth,
    createProfile,
    updateProfile,
    isVerifiedPharmacist,
    isPendingPharmacist,
    isPatient,
    isPharmacist,
    getRole
  }), [
    profile,
    profileStatus,
    profileLoading,
    profileError,
    profileMissing,
    fetchProfile,
    bootstrapAuth,
    createProfile,
    updateProfile,
    isVerifiedPharmacist,
    isPendingPharmacist,
    isPatient,
    isPharmacist,
    getRole
  ]);

  const value = useMemo(() => ({
    user,
    session,
    profile,
    hasSession,
    profileStatus,
    loading,
    authReady,
    profileLoading,
    profileError,
    profileMissing,
    error,
    signUp,
    signIn,
    signOut,
    updateProfile,
    createProfile,
    fetchProfile,
    bootstrapAuth,
    isVerifiedPharmacist,
    isPendingPharmacist,
    isPatient,
    isPharmacist,
    getRole,
    ROLES
  }), [
    user,
    session,
    profile,
    hasSession,
    profileStatus,
    loading,
    authReady,
    profileLoading,
    profileError,
    profileMissing,
    error,
    signUp,
    signIn,
    signOut,
    updateProfile,
    createProfile,
    fetchProfile,
    bootstrapAuth,
    isVerifiedPharmacist,
    isPendingPharmacist,
    isPatient,
    isPharmacist,
    getRole
  ]);

  return (
    <AuthSessionContext.Provider value={authSessionValue}>
      <ProfileContext.Provider value={profileValue}>
        <AuthContext.Provider value={value}>
          {children}
        </AuthContext.Provider>
      </ProfileContext.Provider>
    </AuthSessionContext.Provider>
  );
};
