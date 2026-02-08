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
    pharmacyVerifiedBadge: 'Επαληθευμένο Φαρμακείο',
    pharmacyNotVerifiedBadge: 'Δεν έχει επαληθευτεί ακόμα',
    
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
    notificationsEmptyDesc: 'Οι ειδοποιήσεις σας θα εμφανιστούν εδώ',
    notificationRequestUpdateTitle: 'Ενημέρωση αιτήματος',
    notificationRequestAcceptedBody: 'Το αίτημά σας έγινε αποδεκτό.',
    notificationRequestRejectedBody: 'Το αίτημά σας απορρίφθηκε.',
    notificationRequestStatusChangedBody: 'Η κατάσταση του αιτήματός σας άλλαξε.',
    notificationNewPatientRequestTitle: 'Νέο αίτημα ασθενούς',
    notificationNewPatientRequestBody: 'Φάρμακο: {medicine}',
    
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

    // Learn More Page
    learnMoreTitle: 'Πώς λειτουργεί το Pharma-Alert',
    learnMoreSubtitle: 'Μια απλή διαδικασία για να βρείτε γρήγορα τα φάρμακα που χρειάζεστε.',
    learnMoreStepsTitle: 'Βήματα',
    learnMoreStepsSubtitle: 'Από την εγγραφή μέχρι την παραλαβή, όλα είναι ξεκάθαρα.',
    learnMoreStepPrefix: 'Βήμα',
    learnMoreStep1Title: 'Δημιουργήστε λογαριασμό',
    learnMoreStep1Desc: 'Συνδεθείτε ως ασθενής για να ξεκινήσετε.',
    learnMoreStep2Title: 'Δημιουργήστε αίτημα',
    learnMoreStep2Desc: 'Περιγράψτε το φάρμακο που αναζητάτε.',
    learnMoreStep3Title: 'Ενημερώνονται κοντινά φαρμακεία',
    learnMoreStep3Desc: 'Τα διαθέσιμα φαρμακεία λαμβάνουν ειδοποίηση άμεσα.',
    learnMoreStep4Title: 'Επιλέξτε φαρμακείο',
    learnMoreStep4Desc: 'Δείτε τις απαντήσεις και διαλέξτε το καλύτερο.',
    learnMoreStep5Title: 'Επικοινωνήστε ή παραλάβετε',
    learnMoreStep5Desc: 'Πηγαίνετε στο φαρμακείο ή καλέστε για επιβεβαίωση.',
    learnMoreBenefitsTitle: 'Τι κερδίζετε',
    learnMoreBenefitRealtimeTitle: 'Σήματα διαθεσιμότητας σε πραγματικό χρόνο',
    learnMoreBenefitRealtimeDesc: 'Λάβετε ενημερώσεις μόλις υπάρξει διαθέσιμο απόθεμα.',
    learnMoreBenefitFastTitle: 'Ταχύτερες αποφάσεις παραλαβής',
    learnMoreBenefitFastDesc: 'Μειώστε τον χρόνο αναμονής βρίσκοντας άμεσα λύση.',
    learnMoreBenefitFavoritesTitle: 'Αγαπημένα φαρμακεία',
    learnMoreBenefitFavoritesDesc: 'Αποθηκεύστε τα φαρμακεία που προτιμάτε για γρήγορη πρόσβαση.',
    learnMoreBenefitPrivacyTitle: 'Ιδιωτικότητα πρώτα',
    learnMoreBenefitPrivacyDesc: 'Τα δεδομένα σας μένουν ασφαλή και χρησιμοποιούνται μόνο για το αίτημά σας.',
    learnMoreCtaTitle: 'Έτοιμοι να εγκαταστήσετε το Pharma-Alert;',
    learnMoreCtaSubtitle: 'Αποκτήστε γρήγορη πρόσβαση και ειδοποιήσεις σε πραγματικό χρόνο.',
    
    // Stock Request
    requestStock: 'Αίτημα Αποθέματος',
    sendRequest: 'Αποστολή Αιτήματος',
    requestSent: 'Το αίτημα στάλθηκε',

    // Patient Requests
    requestMedicineTitle: '\u0391\u03af\u03c4\u03b7\u03bc\u03b1 \u03a6\u03b1\u03c1\u03bc\u03ac\u03ba\u03bf\u03c5',
    requestMedicineDesc: '\u0398\u03b1 \u03b5\u03b9\u03b4\u03bf\u03c0\u03bf\u03b9\u03ae\u03c3\u03bf\u03c5\u03bc\u03b5 \u03c4\u03b1 \u03b5\u03c6\u03b7\u03bc\u03b5\u03c1\u03b5\u03cd\u03bf\u03bd\u03c4\u03b1 \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03b1.',
    myRequestsTitle: '\u03a4\u03b1 \u0391\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03ac \u03bc\u03bf\u03c5',
    myRequestsEmpty: '\u0394\u03b5\u03bd \u03c5\u03c0\u03ac\u03c1\u03c7\u03bf\u03c5\u03bd \u03b1\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03b1',
    myRequestsEmptyDesc: '\u0394\u03b7\u03bc\u03b9\u03bf\u03c5\u03c1\u03b3\u03ae\u03c3\u03c4\u03b5 \u03ad\u03bd\u03b1 \u03b1\u03af\u03c4\u03b7\u03bc\u03b1 \u03b3\u03b9\u03b1 \u03bd\u03b1 \u03b5\u03b9\u03b4\u03bf\u03c0\u03bf\u03b9\u03b7\u03b8\u03bf\u03cd\u03bd \u03c4\u03b1 \u03b5\u03c6\u03b7\u03bc\u03b5\u03c1\u03b5\u03cd\u03bf\u03bd\u03c4\u03b1 \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03b1.',
    requestMedicineLabel: '\u038c\u03bd\u03bf\u03bc\u03b1 \u03a6\u03b1\u03c1\u03bc\u03ac\u03ba\u03bf\u03c5',
    requestMedicinePlaceholder: '\u03c0.\u03c7. Amoxicillin 500mg',
    requestNotesLabel: '\u03a3\u03b7\u03bc\u03b5\u03b9\u03ce\u03c3\u03b5\u03b9\u03c2 (\u03c0\u03c1\u03bf\u03b1\u03b9\u03c1\u03b5\u03c4\u03b9\u03ba\u03cc)',
    requestNotesPlaceholder: '\u039b\u03b5\u03c0\u03c4\u03bf\u03bc\u03ad\u03c1\u03b5\u03b9\u03b5\u03c2 \u03cc\u03c0\u03c9\u03c2 \u03b4\u03bf\u03c3\u03bf\u03bb\u03bf\u03b3\u03af\u03b1, \u03bc\u03bf\u03c1\u03c6\u03ae \u03ae \u03b5\u03c0\u03b5\u03af\u03b3\u03bf\u03bd',
    requestCreatedAt: '\u0394\u03b7\u03bc\u03b9\u03bf\u03c5\u03c1\u03b3\u03ae\u03b8\u03b7\u03ba\u03b5',
    requestRoutedTo: '\u03a0\u03c1\u03bf\u03c9\u03b8\u03ae\u03b8\u03b7\u03ba\u03b5 \u03c3\u03b5',
    requestRoutedToCount: 'Προστέθηκε σε {count} φαρμακεία',
    requestLastResponse: 'Τελευταία απάντηση:',
    requestStatusPending: '\u03a3\u03b5 \u03b1\u03bd\u03b1\u03bc\u03bf\u03bd\u03ae',
    requestStatusAccepted: '\u0388\u03b3\u03b9\u03bd\u03b5 \u03b1\u03c0\u03bf\u03b4\u03b5\u03ba\u03c4\u03cc',
    requestStatusRejected: '\u0391\u03c0\u03bf\u03c1\u03c1\u03af\u03c6\u03b8\u03b7\u03ba\u03b5',
    requestStatusClosed: '\u039a\u03bb\u03b5\u03b9\u03c3\u03c4\u03cc',

    requestNoPharmacies: '\u0394\u03b5\u03bd \u03c5\u03c0\u03ac\u03c1\u03c7\u03bf\u03c5\u03bd \u03b5\u03b3\u03b3\u03b5\u03b3\u03c1\u03b1\u03bc\u03bc\u03ad\u03bd\u03b1 \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03b1 \u03b3\u03b9\u03b1 \u03bb\u03ae\u03c8\u03b7 \u03b1\u03b9\u03c4\u03b7\u03bc\u03ac\u03c4\u03c9\u03bd \u03b1\u03c5\u03c4\u03ae \u03c4\u03b7 \u03c3\u03c4\u03b9\u03b3\u03bc\u03ae.',
    requestExpiresLabel: '\u039b\u03ae\u03b3\u03b5\u03b9:',
    requestExpiresInHours: 'Λήγει σε {hours} ώρες',
    requestExpiresInMinutes: 'Λήγει σε {minutes} λεπτά',
    requestExpired: 'Έληξε',
    requestNoResponses: '\u039a\u03b1\u03bc\u03af\u03b1 \u03b1\u03c0\u03ac\u03bd\u03c4\u03b7\u03c3\u03b7 \u03b1\u03ba\u03cc\u03bc\u03b7',
    requestResponsesLabel: '\u0391\u03c0\u03b1\u03bd\u03c4\u03ae\u03c3\u03b5\u03b9\u03c2:',
    requestResponsesAccepted: '\u03b1\u03c0\u03bf\u03b4\u03b5\u03ba\u03c4\u03ad\u03c2',
    requestResponsesRejected: '\u03b1\u03c0\u03bf\u03c1\u03c1\u03af\u03c8\u03b5\u03b9\u03c2',
    requestResponsesPending: '\u03c3\u03b5 \u03b1\u03bd\u03b1\u03bc\u03bf\u03bd\u03ae',
    requestCancel: '\u0391\u03ba\u03cd\u03c1\u03c9\u03c3\u03b7 \u03b1\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03bf\u03c2',
    requestCancelling: '\u0391\u03ba\u03cd\u03c1\u03c9\u03c3\u03b7...',
    requestSignInRequired: '\u03a3\u03c5\u03bd\u03b4\u03b5\u03b8\u03b5\u03af\u03c4\u03b5 \u03b3\u03b9\u03b1 \u03bd\u03b1 \u03c3\u03c4\u03b5\u03af\u03bb\u03b5\u03c4\u03b5 \u03b1\u03af\u03c4\u03b7\u03bc\u03b1',
    requestMedicineRequired: '\u03a3\u03c5\u03bc\u03c0\u03bb\u03b7\u03c1\u03ce\u03c3\u03c4\u03b5 \u03c4\u03bf \u03cc\u03bd\u03bf\u03bc\u03b1 \u03c6\u03b1\u03c1\u03bc\u03ac\u03ba\u03bf\u03c5',
    pharmacy: '\u03a6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03bf',

    
    // Install PWA
    installApp: 'Εγκατάσταση Εφαρμογής',
    installAppDesc: 'Εγκαταστήστε την εφαρμογή για γρήγορη πρόσβαση',
    installCta: 'Εγκαταστήστε',
    installInstalledLabel: 'Εγκατεστημένο',
    installConfirmTitle: 'Εγκατάσταση εφαρμογής',
    installConfirmMessage: 'Θέλετε να εγκαταστήσετε την εφαρμογή σε αυτόν τον υπολογιστή;',
    installUnavailable: 'Η εγκατάσταση δεν είναι διαθέσιμη αυτή τη στιγμή.',
    installDesktopOnly: 'Η εγκατάσταση υποστηρίζεται προς το παρόν μόνο σε υπολογιστή.',
    installModalTitle: 'Εγκατάσταση Εφαρμογής',
    installModalSubtitle: 'Ακολουθήστε τα παρακάτω βήματα ανάλογα με τη συσκευή σας.',
    installStepDesktopTitle: 'Chrome / Edge (Desktop)',
    installStepDesktopDesc: 'Εικονίδιο εγκατάστασης στη γραμμή διευθύνσεων ή Μενού → Εγκατάσταση εφαρμογής.',
    installStepAndroidTitle: 'Android Chrome',
    installStepAndroidDesc: 'Μενού (⋮) → Εγκατάσταση εφαρμογής.',
    installStepIosTitle: 'iOS Safari',
    installStepIosDesc: 'Κουμπί κοινής χρήσης → Προσθήκη στην Αρχική Οθόνη.',
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
    pharmacyVerifiedBadge: 'Verified Pharmacy',
    pharmacyNotVerifiedBadge: 'Not verified yet',
    
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
    notificationsEmptyDesc: 'Your notifications will appear here',
    notificationRequestUpdateTitle: 'Request update',
    notificationRequestAcceptedBody: 'Your request was accepted.',
    notificationRequestRejectedBody: 'Your request was rejected.',
    notificationRequestStatusChangedBody: 'Your request status changed.',
    notificationNewPatientRequestTitle: 'New patient request',
    notificationNewPatientRequestBody: 'Medicine: {medicine}',
    
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

    // Learn More Page
    learnMoreTitle: 'How Pharma-Alert works',
    learnMoreSubtitle: 'A simple flow to find the medicine you need faster.',
    learnMoreStepsTitle: 'Steps',
    learnMoreStepsSubtitle: 'From sign-in to pickup, everything is clear.',
    learnMoreStepPrefix: 'Step',
    learnMoreStep1Title: 'Create an account',
    learnMoreStep1Desc: 'Sign in as a patient to get started.',
    learnMoreStep2Title: 'Create a request',
    learnMoreStep2Desc: 'Tell us which medicine you need.',
    learnMoreStep3Title: 'Nearby pharmacies are notified',
    learnMoreStep3Desc: 'Available pharmacies receive the request instantly.',
    learnMoreStep4Title: 'Choose a pharmacy',
    learnMoreStep4Desc: 'Review responses and select the best option.',
    learnMoreStep5Title: 'Pick up or contact',
    learnMoreStep5Desc: 'Visit the pharmacy or call to confirm.',
    learnMoreBenefitsTitle: 'What you get',
    learnMoreBenefitRealtimeTitle: 'Real-time availability signals',
    learnMoreBenefitRealtimeDesc: 'Get updates as soon as stock is available.',
    learnMoreBenefitFastTitle: 'Faster pickup decisions',
    learnMoreBenefitFastDesc: 'Reduce waiting time with quick answers.',
    learnMoreBenefitFavoritesTitle: 'Saved favorites',
    learnMoreBenefitFavoritesDesc: 'Keep preferred pharmacies close at hand.',
    learnMoreBenefitPrivacyTitle: 'Privacy-first',
    learnMoreBenefitPrivacyDesc: 'Your data stays protected and is used only for your request.',
    learnMoreCtaTitle: 'Ready to install Pharma-Alert?',
    learnMoreCtaSubtitle: 'Get quick access and real-time alerts.',
    
    // Stock Request
    requestStock: 'Stock Request',
    sendRequest: 'Send Request',
    requestSent: 'Request Sent',

    // Patient Requests
    requestMedicineTitle: 'Request a Medicine',
    requestMedicineDesc: 'We will notify on-duty pharmacies.',
    myRequestsTitle: 'My Requests',
    myRequestsEmpty: 'No requests yet',
    myRequestsEmptyDesc: 'Create a request to notify on-duty pharmacies.',
    requestMedicineLabel: 'Medicine Name',
    requestMedicinePlaceholder: 'e.g. Amoxicillin 500mg',
    requestNotesLabel: 'Notes (optional)',
    requestNotesPlaceholder: 'Details like dosage, form, or urgency',
    requestCreatedAt: 'Created',
    requestRoutedTo: 'Routed to',
    requestRoutedToCount: 'Added to {count} pharmacies',
    requestLastResponse: 'Last response:',
    requestStatusPending: 'Pending',
    requestStatusAccepted: 'Accepted',
    requestStatusRejected: 'Rejected',
    requestStatusClosed: 'Closed',

    requestNoPharmacies: 'No registered pharmacies are available to receive requests right now.',
    requestExpiresLabel: 'Expires:',
    requestExpiresInHours: 'Expires in {hours}h',
    requestExpiresInMinutes: 'Expires in {minutes}m',
    requestExpired: 'Expired',
    requestNoResponses: 'No responses yet',
    requestResponsesLabel: 'Responses:',
    requestResponsesAccepted: 'accepted',
    requestResponsesRejected: 'rejected',
    requestResponsesPending: 'pending',
    requestCancel: 'Cancel request',
    requestCancelling: 'Cancelling...',
    requestSignInRequired: 'Sign in to send a request',
    requestMedicineRequired: 'Enter a medicine name',
    pharmacy: 'Pharmacy',

    
    // Install PWA
    installApp: 'Install App',
    installAppDesc: 'Install the app for quick access',
    installCta: 'Install',
    installInstalledLabel: 'Installed',
    installConfirmTitle: 'Install app',
    installConfirmMessage: 'Do you want to install the app on this computer?',
    installUnavailable: 'Installation is not available right now.',
    installDesktopOnly: 'Installation is currently supported on desktop only.',
    installModalTitle: 'Install the App',
    installModalSubtitle: 'Follow the steps below for your device.',
    installStepDesktopTitle: 'Chrome / Edge (Desktop)',
    installStepDesktopDesc: 'Use the install icon in the address bar or Menu → Install app.',
    installStepAndroidTitle: 'Android Chrome',
    installStepAndroidDesc: 'Menu (⋮) → Install app.',
    installStepIosTitle: 'iOS Safari',
    installStepIosDesc: 'Share icon → Add to Home Screen.',
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
          const { data, error } = await supabase
            .from('profiles')
            .select('language')
            .eq('id', user.id)
            .maybeSingle();

          if (error) throw error;
          if (!data) return;
          
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
