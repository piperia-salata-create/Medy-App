import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, getCurrentUser } from '../lib/supabase';

const isDev = process.env.NODE_ENV !== 'production';

const SeniorModeContext = createContext();

export const useSeniorMode = () => {
  const context = useContext(SeniorModeContext);
  if (!context) {
    throw new Error('useSeniorMode must be used within a SeniorModeProvider');
  }
  return context;
};

export const SeniorModeProvider = ({ children }) => {
  const [seniorMode, setSeniorModeState] = useState(() => {
    const saved = localStorage.getItem('pharma-alert-senior-mode');
    return saved === 'true';
  });

  const setSeniorModeLocal = useCallback((enabled) => {
    setSeniorModeState(enabled);
    localStorage.setItem('pharma-alert-senior-mode', enabled.toString());
  }, []);

  const setSeniorMode = useCallback(async (enabled) => {
    const previous = seniorMode;
    setSeniorModeLocal(enabled);

    try {
      const user = await getCurrentUser();
      if (user) {
        const { error } = await supabase
          .from('profiles')
          .update({ senior_mode: enabled })
          .eq('id', user.id);
        if (error) throw error;
      }
    } catch (error) {
      if (isDev) {
        console.log('[senior-mode] update failed, reverting', error);
      }
      setSeniorModeLocal(previous);
    }
  }, [seniorMode, setSeniorModeLocal]);

  // Load senior mode from profile on mount
  useEffect(() => {
    const loadSeniorModeFromProfile = async () => {
      try {
        const user = await getCurrentUser();
        if (user) {
          const { data, error } = await supabase
            .from('profiles')
            .select('senior_mode')
            .eq('id', user.id)
            .maybeSingle();

          if (error) throw error;
          if (!data) return;
          
          if (typeof data?.senior_mode === 'boolean') {
            setSeniorModeState((prev) => {
              if (prev === data.senior_mode) return prev;
              if (isDev) {
                console.log('[senior-mode] sync from profile', { from: prev, to: data.senior_mode });
              }
              localStorage.setItem('pharma-alert-senior-mode', data.senior_mode.toString());
              return data.senior_mode;
            });
          }
        }
      } catch (error) {
        // Use local storage fallback
      }
    };

    loadSeniorModeFromProfile();

    if (isDev) {
      console.log('[senior-mode] initial load');
    }
  }, []);

  // Apply/remove senior-mode class based on state
  useEffect(() => {
    if (seniorMode) {
      document.body.classList.add('senior-mode');
    } else {
      document.body.classList.remove('senior-mode');
    }
  }, [seniorMode]);

  const value = {
    seniorMode,
    setSeniorMode,
    toggleSeniorMode: () => setSeniorMode(!seniorMode)
  };

  return (
    <SeniorModeContext.Provider value={value}>
      {children}
    </SeniorModeContext.Provider>
  );
};
