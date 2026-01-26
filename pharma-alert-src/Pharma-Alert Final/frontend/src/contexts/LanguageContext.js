import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, getCurrentUser } from '../lib/supabase';

const translations = {
  el: {
    // Common
    appName: 'Pharma-Alert',
    loading: 'Φόρτωση...',
    save: 'Αποθήκευση',
    cancel: 'Ακύρωση',
    confirm: 'Επιβεβαίωση',
    delete: 'Διαγραφή',
    edit: 'Επεξεργασία',
    close: 'Κλείσιμο',
    search: 'Αναζήτηση',
    back: 'Πίσω',
    next: 'Επόμενο',
    previous: 'Προηγούμενο',
    all: 'Όλα',
    none: 'Κανένα',
    yes: 'Ναι',
    no: 'Όχι',
    
    // Auth
    signIn: 'Σύνδεση',
    signUp: 'Εγγραφή',
    signOut: 'Αποσύνδεση',
    email: 'Email',
    password: 'Κωδικός',
    confirmPassword: 'Επιβεβαίωση Κωδικού',
    forgotPassword: 'Ξέχασα τον κωδικό μου',
    resetPassword: 'Επαναφορά Κωδικού',
    createAccount: 'Δημιουργία Λογαριασμού',
    alreadyHaveAccount: 'Έχετε ήδη λογαριασμό;',
    dontHaveAccount: 'Δεν έχετε λογαριασμό;',
    
    // Roles
    patient: 'Ασθενής',
    pharmacist: 'Φαρμακοποιός',
    selectRole: 'Επιλέξτε τον ρόλο σας',
    rolePatientDesc: 'Αναζήτηση φαρμάκων και φαρμακείων',
    rolePharmacistDesc: 'Διαχείριση αποθέματος φαρμακείου',
    
    // Navigation
    home: 'Αρχική',
    dashboard: 'Πίνακας Ελέγχου',
    pharmacies: 'Φαρμακεία',
    medicines: 'Φάρμακα',
    favorites: 'Αγαπημένα',
    alerts: 'Ειδοποιήσεις',
    notifications: 'Ειδοποιήσεις',
    settings: 'Ρυθμίσεις',
    profile: 'Προφίλ',
    
    // Patient Dashboard
    searchMedicines: 'Αναζήτηση Φαρμάκων',
    searchPlaceholder: 'Πληκτρολογήστε όνομα φαρμάκου...',
    nearbyPharmacies: 'Κοντινά Φαρμακεία',
    viewAll: 'Προβολή Όλων',
    noResults: 'Δεν βρέθηκαν αποτελέσματα',
    
    // Availability Status
    available: 'Διαθέσιμο',
    limited: 'Περιορισμένο',
    unavailable: 'Μη Διαθέσιμο',
    
    // Pharmacy
    pharmacyDetails: 'Στοιχεία Φαρμακείου',
    openingHours: 'Ώρες Λειτουργίας',
    onCallSchedule: 'Πρόγραμμα Εφημερίας',
    phone: 'Τηλέφωνο',
    address: 'Διεύθυνση',
    callNow: 'Κλήση Τώρα',
    getDirections: 'Οδηγίες',
    addToFavorites: 'Προσθήκη στα Αγαπημένα',
    removeFromFavorites: 'Αφαίρεση από Αγαπημένα',
    
    // Pharmacist Dashboard
    stockManagement: 'Διαχείριση Αποθέματος',
    updateStock: 'Ενημέρωση Αποθέματος',
    bulkUpdate: 'Μαζική Ενημέρωση',
    demandSignals: 'Σήματα Ζήτησης',
    analytics: 'Αναλυτικά',
    interPharmacy: 'Διαφαρμακευτική Επικοινωνία',
    
    // Pharmacist Verification
    pendingVerification: 'Εκκρεμεί Επαλήθευση',
    pendingVerificationDesc: 'Ο λογαριασμός σας αναμένει έγκριση από διαχειριστή.',
    verified: 'Επαληθευμένο',
    
    // Settings
    language: 'Γλώσσα',
    greek: 'Ελληνικά',
    english: 'Αγγλικά',
    seniorMode: 'Λειτουργία Ηλικιωμένων',
    seniorModeDesc: 'Προαιρετικό - Μεγαλύτερο κείμενο και απλοποιημένη διεπαφή',
    pushNotifications: 'Ειδοποιήσεις Push',
    pushNotificationsNote: 'Οι ειδοποιήσεις push όταν η εφαρμογή είναι κλειστή απαιτούν μελλοντική έκδοση από το Store.',
    
    // Notifications
    notificationCenter: 'Κέντρο Ειδοποιήσεων',
    noNotifications: 'Δεν υπάρχουν ειδοποιήσεις',
    markAllRead: 'Επισήμανση Όλων ως Αναγνωσμένα',
    
    // Medication Reminders
    medicationReminders: 'Υπενθυμίσεις Φαρμακευτικής Αγωγής',
    addReminder: 'Προσθήκη Υπενθύμισης',
    reminderTime: 'Ώρα Υπενθύμισης',
    reminderFrequency: 'Συχνότητα',
    daily: 'Καθημερινά',
    weekly: 'Εβδομαδιαία',
    
    // Errors
    errorOccurred: 'Παρουσιάστηκε σφάλμα',
    tryAgain: 'Δοκιμάστε ξανά',
    networkError: 'Σφάλμα σύνδεσης',
    
    // Landing
    heroTitle: 'Βρες Φάρμακα Κοντά Σου',
    heroSubtitle: 'Αναζήτηση διαθεσιμότητας φαρμάκων σε φαρμακεία της περιοχής σου σε πραγματικό χρόνο',
    getStarted: 'Ξεκινήστε',
    learnMore: 'Μάθετε Περισσότερα',
    
    // Features
    features: 'Δυνατότητες',
    featureRealtime: 'Ενημερώσεις σε Πραγματικό Χρόνο',
    featureRealtimeDesc: 'Δείτε τη διαθεσιμότητα φαρμάκων άμεσα',
    featureAlerts: 'Έξυπνες Ειδοποιήσεις',
    featureAlertsDesc: 'Ενημερωθείτε όταν ένα φάρμακο γίνει διαθέσιμο',
    featureSenior: 'Λειτουργία Ηλικιωμένων',
    featureSeniorDesc: 'Απλοποιημένη διεπαφή με μεγάλα γράμματα',
    
    // Stock Request
    requestStock: 'Αίτημα Αποθέματος',
    sendRequest: 'Αποστολή Αιτήματος',
    requestSent: 'Το αίτημα στάλθηκε',
    
    // Install PWA
    installApp: 'Εγκατάσταση Εφαρμογής',
    installAppDesc: 'Εγκαταστήστε την εφαρμογή για γρήγορη πρόσβαση',
  },
  en: {
    // Common
    appName: 'Pharma-Alert',
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    search: 'Search',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    all: 'All',
    none: 'None',
    yes: 'Yes',
    no: 'No',
    
    // Auth
    signIn: 'Sign In',
    signUp: 'Sign Up',
    signOut: 'Sign Out',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    forgotPassword: 'Forgot Password',
    resetPassword: 'Reset Password',
    createAccount: 'Create Account',
    alreadyHaveAccount: 'Already have an account?',
    dontHaveAccount: "Don't have an account?",
    
    // Roles
    patient: 'Patient',
    pharmacist: 'Pharmacist',
    selectRole: 'Select Your Role',
    rolePatientDesc: 'Search for medicines and pharmacies',
    rolePharmacistDesc: 'Manage pharmacy inventory',
    
    // Navigation
    home: 'Home',
    dashboard: 'Dashboard',
    pharmacies: 'Pharmacies',
    medicines: 'Medicines',
    favorites: 'Favorites',
    alerts: 'Alerts',
    notifications: 'Notifications',
    settings: 'Settings',
    profile: 'Profile',
    
    // Patient Dashboard
    searchMedicines: 'Search Medicines',
    searchPlaceholder: 'Type medicine name...',
    nearbyPharmacies: 'Nearby Pharmacies',
    viewAll: 'View All',
    noResults: 'No results found',
    
    // Availability Status
    available: 'Available',
    limited: 'Limited',
    unavailable: 'Unavailable',
    
    // Pharmacy
    pharmacyDetails: 'Pharmacy Details',
    openingHours: 'Opening Hours',
    onCallSchedule: 'On-Call Schedule',
    phone: 'Phone',
    address: 'Address',
    callNow: 'Call Now',
    getDirections: 'Get Directions',
    addToFavorites: 'Add to Favorites',
    removeFromFavorites: 'Remove from Favorites',
    
    // Pharmacist Dashboard
    stockManagement: 'Stock Management',
    updateStock: 'Update Stock',
    bulkUpdate: 'Bulk Update',
    demandSignals: 'Demand Signals',
    analytics: 'Analytics',
    interPharmacy: 'Inter-Pharmacy Communication',
    
    // Pharmacist Verification
    pendingVerification: 'Pending Verification',
    pendingVerificationDesc: 'Your account is awaiting admin approval.',
    verified: 'Verified',
    
    // Settings
    language: 'Language',
    greek: 'Greek',
    english: 'English',
    seniorMode: 'Senior Mode',
    seniorModeDesc: 'Optional - Larger text and simplified interface',
    pushNotifications: 'Push Notifications',
    pushNotificationsNote: 'Push notifications when the app is closed require a future Store app version.',
    
    // Notifications
    notificationCenter: 'Notification Center',
    noNotifications: 'No notifications',
    markAllRead: 'Mark All as Read',
    
    // Medication Reminders
    medicationReminders: 'Medication Reminders',
    addReminder: 'Add Reminder',
    reminderTime: 'Reminder Time',
    reminderFrequency: 'Frequency',
    daily: 'Daily',
    weekly: 'Weekly',
    
    // Errors
    errorOccurred: 'An error occurred',
    tryAgain: 'Try Again',
    networkError: 'Network Error',
    
    // Landing
    heroTitle: 'Find Medicines Near You',
    heroSubtitle: 'Search for medicine availability at pharmacies in your area in real-time',
    getStarted: 'Get Started',
    learnMore: 'Learn More',
    
    // Features
    features: 'Features',
    featureRealtime: 'Real-Time Updates',
    featureRealtimeDesc: 'See medicine availability instantly',
    featureAlerts: 'Smart Alerts',
    featureAlertsDesc: 'Get notified when a medicine becomes available',
    featureSenior: 'Senior Mode',
    featureSeniorDesc: 'Simplified interface with larger text',
    
    // Stock Request
    requestStock: 'Stock Request',
    sendRequest: 'Send Request',
    requestSent: 'Request Sent',
    
    // Install PWA
    installApp: 'Install App',
    installAppDesc: 'Install the app for quick access',
  }
};

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem('pharma-alert-language');
    return saved || 'el';
  });

  const setLanguage = useCallback(async (lang) => {
    setLanguageState(lang);
    localStorage.setItem('pharma-alert-language', lang);
    
    // Try to save to user profile if logged in
    try {
      const user = await getCurrentUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ language: lang })
          .eq('id', user.id);
      }
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  }, []);

  // Load language from profile on mount
  useEffect(() => {
    const loadLanguageFromProfile = async () => {
      try {
        const user = await getCurrentUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('language')
            .eq('id', user.id)
            .single();
          
          if (data?.language) {
            setLanguageState(data.language);
            localStorage.setItem('pharma-alert-language', data.language);
          }
        }
      } catch (error) {
        // Use local storage fallback
      }
    };

    loadLanguageFromProfile();
  }, []);

  const t = useCallback((key) => {
    return translations[language]?.[key] || translations['en']?.[key] || key;
  }, [language]);

  const value = {
    language,
    setLanguage,
    t,
    isGreek: language === 'el',
    isEnglish: language === 'en'
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
