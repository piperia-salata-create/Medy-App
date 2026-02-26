export const PATIENT_TUTORIAL_VERSION = 1;
export const PHARMACIST_TUTORIAL_VERSION = 1;

export const PATIENT_TUTORIAL_VERSION_LOCAL_KEY = 'patient_tutorial_version_seen_local';
export const PHARMACIST_TUTORIAL_VERSION_LOCAL_KEY = 'pharmacist_tutorial_version_seen_local';

const PATIENT_TUTORIAL_STEPS = [
  {
    id: 'search',
    route: '/patient/dashboard',
    selector: '[data-tutorial="patient-search"]',
    placement: 'bottom',
    title_i18n_key: 'tutorial.patient.search.title',
    body_i18n_key: 'tutorial.patient.search.body'
  },
  {
    id: 'near-me',
    route: '/patient/dashboard',
    selector: '[data-tutorial="patient-near-me"]',
    placement: 'bottom',
    title_i18n_key: 'tutorial.patient.nearMe.title',
    body_i18n_key: 'tutorial.patient.nearMe.body'
  },
  {
    id: 'availability',
    route: '/patient/dashboard',
    selector: '[data-tutorial="patient-availability"]',
    placement: 'top',
    title_i18n_key: 'tutorial.patient.availability.title',
    body_i18n_key: 'tutorial.patient.availability.body'
  },
  {
    id: 'settings',
    route: '/patient/dashboard',
    selector: '[data-tutorial="patient-settings"]',
    placement: 'bottom',
    title_i18n_key: 'tutorial.patient.settings.title',
    body_i18n_key: 'tutorial.patient.settings.body'
  }
];

const PHARMACIST_TUTORIAL_STEPS = [
  {
    id: 'dashboard-main',
    route: '/pharmacist/dashboard',
    selector: '[data-tutorial="pharmacist-dashboard-main"]',
    placement: 'bottom',
    title_i18n_key: 'tutorial.pharmacist.dashboard.title',
    body_i18n_key: 'tutorial.pharmacist.dashboard.body'
  },
  {
    id: 'inventory',
    route: '/pharmacist/dashboard',
    selector: '[data-tutorial="pharmacist-inventory"]',
    placement: 'bottom',
    title_i18n_key: 'tutorial.pharmacist.inventory.title',
    body_i18n_key: 'tutorial.pharmacist.inventory.body'
  },
  {
    id: 'patient-requests',
    route: '/pharmacist/dashboard',
    selector: '[data-tutorial="pharmacist-patient-requests"]',
    placement: 'top',
    title_i18n_key: 'tutorial.pharmacist.patientRequests.title',
    body_i18n_key: 'tutorial.pharmacist.patientRequests.body'
  },
  {
    id: 'exchange-hub',
    route: '/pharmacist/dashboard',
    selector: '[data-tutorial="pharmacist-exchange-hub"]',
    placement: 'bottom',
    title_i18n_key: 'tutorial.pharmacist.exchangeHub.title',
    body_i18n_key: 'tutorial.pharmacist.exchangeHub.body'
  },
  {
    id: 'connections-verified',
    route: '/pharmacist/dashboard',
    selector: '[data-tutorial="pharmacist-verified-or-connections"]',
    placement: 'bottom',
    title_i18n_key: 'tutorial.pharmacist.connectionsVerified.title',
    body_i18n_key: 'tutorial.pharmacist.connectionsVerified.body'
  },
  {
    id: 'settings',
    route: '/pharmacist/dashboard',
    selector: '[data-tutorial="pharmacist-settings"]',
    placement: 'bottom',
    title_i18n_key: 'tutorial.pharmacist.settings.title',
    body_i18n_key: 'tutorial.pharmacist.settings.body'
  }
];

export const isTutorialRole = (role) => role === 'patient' || role === 'pharmacist';

export const getTutorialVersion = (role) => {
  if (role === 'patient') return PATIENT_TUTORIAL_VERSION;
  if (role === 'pharmacist') return PHARMACIST_TUTORIAL_VERSION;
  return 0;
};

export const getTutorialProfileField = (role) => {
  if (role === 'patient') return 'patient_tutorial_version_seen';
  if (role === 'pharmacist') return 'pharmacist_tutorial_version_seen';
  return null;
};

export const getTutorialLocalStorageKey = (role) => {
  if (role === 'patient') return PATIENT_TUTORIAL_VERSION_LOCAL_KEY;
  if (role === 'pharmacist') return PHARMACIST_TUTORIAL_VERSION_LOCAL_KEY;
  return null;
};

export const getTutorialSteps = (role) => {
  if (role === 'patient') return PATIENT_TUTORIAL_STEPS;
  if (role === 'pharmacist') return PHARMACIST_TUTORIAL_STEPS;
  return [];
};

export const isTutorialEntryRoute = (role, pathname = '') => {
  if (role === 'patient') {
    return pathname === '/patient' || pathname.startsWith('/patient/dashboard');
  }

  if (role === 'pharmacist') {
    return pathname === '/pharmacist' || pathname.startsWith('/pharmacist/dashboard');
  }

  return false;
};
