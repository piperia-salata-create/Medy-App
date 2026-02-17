import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { EmptyState } from '../../components/ui/empty-states';
import { SkeletonList, SkeletonPharmacyCard } from '../../components/ui/skeleton-loaders';
import { ArrowLeft, Clock3, MessageCircle, Pill } from 'lucide-react';
import { toast } from 'sonner';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeLower = (value) => safeText(value).toLowerCase();
const HIDDEN_EXCHANGE_STATUSES = new Set(['fulfilled', 'cancelled', 'withdrawn', 'completed', 'matched']);
const shouldHideByStatus = (status) => HIDDEN_EXCHANGE_STATUSES.has(normalizeLower(status));

const INTER_PHARMACY_COPY = {
  en: {
    pageTitle: 'Exchange Hub',
    pageSubtitle: 'Matching only. Transfer and settlement happen outside platform.',
    active: 'active',
    chats: 'Chats',
    noPharmacyTitle: 'No pharmacy profile found',
    noPharmacyDescription: 'Create your pharmacy first to use exchange.',
    createOfferTitle: 'Create Offer',
    createOfferDescription: 'Post a specific medicine offer for exchange matching.',
    needMedicineTitle: 'Need a medicine?',
    needMedicineDescription: 'Post demand and instantly review best active matches.',
    searchMedicinePlaceholder: 'Type medicine name...',
    noMedicineResults: 'No medicines found',
    searchingMedicines: 'Searching...',
    quantity: 'Quantity',
    quantityOptional: 'Quantity (optional)',
    expiryDateOptional: 'Expiry date (optional)',
    createOfferAction: 'Create offer',
    postDemandAction: 'Post demand',
    notesOptional: 'Notes (optional)',
    saving: 'Saving...',
    posting: 'Posting...',
    matchesLatestDemand: 'Matches for latest demand',
    matchOne: 'match',
    matchMany: 'matches',
    loadingMatches: 'Loading matches...',
    noMatchesTitle: 'No matches found yet',
    noMatchesDescription: 'Keep this demand open and new offers will appear here.',
    medicineFallback: 'Medicine',
    qtyPrefix: 'qty',
    requestExchange: 'Request exchange',
    myOpenDemands: 'My open demands',
    myOpenDemandsSubtitle: 'Requests I publish to receive offers.',
    noOpenDemandsTitle: 'No open demands',
    noOpenDemandsDescription: 'Post a demand to receive suggested offers for exchange.',
    posted: 'posted',
    open: 'Open',
    markFulfilled: 'Mark fulfilled',
    activeOffers: 'Active Offers',
    activeOffersSubtitle: 'Offers from other pharmacists.',
    noActiveOffersTitle: 'No active offers yet',
    noActiveOffersDescription: 'Offers from connected pharmacies will show up here.',
    expPrefix: 'exp',
    myOffers: 'My Offers',
    myOffersSubtitle: 'Offers that I have published.',
    noOffersTitle: 'No offers yet',
    noOffersDescription: 'Create your first offer to start exchange matching.',
    withdraw: 'Withdraw',
    incomingRequests: 'Incoming Requests',
    incomingRequestsSubtitle: 'Requests from other pharmacists on my offers.',
    noIncomingRequestsTitle: 'No incoming requests',
    noIncomingRequestsDescription: 'Requests from other pharmacists will appear here.',
    requested: 'requested',
    accept: 'Accept',
    reject: 'Reject',
    viewDetails: 'View details',
    detailsTitle: 'Request details',
    requestStatusLabel: 'Request status',
    offerStatusLabel: 'Offer status',
    fromPharmacyLabel: 'From pharmacy',
    toPharmacyLabel: 'To pharmacy',
    requestedAtLabel: 'Requested at',
    offerQuantityLabel: 'Offer quantity',
    offerExpiryLabel: 'Offer expiry',
    requestMessageLabel: 'Request note',
    offerNotesLabel: 'Offer note',
    noNotesLabel: 'No notes provided',
    close: 'Close',
    sentRequestsTitle: 'Requests I sent',
    radiusLabel: 'Radius',
    nationwide: 'Nationwide',
    kmSuffix: 'km',
    openChat: 'Open chat',
    outgoingRequests: 'Outgoing Requests',
    noOutgoingRequestsTitle: 'No outgoing requests',
    noOutgoingRequestsDescription: 'Requests you send to other offers are listed here.',
    optionalMessagePrompt: 'Optional message',
    ownOfferRequestBlocked: 'You cannot request your own offer',
    quantityPositiveInteger: 'Quantity must be a positive integer',
    quantityGreaterThanZero: 'Quantity must be greater than 0',
    selectMedicineFirst: 'Select a medicine first',
    failedLoadExchange: 'Failed to load exchange data',
    failedLoadDemandMatches: 'Failed to load demand matches',
    failedLoadRequestDetails: 'Failed to load request details',
    failedCreateOffer: 'Failed to create offer',
    failedPostDemand: 'Failed to post demand',
    failedMarkDemand: 'Failed to mark demand fulfilled',
    failedUpdateOffer: 'Failed to update offer',
    failedSendRequest: 'Failed to send request',
    failedUpdateRequest: 'Failed to update request',
    failedOpenChat: 'Failed to open chat',
    status: {
      pending: 'Pending',
      accepted: 'Accepted',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
      completed: 'Completed',
      withdrawn: 'Withdrawn',
      matched: 'Matched'
    },
    expiry: {
      no_expiry: 'No expiry',
      expired: 'Expired',
      critical: 'Critical',
      warning: 'Warning',
      normal: 'Normal'
    }
  },
  el: {
    pageTitle: 'Κέντρο Ανταλλαγών',
    pageSubtitle: 'Μόνο αντιστοίχιση. Η μεταφορά και η τακτοποίηση γίνονται εκτός πλατφόρμας.',
    active: 'ενεργές',
    chats: 'Συνομιλίες',
    noPharmacyTitle: 'Δεν βρέθηκε προφίλ φαρμακείου',
    noPharmacyDescription: 'Δημιουργήστε πρώτα το φαρμακείο σας για να χρησιμοποιήσετε τις ανταλλαγές.',
    createOfferTitle: 'Δημιουργία προσφοράς',
    createOfferDescription: 'Καταχωρήστε συγκεκριμένη προσφορά φαρμάκου για αντιστοίχιση ανταλλαγής.',
    needMedicineTitle: 'Χρειάζεστε φάρμακο;',
    needMedicineDescription: 'Καταχωρήστε ζήτηση και δείτε άμεσα τις καλύτερες ενεργές αντιστοιχίες.',
    searchMedicinePlaceholder: 'Πληκτρολογήστε όνομα φαρμάκου...',
    noMedicineResults: 'Δεν βρέθηκαν φάρμακα',
    searchingMedicines: 'Αναζήτηση...',
    quantity: 'Ποσότητα',
    quantityOptional: 'Ποσότητα (προαιρετική)',
    expiryDateOptional: 'Ημερομηνία λήξης (προαιρετική)',
    createOfferAction: 'Δημιουργία προσφοράς',
    postDemandAction: 'Καταχώρηση ζήτησης',
    notesOptional: 'Σημειώσεις (προαιρετικά)',
    saving: 'Αποθήκευση...',
    posting: 'Καταχώρηση...',
    matchesLatestDemand: 'Αντιστοιχίες τελευταίας ζήτησης',
    matchOne: 'αντιστοιχία',
    matchMany: 'αντιστοιχίες',
    loadingMatches: 'Φόρτωση αντιστοιχιών...',
    noMatchesTitle: 'Δεν βρέθηκαν αντιστοιχίες ακόμη',
    noMatchesDescription: 'Κρατήστε τη ζήτηση ανοιχτή και νέες προσφορές θα εμφανιστούν εδώ.',
    medicineFallback: 'Φάρμακο',
    qtyPrefix: 'ποσ.',
    requestExchange: 'Αίτημα ανταλλαγής',
    myOpenDemands: 'Οι ανοιχτές ζητήσεις μου',
    myOpenDemandsSubtitle: 'Εξερχόμενα αιτήματα.',
    noOpenDemandsTitle: 'Δεν υπάρχουν ανοιχτές ζητήσεις',
    noOpenDemandsDescription: 'Καταχωρήστε ζήτηση για να λάβετε προτεινόμενες προσφορές ανταλλαγής.',
    posted: 'δημιουργήθηκε',
    open: 'Ανοιχτή',
    markFulfilled: 'Σήμανση ως καλυμμένη',
    activeOffers: 'Ενεργές προσφορές',
    activeOffersSubtitle: 'Προσφορές άλλων φαρμακοποιών.',
    noActiveOffersTitle: 'Δεν υπάρχουν ενεργές προσφορές',
    noActiveOffersDescription: 'Οι προσφορές από συνδεδεμένα φαρμακεία θα εμφανίζονται εδώ.',
    expPrefix: 'λήξη',
    myOffers: 'Οι προσφορές μου',
    myOffersSubtitle: 'Προσφορές που έχω δημοσιεύσει εγώ.',
    noOffersTitle: 'Δεν υπάρχουν προσφορές',
    noOffersDescription: 'Δημιουργήστε την πρώτη σας προσφορά για να ξεκινήσει η αντιστοίχιση.',
    withdraw: 'Απόσυρση',
    incomingRequests: 'Εισερχόμενα αιτήματα',
    incomingRequestsSubtitle: 'Αναζητήσεις άλλων φαρμακοποιών.',
    noIncomingRequestsTitle: 'Δεν υπάρχουν εισερχόμενα αιτήματα',
    noIncomingRequestsDescription: 'Αναζητήσεις άλλων φαρμακοποιών θα εμφανίζονται εδώ.',
    requested: 'ζητήθηκε',
    accept: 'Αποδοχή',
    reject: 'Απόρριψη',
    openChat: 'Άνοιγμα συνομιλίας',
    outgoingRequests: 'Εξερχόμενα αιτήματα',
    noOutgoingRequestsTitle: 'Δεν υπάρχουν εξερχόμενα αιτήματα',
    noOutgoingRequestsDescription: 'Τα αιτήματα που στέλνετε σε άλλες προσφορές εμφανίζονται εδώ.',
    sentRequestsTitle: 'Αιτήματα που έχω στείλει',
    radiusLabel: 'Ακτίνα',
    nationwide: 'Πανελλαδικά',
    kmSuffix: 'χλμ',
    optionalMessagePrompt: 'Προαιρετικό μήνυμα',
    quantityPositiveInteger: 'Η ποσότητα πρέπει να είναι θετικός ακέραιος',
    quantityGreaterThanZero: 'Η ποσότητα πρέπει να είναι μεγαλύτερη από 0',
    selectMedicineFirst: 'Επιλέξτε πρώτα φάρμακο',
    failedLoadExchange: 'Αποτυχία φόρτωσης δεδομένων ανταλλαγών',
    failedLoadDemandMatches: 'Αποτυχία φόρτωσης αντιστοιχιών ζήτησης',
    failedLoadRequestDetails: 'Αποτυχία φόρτωσης λεπτομερειών αιτήματος',
    failedCreateOffer: 'Αποτυχία δημιουργίας προσφοράς',
    failedPostDemand: 'Αποτυχία καταχώρησης ζήτησης',
    failedMarkDemand: 'Αποτυχία ενημέρωσης ζήτησης',
    failedUpdateOffer: 'Αποτυχία ενημέρωσης προσφοράς',
    failedSendRequest: 'Αποτυχία αποστολής αιτήματος',
    failedUpdateRequest: 'Αποτυχία ενημέρωσης αιτήματος',
    failedOpenChat: 'Αποτυχία ανοίγματος συνομιλίας',
    status: {
      pending: 'Σε αναμονή',
      accepted: 'Αποδεκτό',
      rejected: 'Απορρίφθηκε',
      cancelled: 'Ακυρώθηκε',
      completed: 'Ολοκληρώθηκε',
      withdrawn: 'Αποσύρθηκε',
      matched: 'Αντιστοιχίστηκε'
    },
    expiry: {
      no_expiry: 'Χωρίς λήξη',
      expired: 'Ληγμένο',
      critical: 'Κρίσιμο',
      warning: 'Προειδοποίηση',
      normal: 'Κανονικό'
    }
  }
};

