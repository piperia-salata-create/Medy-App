import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, getCurrentUser } from '../lib/supabase';

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

  const setSeniorMode = useCallback(async (enabled) => {
    setSeniorModeState(enabled);
    localStorage.setItem('pharma-alert-senior-mode', enabled.toString());
    
    // Apply/remove senior-mode class to body
    if (enabled) {
      document.body.classList.add('senior-mode');
    } else {
      document.body.classList.remove('senior-mode');
    }
    
    // Try to save to user profile if logged in
    try {
      const user = await getCurrentUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ senior_mode: enabled })
          .eq('id', user.id);
      }
    } catch (error) {
      console.error('Failed to save senior mode preference:', error);
    }
  }, []);

  // Load senior mode from profile on mount
  useEffect(() => {
    const loadSeniorModeFromProfile = async () => {
      try {
        const user = await getCurrentUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('senior_mode')
            .eq('id', user.id)
            .single();
          
          if (data?.senior_mode !== undefined) {
            setSeniorModeState(data.senior_mode);
            localStorage.setItem('pharma-alert-senior-mode', data.senior_mode.toString());
            if (data.senior_mode) {
              document.body.classList.add('senior-mode');
            }
          }
        }
      } catch (error) {
        // Use local storage fallback
      }
    };

    loadSeniorModeFromProfile();
    
    // Apply initial state
    if (seniorMode) {
      document.body.classList.add('senior-mode');
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
