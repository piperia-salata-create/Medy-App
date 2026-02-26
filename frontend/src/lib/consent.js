export const CONSENT_STORAGE_KEY = 'medy_consent_v1';
export const CONSENT_VERSION = 1;
export const CONSENT_OPEN_EVENT = 'medy:open-consent-preferences';

const defaultConsent = {
  necessary: true,
  analytics: false,
  marketing: false,
  ts: 0,
  version: CONSENT_VERSION
};

const normalizeConsent = (value = {}, includeFreshTimestamp = false) => {
  const next = {
    necessary: true,
    analytics: Boolean(value?.analytics),
    marketing: Boolean(value?.marketing),
    ts: Number.isFinite(Number(value?.ts)) ? Number(value.ts) : 0,
    version: CONSENT_VERSION
  };

  if (includeFreshTimestamp || next.ts <= 0) {
    next.ts = Date.now();
  }

  return next;
};

export const hasStoredConsent = () => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return typeof raw === 'string' && raw.trim().length > 0;
  } catch (error) {
    return false;
  }
};

export const getConsent = () => {
  if (typeof window === 'undefined') {
    return { ...defaultConsent };
  }

  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) {
      return { ...defaultConsent };
    }

    const parsed = JSON.parse(raw);
    return normalizeConsent(parsed, false);
  } catch (error) {
    return { ...defaultConsent };
  }
};

export const setConsent = (consentObj = {}) => {
  const normalized = normalizeConsent(consentObj, true);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      // Ignore write failures and return normalized shape for caller use.
    }
  }

  return normalized;
};

export const hasAnalyticsConsent = () => Boolean(getConsent().analytics);

export const hasMarketingConsent = () => Boolean(getConsent().marketing);

export const openConsentPreferences = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
};