const mergeMedicinesById = (existing, incoming) => {
  const map = new Map((existing || []).map((medicine) => [medicine.id, medicine]));
  for (const medicine of incoming || []) {
    if (medicine?.id) {
      map.set(medicine.id, medicine);
    }
  }
  return Array.from(map.values()).sort((left, right) =>
    safeText(left?.name).localeCompare(safeText(right?.name), 'el', { sensitivity: 'base' })
  );
};

const statusLabel = (status, labels) => {
  const normalized = normalizeLower(status);
  if (!normalized) return labels.pending;
  return labels[normalized] || status;
};

const parseOptionalPositiveInt = (value, invalidMessage) => {
  const trimmed = safeText(value);
  if (!trimmed) {
    return { value: null, error: null };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return { value: null, error: invalidMessage };
  }
  return { value: parsed, error: null };
};

const formatDate = (value, locale) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(locale || 'en-US');
};

const formatCityRegion = (city, region) => {
  const cityText = safeText(city);
  const regionText = safeText(region);
  if (cityText && regionText && normalizeLower(cityText) !== normalizeLower(regionText)) {
    return `${cityText}, ${regionText}`;
  }
  return cityText || regionText || '';
};

const formatDistanceAndLocation = (distanceKm, kmSuffix, city, region) => {
  const parts = [];
  if (Number.isFinite(Number(distanceKm))) {
    parts.push(`${Number(distanceKm).toFixed(1)} ${kmSuffix}`);
  }
  const cityRegion = formatCityRegion(city, region);
  if (cityRegion) {
    parts.push(cityRegion);
  }
  return parts.join(' • ');
};

