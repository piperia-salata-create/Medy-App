import React from 'react';
import { useAuthSession, useProfileState } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

const getGreeting = (language) => {
  const hour = new Date().getHours();
  if (language === 'el') {
    if (hour < 12) return 'Καλημέρα';
    if (hour < 18) return 'Καλό απόγευμα';
    return 'Καλησπέρα';
  }
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const getHonorificLabel = (rawHonorific, language) => {
  if (!rawHonorific) return '';
  if (language === 'el') {
    return rawHonorific === 'mr' ? '?.' : '??.';
  }
  return rawHonorific === 'mr' ? 'Mr.' : 'Ms.';
};

const getDisplayName = (profile, session, user) => {
  const rawName =
    profile?.full_name ||
    session?.user?.user_metadata?.full_name ||
    user?.user_metadata?.full_name ||
    '';
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase() === 'grandpa') return '';
  return trimmed;
};

const CriticalPatientShell = () => {
  const { user, session } = useAuthSession();
  const { profile } = useProfileState();
  const { language, t } = useLanguage();

  const greeting = getGreeting(language);
  const displayName = getDisplayName(profile, session, user);
  const honorific = getHonorificLabel(
    profile?.honorific || session?.user?.user_metadata?.honorific || user?.user_metadata?.honorific || '',
    language
  );
  const fullName = [honorific, displayName].filter(Boolean).join(' ');

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="critical-patient-shell">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-pharma-grey-pale/60">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center">
          <h1 className="font-heading text-base sm:text-lg font-semibold text-pharma-dark-slate">
            {t('dashboard')}
          </h1>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="space-y-1">
          <p className="text-sm text-pharma-slate-grey">{greeting}</p>
          <p className="font-heading text-xl sm:text-2xl font-semibold text-pharma-dark-slate">
            {fullName || t('appName')}
          </p>
        </div>
        <div className="mt-5">
          <label className="text-sm font-medium text-pharma-charcoal">
            {t('searchMedicines')}
          </label>
          <input
            type="text"
            className="mt-2 w-full rounded-xl border border-pharma-grey-pale bg-white px-4 py-3 text-sm text-pharma-charcoal"
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            disabled
          />
        </div>
      </main>
    </div>
  );
};

export default CriticalPatientShell;