const getExpiryMeta = (expiryDate, labels) => {
  if (!expiryDate) {
    return {
      label: labels.no_expiry,
      badgeClass: 'bg-pharma-slate-grey/10 text-pharma-slate-grey'
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parsed = new Date(expiryDate);
  parsed.setHours(0, 0, 0, 0);
  const days = Math.floor((parsed.getTime() - today.getTime()) / 86400000);

  if (days < 0) {
    return { label: labels.expired, badgeClass: 'bg-pharma-coral/10 text-pharma-coral' };
  }
  if (days <= 30) {
    return { label: labels.critical, badgeClass: 'bg-pharma-coral/10 text-pharma-coral' };
  }
  if (days <= 90) {
    return { label: labels.warning, badgeClass: 'bg-pharma-steel-blue/10 text-pharma-steel-blue' };
  }
  return { label: labels.normal, badgeClass: 'bg-pharma-sea-green/10 text-pharma-sea-green' };
};

const getExpiryMetaFromClassification = (classification, labels) => {
  const normalized = normalizeLower(classification);
  if (normalized === 'expired') return { label: labels.expired, badgeClass: 'bg-pharma-coral/10 text-pharma-coral' };
  if (normalized === 'critical') return { label: labels.critical, badgeClass: 'bg-pharma-coral/10 text-pharma-coral' };
  if (normalized === 'warning') return { label: labels.warning, badgeClass: 'bg-pharma-steel-blue/10 text-pharma-steel-blue' };
  if (normalized === 'normal') return { label: labels.normal, badgeClass: 'bg-pharma-sea-green/10 text-pharma-sea-green' };
  return { label: labels.normal, badgeClass: 'bg-pharma-sea-green/10 text-pharma-sea-green' };
};

const getRequestStatusBadgeClass = (status) => {
  const normalized = normalizeLower(status);
  if (normalized === 'pending') return 'bg-pharma-steel-blue/10 text-pharma-steel-blue';
  if (normalized === 'accepted') return 'bg-pharma-sea-green/10 text-pharma-sea-green';
  if (normalized === 'rejected' || normalized === 'cancelled') return 'bg-pharma-coral/10 text-pharma-coral';
  if (normalized === 'completed') return 'bg-pharma-teal/10 text-pharma-teal';
  return 'bg-pharma-slate-grey/10 text-pharma-slate-grey';
};

const getRequestId = (request) => request?.id || null;

function MedicineSearchInput({
  value,
  onValueChange,
  options,
  onSelect,
  searching,
  placeholder,
  searchingLabel,
  emptyLabel,
  testId,
  className
}) {
  const [open, setOpen] = useState(false);
  const hasQuery = safeText(value).length > 0;
  const showMenu = open && (searching || hasQuery);

  return (
    <div className={`relative ${className || ''}`}>
      <Input
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && options.length > 0) {
            event.preventDefault();
            onSelect(options[0]);
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        data-testid={testId}
      />

      {showMenu && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-pharma-grey-pale bg-white shadow-card max-h-56 overflow-y-auto">
          {searching ? (
            <div className="px-3 py-2 text-xs text-pharma-slate-grey">{searchingLabel}</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-pharma-slate-grey">{emptyLabel}</div>
          ) : (
            options.map((medicine) => (
              <button
                key={medicine.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-pharma-dark-slate hover:bg-pharma-ice-blue/70"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(medicine);
                  setOpen(false);
                }}
              >
                {medicine.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function InterPharmacyPage() {
  const { user, isPharmacist } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id || null;
  const locale = language === 'el' ? 'el-GR' : 'en-US';
  const copy = language === 'el' ? INTER_PHARMACY_COPY.el : INTER_PHARMACY_COPY.en;
  const detailsText = useMemo(
    () => ({
      viewDetails: copy.viewDetails || (language === 'el' ? 'Προβολή λεπτομερειών' : 'View details'),
      detailsTitle: copy.detailsTitle || (language === 'el' ? 'Λεπτομέρειες αιτήματος' : 'Request details'),
      requestStatusLabel: copy.requestStatusLabel || (language === 'el' ? 'Κατάσταση αιτήματος' : 'Request status'),
      offerStatusLabel: copy.offerStatusLabel || (language === 'el' ? 'Κατάσταση προσφοράς' : 'Offer status'),
      fromPharmacyLabel: copy.fromPharmacyLabel || (language === 'el' ? 'Από φαρμακείο' : 'From pharmacy'),
      toPharmacyLabel: copy.toPharmacyLabel || (language === 'el' ? 'Προς φαρμακείο' : 'To pharmacy'),
      requestedAtLabel: copy.requestedAtLabel || (language === 'el' ? 'Ημερομηνία αιτήματος' : 'Requested at'),
      offerQuantityLabel: copy.offerQuantityLabel || (language === 'el' ? 'Προσφερόμενη ποσότητα' : 'Offer quantity'),
      offerExpiryLabel: copy.offerExpiryLabel || (language === 'el' ? 'Λήξη προσφοράς' : 'Offer expiry'),
      requestMessageLabel: copy.requestMessageLabel || (language === 'el' ? 'Σημείωση αιτήματος' : 'Request note'),
      offerNotesLabel: copy.offerNotesLabel || (language === 'el' ? 'Σημείωση προσφοράς' : 'Offer note'),
      noNotesLabel: copy.noNotesLabel || (language === 'el' ? 'Δεν υπάρχουν σημειώσεις' : 'No notes provided'),
      close: copy.close || (language === 'el' ? 'Κλείσιμο' : 'Close'),
      ownOfferRequestBlocked: copy.ownOfferRequestBlocked || (language === 'el' ? 'Δεν μπορείτε να αιτηθείτε δική σας προσφορά' : 'You cannot request your own offer')
    }),
    [copy, language]
  );
  const demandDetailsText = useMemo(
    () => ({
      title: language === 'el'
        ? '\u039b\u03b5\u03c0\u03c4\u03bf\u03bc\u03ad\u03c1\u03b5\u03b9\u03b5\u03c2 \u03b6\u03ae\u03c4\u03b7\u03c3\u03b7\u03c2'
        : 'Demand details',
      medicineLabel: language === 'el' ? '\u03a6\u03ac\u03c1\u03bc\u03b1\u03ba\u03bf' : 'Medicine',
      quantityLabel: language === 'el' ? '\u0396\u03b7\u03c4\u03bf\u03cd\u03bc\u03b5\u03bd\u03b7 \u03c0\u03bf\u03c3\u03cc\u03c4\u03b7\u03c4\u03b1' : 'Requested quantity',
      notesLabel: language === 'el' ? '\u03a3\u03b7\u03bc\u03b5\u03b9\u03ce\u03c3\u03b5\u03b9\u03c2' : 'Notes',
      createdAtLabel: language === 'el' ? '\u0397\u03bc\u03b5\u03c1\u03bf\u03bc\u03b7\u03bd\u03af\u03b1 \u03b4\u03b7\u03bc\u03b9\u03bf\u03c5\u03c1\u03b3\u03af\u03b1\u03c2' : 'Created at',
      statusLabel: language === 'el' ? '\u039a\u03b1\u03c4\u03ac\u03c3\u03c4\u03b1\u03c3\u03b7' : 'Status',
      open: copy.open || (language === 'el' ? '\u0391\u03bd\u03bf\u03b9\u03c7\u03c4\u03ae' : 'Open'),
      fulfilled: language === 'el' ? '\u039a\u03b1\u03bb\u03c5\u03bc\u03bc\u03ad\u03bd\u03b7' : 'Fulfilled'
    }),
    [copy.open, language]
  );
  const offerDetailsText = useMemo(
    () => ({
      title: language === 'el'
        ? '\u039b\u03b5\u03c0\u03c4\u03bf\u03bc\u03ad\u03c1\u03b5\u03b9\u03b5\u03c2 \u03c0\u03c1\u03bf\u03c3\u03c6\u03bf\u03c1\u03ac\u03c2'
        : 'Offer details',
      medicineLabel: language === 'el' ? '\u03a6\u03ac\u03c1\u03bc\u03b1\u03ba\u03bf' : 'Medicine',
      quantityLabel: language === 'el' ? '\u03a0\u03bf\u03c3\u03cc\u03c4\u03b7\u03c4\u03b1' : 'Quantity',
      expiryLabel: language === 'el' ? '\u039b\u03ae\u03be\u03b7' : 'Expiry',
      createdAtLabel: language === 'el' ? '\u0394\u03b7\u03bc\u03b9\u03bf\u03c5\u03c1\u03b3\u03ae\u03b8\u03b7\u03ba\u03b5' : 'Created at',
      statusLabel: language === 'el' ? '\u039a\u03b1\u03c4\u03ac\u03c3\u03c4\u03b1\u03c3\u03b7' : 'Status',
      pharmacyLabel: language === 'el' ? '\u03a6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03bf' : 'Pharmacy',
      distanceLabel: language === 'el' ? '\u0391\u03c0\u03cc\u03c3\u03c4\u03b1\u03c3\u03b7' : 'Distance',
      notesLabel: language === 'el' ? '\u03a3\u03b7\u03bc\u03b5\u03b9\u03ce\u03c3\u03b5\u03b9\u03c2' : 'Notes'
    }),
    [language]
  );

  const [loading, setLoading] = useState(true);
  const [myPharmacy, setMyPharmacy] = useState(null);
  const [activeOffers, setActiveOffers] = useState([]);
  const [myOffers, setMyOffers] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [allMedicines, setAllMedicines] = useState([]);
  const [myOpenDemands, setMyOpenDemands] = useState([]);
  const [radiusKm, setRadiusKm] = useState(25);
  const [includeNationwide, setIncludeNationwide] = useState(false);

  const [offerMedicineId, setOfferMedicineId] = useState('');
  const [offerQuantity, setOfferQuantity] = useState('1');
  const [offerExpiryDate, setOfferExpiryDate] = useState('');
  const [offerNotes, setOfferNotes] = useState('');
  const [creatingOffer, setCreatingOffer] = useState(false);
  const [offerMedicineQuery, setOfferMedicineQuery] = useState('');
  const [offerMedicineOptions, setOfferMedicineOptions] = useState([]);
  const [searchingOfferMedicines, setSearchingOfferMedicines] = useState(false);

  const [demandMedicineId, setDemandMedicineId] = useState('');
  const [demandQuantity, setDemandQuantity] = useState('');
  const [demandExpiryDate, setDemandExpiryDate] = useState('');
  const [demandNotes, setDemandNotes] = useState('');
  const [postingDemand, setPostingDemand] = useState(false);
  const [fulfillingDemandId, setFulfillingDemandId] = useState(null);
  const [demandMedicineQuery, setDemandMedicineQuery] = useState('');
  const [demandMedicineOptions, setDemandMedicineOptions] = useState([]);
  const [searchingDemandMedicines, setSearchingDemandMedicines] = useState(false);

  const [latestDemandId, setLatestDemandId] = useState(null);
  const [latestDemandMatches, setLatestDemandMatches] = useState([]);
  const [loadingDemandMatches, setLoadingDemandMatches] = useState(false);

  const [busyRequestId, setBusyRequestId] = useState(null);
  const [isRequestDetailsOpen, setIsRequestDetailsOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestDetailsLoading, setRequestDetailsLoading] = useState(false);
  const [isDemandDetailsOpen, setIsDemandDetailsOpen] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState(null);
  const [isOfferDetailsOpen, setIsOfferDetailsOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);

  const pharmacyId = myPharmacy?.id || null;

  const medicineById = useMemo(
    () => new Map((allMedicines || []).map((m) => [m.id, m])),
    [allMedicines]
  );
  const medicineByName = useMemo(() => {
    const map = new Map();
    for (const medicine of allMedicines || []) {
      const normalized = normalizeLower(medicine?.name);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, medicine);
      }
    }
    return map;
  }, [allMedicines]);

  const cacheMedicines = useCallback((rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    setAllMedicines((current) => mergeMedicinesById(current, rows));
  }, []);

  const searchMedicines = useCallback(async (queryText) => {
    const query = safeText(queryText);
    let request = supabase
      .from('medicines')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(25);

    if (query) {
      request = request.ilike('name', `%${query}%`);
    }

    const { data, error } = await request;
    if (error) throw error;
    return data || [];
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: mine, error: mineErr } = await supabase
        .from('pharmacies')
        .select('id, owner_id, name')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle();
      if (mineErr) throw mineErr;
      setMyPharmacy(mine || null);

      if (!mine?.id) {
        setActiveOffers([]);
        setMyOffers([]);
        setIncomingRequests([]);
        setSentRequests([]);
        setAllMedicines([]);
        setMyOpenDemands([]);
        return;
      }

      const [offersRes, myOffersRes, requestsRes, medsRes, demandsRes] = await Promise.all([
        supabase.rpc('get_active_exchange_offers_for_pharmacist', {
          p_radius_km: radiusKm,
          p_nationwide: includeNationwide
        }),
        supabase
          .from('exchange_offers')
          .select('id, pharmacy_id, medicine_id, quantity, expiry_date, notes, status, created_at')
          .eq('pharmacy_id', mine.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('exchange_requests')
          .select('id, offer_id, requesting_pharmacy_id, message, status, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('medicines')
          .select('id, name')
          .order('name', { ascending: true })
          .limit(200),
        supabase
          .from('exchange_demands')
          .select('id, pharmacy_id, medicine_id, quantity, notes, status, created_at, closed_at')
          .eq('pharmacy_id', mine.id)
          .order('created_at', { ascending: false })
      ]);

      if (offersRes.error) throw offersRes.error;
      if (myOffersRes.error) throw myOffersRes.error;
      if (requestsRes.error) throw requestsRes.error;
      if (medsRes.error) throw medsRes.error;
      if (demandsRes.error) throw demandsRes.error;

      const offersRows = offersRes.data || [];
      const myOffersRows = myOffersRes.data || [];
      const reqRows = requestsRes.data || [];
      const medsRows = medsRes.data || [];
      const demandRows = demandsRes.data || [];

      const reqOfferIds = Array.from(new Set(reqRows.map((r) => r.offer_id).filter(Boolean)));
      const knownOfferIds = new Set([...offersRows, ...myOffersRows].map((o) => o.id));
      const missingOfferIds = reqOfferIds.filter((id) => !knownOfferIds.has(id));

      let extraOffers = [];
      if (missingOfferIds.length > 0) {
        const { data, error } = await supabase
          .from('exchange_offers')
          .select('id, pharmacy_id, medicine_id, quantity, expiry_date, notes, status, created_at')
          .in('id', missingOfferIds);
        if (error) throw error;
        extraOffers = data || [];
      }

      const allOffers = [...offersRows, ...myOffersRows, ...extraOffers];
      const offersById = new Map(allOffers.map((o) => [o.id, o]));
      const requiredMedicineIds = Array.from(
        new Set(
          allOffers
            .map((offer) => offer.medicine_id)
            .concat(demandRows.map((demand) => demand.medicine_id))
            .filter(Boolean)
        )
      );
      const knownMedicineIds = new Set(medsRows.map((medicine) => medicine.id));
      const missingMedicineIds = requiredMedicineIds.filter((medicineId) => !knownMedicineIds.has(medicineId));
      let allMedicineRows = [...medsRows];
      if (missingMedicineIds.length > 0) {
        const { data: missingMedicines, error: missingMedicinesError } = await supabase
          .from('medicines')
          .select('id, name')
          .in('id', missingMedicineIds);
        if (missingMedicinesError) throw missingMedicinesError;
        allMedicineRows = mergeMedicinesById(allMedicineRows, missingMedicines || []);
      }

      const pharmacyIds = Array.from(
        new Set(
          allOffers
            .map((o) => o.pharmacy_id)
            .concat(reqRows.map((r) => r.requesting_pharmacy_id))
            .filter(Boolean)
        )
      );
      const { data: pharmacyRows, error: pharmacyErr } = await supabase
        .from('pharmacies')
        .select('id, name')
        .in('id', pharmacyIds);
      if (pharmacyErr) throw pharmacyErr;

      const pharmacyById = new Map((pharmacyRows || []).map((p) => [p.id, p]));
      const localMedicineById = new Map(allMedicineRows.map((medicine) => [medicine.id, medicine]));

      const enrichOffer = (offer) => ({
        ...offer,
        pharmacy: pharmacyById.get(offer.pharmacy_id)
          || (offer?.pharmacy_name ? { id: offer.pharmacy_id, name: offer.pharmacy_name } : null),
        medicine: localMedicineById.get(offer.medicine_id) || null
      });

      const enrichedActive = offersRows
        .map(enrichOffer)
        .filter((o) => o.pharmacy_id !== mine.id && !shouldHideByStatus(o.status));

      const enrichedMine = myOffersRows
        .map(enrichOffer)
        .filter((offer) => !shouldHideByStatus(offer.status));

      const enrichedRequests = reqRows
        .map((r) => {
          const offer = offersById.get(r.offer_id) || null;
          return {
            ...r,
            request_id: r.id,
            offer,
            requestingPharmacy: pharmacyById.get(r.requesting_pharmacy_id) || null,
            offerPharmacy: offer ? (pharmacyById.get(offer.pharmacy_id) || null) : null
          };
        })
        .filter((r) => r.offer)
        .filter((r) => !shouldHideByStatus(r.status))
        .filter((r) => !shouldHideByStatus(r.offer?.status));

      const enrichedDemands = demandRows
        .filter((d) => d.status === 'open')
        .map((d) => ({
          ...d,
          medicine: localMedicineById.get(d.medicine_id) || null
        }));

      setActiveOffers(enrichedActive);
      setMyOffers(enrichedMine);
      setIncomingRequests(
        enrichedRequests.filter(
          (r) => r.offer.pharmacy_id === mine.id && r.requesting_pharmacy_id !== mine.id
        )
      );
      setSentRequests(
        enrichedRequests.filter(
          (r) => r.requesting_pharmacy_id === mine.id && r.offer.pharmacy_id !== mine.id
        )
      );
      setAllMedicines((current) => mergeMedicinesById(current, allMedicineRows));
      setMyOpenDemands(enrichedDemands);
    } catch (error) {
      console.error('Exchange load failed:', error);
      toast.error(error?.message || copy.failedLoadExchange);
    } finally {
      setLoading(false);
    }
  }, [copy.failedLoadExchange, includeNationwide, radiusKm, userId]);

  useEffect(() => {
    if (!isPharmacist()) {
      navigate('/patient');
      return;
    }
    loadData();
  }, [isPharmacist, loadData, navigate]);

  useEffect(() => {
    const channel = supabase
      .channel('exchange_scaffold_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_offers' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_requests' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_demands' }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  useEffect(() => {
    const medicineIdFromQuery = new URLSearchParams(location.search).get('medicine_id');
    if (!medicineIdFromQuery) return;
    if (demandMedicineId === medicineIdFromQuery) return;

    const existing = medicineById.get(medicineIdFromQuery);
    if (existing) {
      setDemandMedicineId(medicineIdFromQuery);
      setDemandMedicineQuery(existing.name);
      return;
    }

    let active = true;
    const fetchMedicineFromQuery = async () => {
      const { data, error } = await supabase
        .from('medicines')
        .select('id, name')
        .eq('id', medicineIdFromQuery)
        .maybeSingle();
      if (!active || error || !data) return;
      cacheMedicines([data]);
      setDemandMedicineId(data.id);
      setDemandMedicineQuery(data.name);
    };

    fetchMedicineFromQuery().catch(() => {});
    return () => {
      active = false;
    };
  }, [cacheMedicines, demandMedicineId, location.search, medicineById]);

  useEffect(() => {
    const query = safeText(offerMedicineQuery);
    if (!query) {
      setOfferMedicineOptions([]);
      setSearchingOfferMedicines(false);
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchingOfferMedicines(true);
      try {
        const rows = await searchMedicines(query);
        if (!active) return;
        setOfferMedicineOptions(rows);
        cacheMedicines(rows);
      } catch (error) {
        if (active) {
          setOfferMedicineOptions([]);
        }
      } finally {
        if (active) {
          setSearchingOfferMedicines(false);
        }
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cacheMedicines, offerMedicineQuery, searchMedicines]);

  useEffect(() => {
    const query = safeText(demandMedicineQuery);
    if (!query) {
      setDemandMedicineOptions([]);
      setSearchingDemandMedicines(false);
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchingDemandMedicines(true);
      try {
        const rows = await searchMedicines(query);
        if (!active) return;
        setDemandMedicineOptions(rows);
        cacheMedicines(rows);
      } catch (error) {
        if (active) {
          setDemandMedicineOptions([]);
        }
      } finally {
        if (active) {
          setSearchingDemandMedicines(false);
        }
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cacheMedicines, demandMedicineQuery, searchMedicines]);

  const handleOfferMedicineQueryChange = useCallback((value) => {
    setOfferMedicineQuery(value);
    const selected = medicineByName.get(normalizeLower(value));
    setOfferMedicineId(selected?.id || '');
  }, [medicineByName]);

  const handleDemandMedicineQueryChange = useCallback((value) => {
    setDemandMedicineQuery(value);
    const selected = medicineByName.get(normalizeLower(value));
    setDemandMedicineId(selected?.id || '');
  }, [medicineByName]);

  const selectOfferMedicine = useCallback((medicine) => {
    setOfferMedicineId(medicine.id);
    setOfferMedicineQuery(medicine.name);
  }, []);

  const selectDemandMedicine = useCallback((medicine) => {
    setDemandMedicineId(medicine.id);
    setDemandMedicineQuery(medicine.name);
  }, []);

  const resolveMedicineId = useCallback(async (queryValue) => {
    const normalized = normalizeLower(queryValue);
    if (!normalized) return null;

    const cached = medicineByName.get(normalized);
    if (cached?.id) {
      return cached.id;
    }

    const { data, error } = await supabase.rpc('resolve_or_create_medicine', {
      p_name: safeText(queryValue)
    });
    if (error) throw error;
    if (!data) return null;

    cacheMedicines([{ id: data, name: safeText(queryValue) }]);
    return data;
  }, [cacheMedicines, medicineByName]);

  const loadDemandMatches = useCallback(async (demandId) => {
    if (!demandId) {
      setLatestDemandMatches([]);
      return;
    }

    setLoadingDemandMatches(true);
    try {
      const { data, error } = await supabase.rpc('get_demand_matches', {
        p_demand_id: demandId,
        p_radius_km: radiusKm,
        p_nationwide: includeNationwide
      });
      if (error) throw error;
      setLatestDemandMatches(data || []);
    } catch (error) {
      console.error('Demand match load failed:', error);
      toast.error(error?.message || copy.failedLoadDemandMatches);
      setLatestDemandMatches([]);
    } finally {
      setLoadingDemandMatches(false);
    }
  }, [copy.failedLoadDemandMatches, includeNationwide, radiusKm]);

  useEffect(() => {
    if (!latestDemandId) return;
    loadDemandMatches(latestDemandId);
  }, [latestDemandId, loadDemandMatches]);

  const createOffer = async () => {
    if (!pharmacyId) return;
    let selectedMedicineId = offerMedicineId;
    if (!selectedMedicineId) {
      try {
        selectedMedicineId = await resolveMedicineId(offerMedicineQuery);
      } catch (error) {
        toast.error(error?.message || copy.selectMedicineFirst);
        return;
      }
    }
    if (!selectedMedicineId) {
      toast.error(copy.selectMedicineFirst);
      return;
    }

    const qty = Number(offerQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error(copy.quantityGreaterThanZero);
      return;
    }

    setCreatingOffer(true);
    try {
      const { error } = await supabase.rpc('create_exchange_offer', {
        p_pharmacy_id: pharmacyId,
        p_medicine_id: selectedMedicineId,
        p_quantity: qty,
        p_expiry_date: safeText(offerExpiryDate) || null,
        p_notes: safeText(offerNotes) || null
      });
      if (error) throw error;

      setOfferMedicineId('');
      setOfferMedicineQuery('');
      setOfferQuantity('1');
      setOfferExpiryDate('');
      setOfferNotes('');
      await loadData();
    } catch (error) {
      toast.error(error?.message || copy.failedCreateOffer);
    } finally {
      setCreatingOffer(false);
    }
  };

  const postDemand = async () => {
    if (!pharmacyId) return;
    let selectedMedicineId = demandMedicineId;
    if (!selectedMedicineId) {
      try {
        selectedMedicineId = await resolveMedicineId(demandMedicineQuery);
      } catch (error) {
        toast.error(error?.message || copy.selectMedicineFirst);
        return;
      }
    }
    if (!selectedMedicineId) {
      toast.error(copy.selectMedicineFirst);
      return;
    }

    const parsed = parseOptionalPositiveInt(demandQuantity, copy.quantityPositiveInteger);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }

    setPostingDemand(true);
    try {
      const { data, error } = await supabase.rpc('create_exchange_demand', {
        p_pharmacy_id: pharmacyId,
        p_medicine_id: selectedMedicineId,
        p_quantity: parsed.value,
        p_notes: safeText(demandNotes) || null
      });
      if (error) throw error;

      const newDemandId = data || null;
      if (newDemandId) {
        setLatestDemandId(newDemandId);
        await loadDemandMatches(newDemandId);
      }

      setDemandMedicineId('');
      setDemandMedicineQuery('');
      setDemandQuantity('');
      setDemandExpiryDate('');
      setDemandNotes('');
      await loadData();
    } catch (error) {
      toast.error(error?.message || copy.failedPostDemand);
    } finally {
      setPostingDemand(false);
    }
  };

  const markDemandFulfilled = async (demandId) => {
    if (!demandId) return;
    setFulfillingDemandId(demandId);
    try {
      const { error } = await supabase.rpc('mark_demand_fulfilled', {
        p_demand_id: demandId
      });
      if (error) throw error;

      if (latestDemandId === demandId) {
        setLatestDemandId(null);
        setLatestDemandMatches([]);
      }

      await loadData();
    } catch (error) {
      toast.error(error?.message || copy.failedMarkDemand);
    } finally {
      setFulfillingDemandId(null);
    }
  };

  const updateOfferStatus = async (offerId, status) => {
    if (!offerId || !status || !pharmacyId) return;
    try {
      const { error } = await supabase
        .from('exchange_offers')
        .update({ status })
        .eq('id', offerId)
        .eq('pharmacy_id', pharmacyId);
      if (error) throw error;
      await loadData();
    } catch (error) {
      toast.error(error?.message || copy.failedUpdateOffer);
    }
  };

  const requestExchange = async (offerId) => {
    if (!pharmacyId) return;
    const duplicateRequestMessage = language === 'el'
      ? 'Έχετε ήδη στείλει αίτημα για αυτή την προσφορά'
      : 'You already sent a request for this offer';

    const localOffer =
      activeOffers.find((offer) => offer.id === offerId)
      || myOffers.find((offer) => offer.id === offerId)
      || null;

    if (localOffer?.pharmacy_id === pharmacyId) {
      toast.error(detailsText.ownOfferRequestBlocked);
      return;
    }

    if (!localOffer) {
      const { data: targetOffer, error: targetOfferError } = await supabase
        .from('exchange_offers')
        .select('id, pharmacy_id')
        .eq('id', offerId)
        .maybeSingle();

      if (targetOfferError) {
        toast.error(targetOfferError?.message || copy.failedSendRequest);
        return;
      }
      if (!targetOffer || targetOffer.pharmacy_id === pharmacyId) {
        toast.error(detailsText.ownOfferRequestBlocked);
        return;
      }
    }

    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('exchange_requests')
      .select('id')
      .eq('offer_id', offerId)
      .eq('requesting_pharmacy_id', pharmacyId)
      .maybeSingle();

    if (existingRequestError) {
      toast.error(existingRequestError?.message || copy.failedSendRequest);
      return;
    }

    if (existingRequest?.id) {
      toast.info(duplicateRequestMessage);
      return;
    }

    const promptValue = window.prompt(copy.optionalMessagePrompt);
    if (promptValue === null) return;

    try {
      const { error } = await supabase.from('exchange_requests').insert({
        offer_id: offerId,
        requesting_pharmacy_id: pharmacyId,
        message: safeText(promptValue) || null,
        status: 'pending'
      });
      if (error) {
        if (error.code === '23505') {
          toast.info(duplicateRequestMessage);
          await loadData();
          return;
        }
        throw error;
      }
      await loadData();
    } catch (error) {
      toast.error(error?.message || copy.failedSendRequest);
    }
  };

  const respondIncoming = async (requestId, status) => {
    setBusyRequestId(requestId);
    try {
      const { error } = await supabase
        .from('exchange_requests')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) throw error;

      if (status === 'accepted') {
        const { data, error: rpcError } = await supabase.rpc('get_or_create_exchange_conversation', {
          p_exchange_request_id: requestId
        });
        if (rpcError) throw rpcError;
        if (data) navigate(`/pharmacist/chats/${data}`);
      }

      await loadData();
    } catch (error) {
      toast.error(error?.message || copy.failedUpdateRequest);
    } finally {
      setBusyRequestId(null);
    }
  };

  const openExchangeChat = async (requestId) => {
    try {
      const { data, error } = await supabase.rpc('get_or_create_exchange_conversation', {
        p_exchange_request_id: requestId
      });
      if (error) throw error;
      if (data) navigate(`/pharmacist/chats/${data}`);
    } catch (error) {
      toast.error(error?.message || copy.failedOpenChat);
    }
  };

  const openRequestDetails = async (req) => {
    const requestId = getRequestId(req);
    if (!requestId) return;

    setRequestDetailsLoading(true);
    setSelectedRequest(null);
    setIsRequestDetailsOpen(true);
    try {
      const { data, error } = await supabase.rpc('get_exchange_request_details', {
        p_request_id: requestId
      });
      if (error) throw error;

      const details = Array.isArray(data) ? data[0] : data;
      if (!details) {
        throw new Error(copy.failedLoadRequestDetails);
      }

      setSelectedRequest({
        id: details.request_id,
        status: details.request_status,
        created_at: details.requested_at,
        responded_at: details.responded_at,
        message: details.request_message,
        medicine_name: details.medicine_name,
        offer: {
          id: details.offer_id,
          status: details.offer_status,
          quantity: details.offer_quantity,
          expiry_date: details.offer_expiry_date,
          notes: details.offer_notes,
          medicine_id: details.medicine_id
        },
        requestingPharmacy: {
          id: details.requester_pharmacy_id,
          name: details.requester_pharmacy_name
        },
        offerPharmacy: {
          id: details.target_pharmacy_id,
          name: details.target_pharmacy_name
        }
      });
    } catch (error) {
      setIsRequestDetailsOpen(false);
      toast.error(error?.message || copy.failedLoadRequestDetails);
    } finally {
      setRequestDetailsLoading(false);
    }
  };

  const openDemandDetails = (demand) => {
    if (!demand?.id) return;
    setSelectedDemand(demand);
    setIsDemandDetailsOpen(true);
  };

  const openOfferDetails = (offer) => {
    if (!offer?.id) return;
    setSelectedOffer(offer);
    setIsOfferDetailsOpen(true);
  };

  const getDemandStatusLabel = (status) => {
    const normalized = normalizeLower(status);
    if (normalized === 'open') return demandDetailsText.open;
    if (normalized === 'fulfilled') return demandDetailsText.fulfilled;
    return statusLabel(status, copy.status);
  };

  const selectedRequestMedicineName = selectedRequest?.medicine_name
    || (selectedRequest?.offer?.medicine_id
      ? (medicineById.get(selectedRequest.offer.medicine_id)?.name || copy.medicineFallback)
      : copy.medicineFallback);
  const selectedRequestMessage = safeText(selectedRequest?.message);
  const selectedRequestOfferNotes = safeText(selectedRequest?.offer?.notes);
  const selectedDemandMedicineName = selectedDemand?.medicine?.name
    || (selectedDemand?.medicine_id
      ? (medicineById.get(selectedDemand.medicine_id)?.name || copy.medicineFallback)
      : copy.medicineFallback);
  const selectedDemandNotes = safeText(selectedDemand?.notes);
  const selectedOfferMedicineName = selectedOffer?.medicine?.name
    || (selectedOffer?.medicine_id
      ? (medicineById.get(selectedOffer.medicine_id)?.name || copy.medicineFallback)
      : copy.medicineFallback);
  const selectedOfferNotes = safeText(selectedOffer?.notes);
  const selectedOfferDistanceLabel = selectedOffer
    ? formatDistanceAndLocation(
      selectedOffer.distance_km,
      copy.kmSuffix,
      selectedOffer.pharmacy_city,
      selectedOffer.pharmacy_region
    )
    : '';

  if (!isPharmacist()) return null;

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="inter-pharmacy-page">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link to="/pharmacist">
            <Button variant="ghost" size="sm" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="font-heading font-semibold text-pharma-dark-slate">{copy.pageTitle}</h1>
            <p className="text-xs text-pharma-slate-grey hidden sm:block">
              {copy.pageSubtitle}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:inline-flex rounded-full px-2.5 py-1 text-xs bg-pharma-teal/10 text-pharma-teal">
              {activeOffers.length} {copy.active}
            </span>
            <Link to="/pharmacist/chats">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                <MessageCircle className="w-4 h-4" />
                {copy.chats}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <SkeletonList count={3} CardComponent={SkeletonPharmacyCard} />
        ) : !myPharmacy ? (
          <EmptyState icon={MessageCircle} title={copy.noPharmacyTitle} description={copy.noPharmacyDescription} />
        ) : (
          <>
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-pharma-dark-slate font-medium">{copy.radiusLabel}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {[25, 50, 100].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={!includeNationwide && radiusKm === value ? 'default' : 'outline'}
                      className={`rounded-full ${!includeNationwide && radiusKm === value ? 'bg-pharma-teal hover:bg-pharma-teal/90 text-white' : ''}`}
                      onClick={() => {
                        setRadiusKm(value);
                        setIncludeNationwide(false);
                      }}
                      data-testid={`exchange-radius-${value}`}
                    >
                      {value} {copy.kmSuffix}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={includeNationwide ? 'default' : 'outline'}
                    className={`rounded-full ${includeNationwide ? 'bg-pharma-teal hover:bg-pharma-teal/90 text-white' : ''}`}
                    onClick={() => setIncludeNationwide((current) => !current)}
                    data-testid="exchange-radius-nationwide"
                  >
                    {copy.nationwide}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-pharma-teal/10 text-pharma-teal flex items-center justify-center">
                      <Pill className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-heading font-semibold text-pharma-dark-slate">{copy.createOfferTitle}</h2>
                      <p className="text-xs text-pharma-slate-grey">{copy.createOfferDescription}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <MedicineSearchInput
                      className="md:col-span-2"
                      value={offerMedicineQuery}
                      onValueChange={handleOfferMedicineQueryChange}
                      options={offerMedicineOptions}
                      onSelect={selectOfferMedicine}
                      searching={searchingOfferMedicines}
                      placeholder={copy.searchMedicinePlaceholder}
                      searchingLabel={copy.searchingMedicines}
                      emptyLabel={copy.noMedicineResults}
                      testId="exchange-offer-medicine-select"
                    />
                    <div className="space-y-1">
                      <p className="text-[11px] text-pharma-slate-grey px-1">{copy.quantity}</p>
                      <Input
                        type="number"
                        min="1"
                        className="h-10 rounded-xl"
                        value={offerQuantity}
                        onChange={(e) => setOfferQuantity(e.target.value)}
                        placeholder={copy.quantity}
                        data-testid="exchange-offer-quantity-input"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-pharma-slate-grey px-1">{copy.expiryDateOptional}</p>
                      <Input
                        type="date"
                        className="h-10 rounded-xl [color-scheme:light]"
                        value={offerExpiryDate}
                        onChange={(e) => setOfferExpiryDate(e.target.value)}
                        data-testid="exchange-offer-expiry-input"
                      />
                    </div>
                    <Button
                      className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90 md:col-span-2"
                      onClick={createOffer}
                      disabled={creatingOffer}
                      data-testid="exchange-offer-create-submit"
                    >
                      {creatingOffer ? copy.saving : copy.createOfferAction}
                    </Button>
                  </div>
                  <Input
                    value={offerNotes}
                    onChange={(e) => setOfferNotes(e.target.value)}
                    placeholder={copy.notesOptional}
                    data-testid="exchange-offer-notes-input"
                  />
                </CardContent>
              </Card>

              <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-pharma-steel-blue/10 text-pharma-steel-blue flex items-center justify-center">
                      <Clock3 className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-heading font-semibold text-pharma-dark-slate">{copy.needMedicineTitle}</h2>
                      <p className="text-xs text-pharma-slate-grey">{copy.needMedicineDescription}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <MedicineSearchInput
                      className="md:col-span-2"
                      value={demandMedicineQuery}
                      onValueChange={handleDemandMedicineQueryChange}
                      options={demandMedicineOptions}
                      onSelect={selectDemandMedicine}
                      searching={searchingDemandMedicines}
                      placeholder={copy.searchMedicinePlaceholder}
                      searchingLabel={copy.searchingMedicines}
                      emptyLabel={copy.noMedicineResults}
                      testId="exchange-demand-medicine-select"
                    />
                    <div className="space-y-1">
                      <p className="text-[11px] text-pharma-slate-grey px-1">{copy.quantityOptional}</p>
                      <Input
                        type="number"
                        min="1"
                        className="h-10 rounded-xl"
                        value={demandQuantity}
                        onChange={(e) => setDemandQuantity(e.target.value)}
                        placeholder={copy.quantityOptional}
                        data-testid="exchange-demand-quantity-input"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-pharma-slate-grey px-1">{copy.expiryDateOptional}</p>
                      <Input
                        type="date"
                        className="h-10 rounded-xl [color-scheme:light]"
                        value={demandExpiryDate}
                        onChange={(e) => setDemandExpiryDate(e.target.value)}
                        data-testid="exchange-demand-expiry-input"
                      />
                    </div>
                    <Button
                      className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90 md:col-span-2"
                      onClick={postDemand}
                      disabled={postingDemand}
                      data-testid="exchange-demand-post-submit"
                    >
                      {postingDemand ? copy.posting : copy.postDemandAction}
                    </Button>
                  </div>
                  <Input
                    value={demandNotes}
                    onChange={(e) => setDemandNotes(e.target.value)}
                    placeholder={copy.notesOptional}
                    data-testid="exchange-demand-notes-input"
                  />
                </CardContent>
              </Card>
            </div>

            {latestDemandId && (
              <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale flex flex-col max-h-[45vh]">
                <CardContent className="p-5 flex flex-col min-h-0 gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-heading font-semibold text-pharma-dark-slate">{copy.matchesLatestDemand}</h2>
                    <span className="text-xs rounded-full px-2.5 py-1 bg-pharma-teal/10 text-pharma-teal">
                      {latestDemandMatches.length} {latestDemandMatches.length === 1 ? copy.matchOne : copy.matchMany}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    {loadingDemandMatches ? (
                      <div className="text-sm text-pharma-slate-grey">{copy.loadingMatches}</div>
                    ) : latestDemandMatches.length === 0 ? (
                      <EmptyState
                        icon={MessageCircle}
                        title={copy.noMatchesTitle}
                        description={copy.noMatchesDescription}
                      />
                    ) : (
                      <div className="space-y-3">
                        {latestDemandMatches.map((match) => {
                          const expiryMeta = getExpiryMetaFromClassification(match.expiry_classification, copy.expiry);
                          const distanceLabel = formatDistanceAndLocation(
                            match.distance_km,
                            copy.kmSuffix,
                            match.offer_pharmacy_city,
                            match.offer_pharmacy_region
                          );
                          return (
                            <Card key={match.offer_id} className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium text-pharma-dark-slate truncate">
                                    {medicineById.get(match.medicine_id)?.name || copy.medicineFallback}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pharma-slate-grey">
                                    <span>{match.offer_pharmacy_name || '-'}</span>
                                    {distanceLabel && <span>{distanceLabel}</span>}
                                    <span>{copy.qtyPrefix} {match.quantity}</span>
                                    <span className={`rounded-full px-2 py-0.5 font-medium ${expiryMeta.badgeClass}`}>
                                      {expiryMeta.label}
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90"
                                  onClick={() => requestExchange(match.offer_id)}
                                  data-testid={`exchange-demand-match-request-${match.offer_id}`}
                                >
                                  {copy.requestExchange}
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale flex flex-col max-h-[45vh]">
                <CardContent className="p-5 flex flex-col min-h-0 gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-heading font-semibold text-pharma-dark-slate">{copy.myOpenDemands}</h2>
                      <p className="text-xs text-pharma-slate-grey">{copy.myOpenDemandsSubtitle}</p>
                    </div>
                    <span className="text-xs rounded-full px-2.5 py-1 bg-pharma-steel-blue/10 text-pharma-steel-blue">
                      {myOpenDemands.length}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
                    {myOpenDemands.length === 0 ? (
                      <EmptyState
                        icon={MessageCircle}
                        title={copy.noOpenDemandsTitle}
                        description={copy.noOpenDemandsDescription}
                      />
                    ) : (
                      <div className="space-y-3">
                        {myOpenDemands.map((demand) => (
                          <Card key={demand.id} className="bg-pharma-steel-blue/5 rounded-2xl shadow-card border-pharma-steel-blue/20">
                            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-pharma-dark-slate truncate">{demand.medicine?.name || copy.medicineFallback}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pharma-slate-grey">
                                  <span>{copy.qtyPrefix} {demand.quantity || '-'}</span>
                                  <span>{copy.posted} {formatDate(demand.created_at, locale)}</span>
                                  <span className="rounded-full px-2 py-0.5 font-medium bg-pharma-steel-blue/10 text-pharma-steel-blue">{copy.open}</span>
                                </div>
                              </div>
                              <div className="shrink-0 flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-full whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                  onClick={() => openDemandDetails(demand)}
                                  data-testid={`exchange-request-details-sent-${demand.id}`}
                                >
                                  {detailsText.viewDetails}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-full whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                  onClick={() => markDemandFulfilled(demand.id)}
                                  disabled={fulfillingDemandId === demand.id}
                                  data-testid={`exchange-demand-fulfill-${demand.id}`}
                                >
                                  {fulfillingDemandId === demand.id ? copy.saving : copy.markFulfilled}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale flex flex-col max-h-[45vh]">
                <CardContent className="p-5 flex flex-col min-h-0 gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-heading font-semibold text-pharma-dark-slate">{copy.activeOffers}</h2>
                      <p className="text-xs text-pharma-slate-grey">{copy.activeOffersSubtitle}</p>
                    </div>
                    <span className="text-xs rounded-full px-2.5 py-1 bg-pharma-teal/10 text-pharma-teal">
                      {activeOffers.length}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    {activeOffers.length === 0 ? (
                      <EmptyState
                        icon={MessageCircle}
                        title={copy.noActiveOffersTitle}
                        description={copy.noActiveOffersDescription}
                      />
                    ) : (
                      <div className="space-y-3">
                        {activeOffers.map((offer) => {
                          const expiryMeta = getExpiryMeta(offer.expiry_date, copy.expiry);
                          const distanceLabel = formatDistanceAndLocation(
                            offer.distance_km,
                            copy.kmSuffix,
                            offer.pharmacy_city,
                            offer.pharmacy_region
                          );
                          return (
                            <Card key={offer.id} className="bg-pharma-steel-blue/5 rounded-2xl shadow-card border-pharma-steel-blue/20">
                              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium text-pharma-dark-slate truncate">{offer.medicine?.name || copy.medicineFallback}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pharma-slate-grey">
                                    <span>{offer.pharmacy?.name || '-'}</span>
                                    {distanceLabel && <span>{distanceLabel}</span>}
                                    <span>{copy.qtyPrefix} {offer.quantity}</span>
                                    <span>{copy.expPrefix} {formatDate(offer.expiry_date, locale)}</span>
                                    <span className={`rounded-full px-2 py-0.5 font-medium ${expiryMeta.badgeClass}`}>
                                      {expiryMeta.label}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-full whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                    onClick={() => openOfferDetails(offer)}
                                    data-testid={`exchange-offer-details-active-${offer.id}`}
                                  >
                                    {detailsText.viewDetails}
                                  </Button>
                                  <Button
                                    className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90"
                                    onClick={() => requestExchange(offer.id)}
                                    data-testid={`exchange-request-offer-${offer.id}`}
                                  >
                                    {copy.requestExchange}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale flex flex-col max-h-[45vh]">
                <CardContent className="p-5 flex flex-col min-h-0 gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-heading font-semibold text-pharma-dark-slate">{copy.myOffers}</h2>
                      <p className="text-xs text-pharma-slate-grey">{copy.myOffersSubtitle}</p>
                    </div>
                    <span className="text-xs rounded-full px-2.5 py-1 bg-pharma-slate-grey/10 text-pharma-slate-grey">
                      {myOffers.length}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    {myOffers.length === 0 ? (
                      <EmptyState
                        icon={MessageCircle}
                        title={copy.noOffersTitle}
                        description={copy.noOffersDescription}
                      />
                    ) : (
                      <div className="space-y-3">
                        {myOffers.map((offer) => {
                          const expiryMeta = getExpiryMeta(offer.expiry_date, copy.expiry);
                          return (
                            <Card key={offer.id} className="bg-pharma-steel-blue/5 rounded-2xl shadow-card border-pharma-steel-blue/20">
                              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium text-pharma-dark-slate truncate">{offer.medicine?.name || copy.medicineFallback}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pharma-slate-grey">
                                    <span>{copy.qtyPrefix} {offer.quantity}</span>
                                    <span>{copy.posted} {formatDate(offer.created_at, locale)}</span>
                                    <span className={`rounded-full px-2 py-0.5 font-medium ${getRequestStatusBadgeClass(offer.status)}`}>
                                      {statusLabel(offer.status, copy.status)}
                                    </span>
                                    <span className={`rounded-full px-2 py-0.5 font-medium ${expiryMeta.badgeClass}`}>
                                      {expiryMeta.label}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-full whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                    onClick={() => openOfferDetails(offer)}
                                    data-testid={`exchange-offer-details-mine-${offer.id}`}
                                  >
                                    {detailsText.viewDetails}
                                  </Button>
                                  {offer.status === 'active' && (
                                    <Button
                                      variant="outline"
                                      className="rounded-full whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                      onClick={() => updateOfferStatus(offer.id, 'withdrawn')}
                                      data-testid={`exchange-withdraw-offer-${offer.id}`}
                                    >
                                      {copy.withdraw}
                                    </Button>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale flex flex-col max-h-[45vh]">
                <CardContent className="p-5 flex flex-col min-h-0 gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-heading font-semibold text-pharma-dark-slate">{copy.incomingRequests}</h2>
                      <p className="text-xs text-pharma-slate-grey">{copy.incomingRequestsSubtitle}</p>
                    </div>
                    <span className="text-xs rounded-full px-2.5 py-1 bg-pharma-steel-blue/10 text-pharma-steel-blue">
                      {incomingRequests.length}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    {incomingRequests.length === 0 ? (
                      <EmptyState
                        icon={MessageCircle}
                        title={copy.noIncomingRequestsTitle}
                        description={copy.noIncomingRequestsDescription}
                      />
                    ) : (
                      <div className="space-y-3">
                        {incomingRequests.map((req) => {
                          const requestId = req.id;
                          if (!requestId) return null;
                          return (
                            <Card key={requestId} className="bg-pharma-steel-blue/5 rounded-2xl shadow-card border-pharma-steel-blue/20">
                              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium text-pharma-dark-slate truncate">
                                    {req.offer?.medicine_id ? (medicineById.get(req.offer.medicine_id)?.name || copy.medicineFallback) : copy.medicineFallback}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pharma-slate-grey">
                                    <span>{req.requestingPharmacy?.name || '-'}</span>
                                    <span>{copy.requested} {formatDate(req.created_at, locale)}</span>
                                    <span className={`rounded-full px-2 py-0.5 font-medium ${getRequestStatusBadgeClass(req.status)}`}>
                                      {statusLabel(req.status, copy.status)}
                                    </span>
                                  </div>
                                  {(safeText(req.message) || safeText(req.offer?.notes)) && (
                                    <div className="mt-2 space-y-1">
                                      {safeText(req.message) && (
                                        <p className="text-xs text-pharma-slate-grey break-words">
                                          <span className="font-medium">{detailsText.requestMessageLabel}:</span> {req.message}
                                        </p>
                                      )}
                                      {safeText(req.offer?.notes) && (
                                        <p className="text-xs text-pharma-slate-grey break-words">
                                          <span className="font-medium">{detailsText.offerNotesLabel}:</span> {req.offer.notes}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="shrink-0 flex flex-wrap items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-full whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                    onClick={() => openRequestDetails(req)}
                                    data-testid={`exchange-request-details-incoming-${requestId}`}
                                  >
                                    {detailsText.viewDetails}
                                  </Button>
                                  {req.status === 'pending' && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="rounded-full whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                        onClick={() => respondIncoming(requestId, 'accepted')}
                                        disabled={busyRequestId === requestId}
                                        data-testid={`exchange-accept-${requestId}`}
                                      >
                                        {copy.accept}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="rounded-full whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                        onClick={() => respondIncoming(requestId, 'rejected')}
                                        disabled={busyRequestId === requestId}
                                        data-testid={`exchange-reject-${requestId}`}
                                      >
                                        {copy.reject}
                                      </Button>
                                    </>
                                  )}
                                  {req.status === 'accepted' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-full gap-1 whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                      onClick={() => openExchangeChat(requestId)}
                                      data-testid={`exchange-open-chat-${requestId}`}
                                    >
                                      <MessageCircle className="w-4 h-4" />
                                      {copy.openChat}
                                    </Button>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}

                    {sentRequests.length > 0 && (
                      <div className="pt-3 mt-3 border-t border-pharma-grey-pale space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-pharma-dark-slate">{copy.sentRequestsTitle}</p>
                          <span className="text-xs rounded-full px-2.5 py-1 bg-pharma-slate-grey/10 text-pharma-slate-grey">
                            {sentRequests.length}
                          </span>
                        </div>
                        {sentRequests.map((req) => {
                          const requestId = req.id;
                          if (!requestId) return null;
                          return (
                            <Card key={requestId} className="bg-pharma-steel-blue/5 rounded-2xl shadow-card border-pharma-steel-blue/20">
                              <CardContent className="p-3 flex flex-col gap-2">
                                <div className="min-w-0">
                                  <p className="font-medium text-pharma-dark-slate truncate">
                                    {req.offer?.medicine_id ? (medicineById.get(req.offer.medicine_id)?.name || copy.medicineFallback) : copy.medicineFallback}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pharma-slate-grey">
                                    <span>{req.offerPharmacy?.name || '-'}</span>
                                    <span>{copy.requested} {formatDate(req.created_at, locale)}</span>
                                    <span className={`rounded-full px-2 py-0.5 font-medium ${getRequestStatusBadgeClass(req.status)}`}>
                                      {statusLabel(req.status, copy.status)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-full whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                    onClick={() => openRequestDetails(req)}
                                    data-testid={`exchange-request-details-sent-${requestId}`}
                                  >
                                    {detailsText.viewDetails}
                                  </Button>
                                  {req.status === 'accepted' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-full gap-1 whitespace-nowrap border-pharma-steel-blue/30 text-pharma-steel-blue hover:bg-pharma-steel-blue/10 hover:text-pharma-steel-blue"
                                      onClick={() => openExchangeChat(requestId)}
                                      data-testid={`exchange-open-chat-sent-${requestId}`}
                                    >
                                      <MessageCircle className="w-4 h-4" />
                                      {copy.openChat}
                                    </Button>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

          </>
        )}
      </main>

      <Dialog
        open={isRequestDetailsOpen}
        onOpenChange={(open) => {
          setIsRequestDetailsOpen(open);
          if (!open) {
            setSelectedRequest(null);
            setRequestDetailsLoading(false);
          }
        }}
      >
        <DialogContent className="bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-pharma-dark-slate">
              {detailsText.detailsTitle}
            </DialogTitle>
          </DialogHeader>

          {requestDetailsLoading ? (
            <div className="py-6 text-sm text-pharma-slate-grey">{copy.loadingMatches}</div>
          ) : selectedRequest ? (
            <div className="space-y-3 py-2 text-sm text-pharma-charcoal">
              <div className="rounded-xl border border-pharma-grey-pale p-3 bg-pharma-ice-blue/30">
                <p className="font-medium text-pharma-dark-slate">{selectedRequestMedicineName}</p>
                <div className="mt-2 space-y-1 text-xs text-pharma-slate-grey">
                  <p>
                    <span className="font-medium">{detailsText.requestStatusLabel}:</span>{' '}
                    {statusLabel(selectedRequest.status, copy.status)}
                  </p>
                  <p>
                    <span className="font-medium">{detailsText.offerStatusLabel}:</span>{' '}
                    {selectedRequest?.offer?.status
                      ? statusLabel(selectedRequest.offer.status, copy.status)
                      : '-'}
                  </p>
                  <p>
                    <span className="font-medium">{detailsText.fromPharmacyLabel}:</span>{' '}
                    {selectedRequest.requestingPharmacy?.name || '-'}
                  </p>
                  <p>
                    <span className="font-medium">{detailsText.toPharmacyLabel}:</span>{' '}
                    {selectedRequest.offerPharmacy?.name || '-'}
                  </p>
                  <p>
                    <span className="font-medium">{detailsText.requestedAtLabel}:</span>{' '}
                    {formatDate(selectedRequest.created_at, locale)}
                  </p>
                  <p>
                    <span className="font-medium">{detailsText.offerQuantityLabel}:</span>{' '}
                    {selectedRequest?.offer?.quantity || '-'}
                  </p>
                  <p>
                    <span className="font-medium">{detailsText.offerExpiryLabel}:</span>{' '}
                    {formatDate(selectedRequest?.offer?.expiry_date, locale)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-pharma-slate-grey">{detailsText.requestMessageLabel}</p>
                  <p className="text-sm text-pharma-charcoal whitespace-pre-wrap break-words">
                    {selectedRequestMessage || detailsText.noNotesLabel}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-pharma-slate-grey">{detailsText.offerNotesLabel}</p>
                  <p className="text-sm text-pharma-charcoal whitespace-pre-wrap break-words">
                    {selectedRequestOfferNotes || detailsText.noNotesLabel}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setIsRequestDetailsOpen(false);
                setSelectedRequest(null);
                setRequestDetailsLoading(false);
              }}
            >
              {detailsText.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDemandDetailsOpen}
        onOpenChange={(open) => {
          setIsDemandDetailsOpen(open);
          if (!open) {
            setSelectedDemand(null);
          }
        }}
      >
        <DialogContent className="bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-pharma-dark-slate">
              {demandDetailsText.title}
            </DialogTitle>
          </DialogHeader>

          {selectedDemand ? (
            <div className="space-y-3 py-2 text-sm text-pharma-charcoal">
              <div className="rounded-xl border border-pharma-grey-pale p-3 bg-pharma-ice-blue/30">
                <p className="text-xs font-medium text-pharma-slate-grey">{demandDetailsText.medicineLabel}</p>
                <p className="font-medium text-pharma-dark-slate">{selectedDemandMedicineName}</p>
                <div className="mt-2 space-y-1 text-xs text-pharma-slate-grey">
                  <p>
                    <span className="font-medium">{demandDetailsText.quantityLabel}:</span>{' '}
                    {selectedDemand.quantity || '-'}
                  </p>
                  <p>
                    <span className="font-medium">{demandDetailsText.createdAtLabel}:</span>{' '}
                    {formatDate(selectedDemand.created_at, locale)}
                  </p>
                  <p>
                    <span className="font-medium">{demandDetailsText.statusLabel}:</span>{' '}
                    {getDemandStatusLabel(selectedDemand.status)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-pharma-slate-grey">{demandDetailsText.notesLabel}</p>
                <p className="text-sm text-pharma-charcoal whitespace-pre-wrap break-words">
                  {selectedDemandNotes || detailsText.noNotesLabel}
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setIsDemandDetailsOpen(false);
                setSelectedDemand(null);
              }}
            >
              {detailsText.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isOfferDetailsOpen}
        onOpenChange={(open) => {
          setIsOfferDetailsOpen(open);
          if (!open) {
            setSelectedOffer(null);
          }
        }}
      >
        <DialogContent className="bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-pharma-dark-slate">
              {offerDetailsText.title}
            </DialogTitle>
          </DialogHeader>

          {selectedOffer ? (
            <div className="space-y-3 py-2 text-sm text-pharma-charcoal">
              <div className="rounded-xl border border-pharma-grey-pale p-3 bg-pharma-ice-blue/30">
                <p className="text-xs font-medium text-pharma-slate-grey">{offerDetailsText.medicineLabel}</p>
                <p className="font-medium text-pharma-dark-slate">{selectedOfferMedicineName}</p>
                <div className="mt-2 space-y-1 text-xs text-pharma-slate-grey">
                  <p>
                    <span className="font-medium">{offerDetailsText.quantityLabel}:</span>{' '}
                    {selectedOffer.quantity || '-'}
                  </p>
                  <p>
                    <span className="font-medium">{offerDetailsText.expiryLabel}:</span>{' '}
                    {formatDate(selectedOffer.expiry_date, locale)}
                  </p>
                  <p>
                    <span className="font-medium">{offerDetailsText.createdAtLabel}:</span>{' '}
                    {formatDate(selectedOffer.created_at, locale)}
                  </p>
                  <p>
                    <span className="font-medium">{offerDetailsText.statusLabel}:</span>{' '}
                    {statusLabel(selectedOffer.status, copy.status)}
                  </p>
                  <p>
                    <span className="font-medium">{offerDetailsText.pharmacyLabel}:</span>{' '}
                    {selectedOffer?.pharmacy?.name || myPharmacy?.name || '-'}
                  </p>
                  {selectedOfferDistanceLabel && (
                    <p>
                      <span className="font-medium">{offerDetailsText.distanceLabel}:</span>{' '}
                      {selectedOfferDistanceLabel}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-pharma-slate-grey">{offerDetailsText.notesLabel}</p>
                <p className="text-sm text-pharma-charcoal whitespace-pre-wrap break-words">
                  {selectedOfferNotes || detailsText.noNotesLabel}
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setIsOfferDetailsOpen(false);
                setSelectedOffer(null);
              }}
            >
              {detailsText.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
