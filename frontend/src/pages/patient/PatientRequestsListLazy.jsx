import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { SkeletonList, SkeletonCard } from '../../components/ui/skeleton-loaders';
import { EmptyState } from '../../components/ui/empty-states';
import { ClipboardList, MapPin } from 'lucide-react';

const HistoryTab = lazy(() => import('./PatientRequestsHistoryTab'));

const PatientRequestsListLazy = ({
  requests,
  requestsLoading,
  remainingAcceptedCancels,
  cancelPatientRequest,
  cancelingId,
  choosePharmacyForRequest,
  choosingPharmacyId
}) => {
  const { t, language } = useLanguage();
  const [requestsTab, setRequestsTab] = useState('active');
  const [historyVisibleCount, setHistoryVisibleCount] = useState(5);

  const activeRequests = useMemo(() => {
    const now = Date.now();
    return (requests || []).filter((request) => {
      const isPendingOrAccepted = request.status === 'pending' || request.status === 'accepted';
      const isNotExpired = !request.expires_at || new Date(request.expires_at).getTime() > now;
      return isPendingOrAccepted && isNotExpired;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [requests]);

  const historyRequests = useMemo(() => {
    const now = Date.now();
    return (requests || []).filter((request) => {
      const isCancelledOrRejected = request.status === 'cancelled' || request.status === 'rejected';
      const isTimeExpired = request.expires_at && new Date(request.expires_at).getTime() <= now;
      return isCancelledOrRejected || isTimeExpired;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [requests]);

  const visibleHistoryRequests = useMemo(() => historyRequests.slice(0, historyVisibleCount), [historyRequests, historyVisibleCount]);

  useEffect(() => {
    if (requestsTab === 'history') {
      setHistoryVisibleCount(5);
    }
  }, [requestsTab]);

  const formOptions = useMemo(() => ([
    { value: 'tablet', label: language === 'el' ? 'Δισκίο' : 'Tablet' },
    { value: 'capsule', label: language === 'el' ? 'Κάψουλα' : 'Capsule' },
    { value: 'syrup', label: language === 'el' ? 'Σιρόπι' : 'Syrup' },
    { value: 'cream', label: language === 'el' ? 'Κρέμα' : 'Cream' },
    { value: 'drops', label: language === 'el' ? 'Σταγόνες' : 'Drops' },
    { value: 'spray', label: language === 'el' ? 'Spray' : 'Spray' },
    { value: 'injection', label: language === 'el' ? 'Ένεση' : 'Injection' },
    { value: 'other', label: language === 'el' ? 'Άλλο' : 'Other' }
  ]), [language]);

  const urgencyOptions = useMemo(() => ([
    { value: 'normal', label: language === 'el' ? 'Κανονικό' : 'Normal' },
    { value: 'urgent', label: language === 'el' ? 'Επείγον' : 'Urgent' }
  ]), [language]);

  const formLabelMap = useMemo(() => formOptions.reduce((acc, option) => {
    acc[option.value] = option.label;
    return acc;
  }, {}), [formOptions]);

  const urgencyLabelMap = useMemo(() => urgencyOptions.reduce((acc, option) => {
    acc[option.value] = option.label;
    return acc;
  }, {}), [urgencyOptions]);

  const formatTemplate = (template, values) =>
    template.replace(/\{(\w+)\}/g, (_, key) => (values[key] ?? ''));

  const getRemainingLabel = (expiresAt) => {
    if (!expiresAt) return '';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return t('requestExpired');
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return formatTemplate(t('requestExpiresInHours'), { hours });
    }
    return formatTemplate(t('requestExpiresInMinutes'), { minutes });
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString(language === 'el' ? 'el-GR' : 'en-US');
  };

  const formatDate = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleString(language === 'el' ? 'el-GR' : 'en-US');
  };

  const getHistoryStatusLabel = (request) => {
    const isExpired = request.expires_at && new Date(request.expires_at).getTime() <= Date.now();
    if (request.status === 'cancelled') return language === 'el' ? 'Ακυρώθηκε' : 'Cancelled';
    if (request.status === 'rejected') return language === 'el' ? 'Απορρίφθηκε' : 'Rejected';
    if (isExpired) return language === 'el' ? 'Έληξε' : 'Expired';
    return language === 'el' ? 'Ολοκληρώθηκε' : 'Completed';
  };

  const getRequestStatusConfig = (status) => {
    const config = {
      pending: {
        label: t('requestStatusPending'),
        className: 'bg-pharma-steel-blue/10 text-pharma-steel-blue border border-pharma-steel-blue/20'
      },
      accepted: {
        label: t('requestStatusAccepted'),
        className: 'bg-pharma-sea-green/10 text-pharma-sea-green border border-pharma-sea-green/20'
      },
      rejected: {
        label: t('requestStatusRejected'),
        className: 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20'
      },
      declined: {
        label: t('requestStatusRejected'),
        className: 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20'
      },
      closed: {
        label: t('requestStatusClosed'),
        className: 'bg-pharma-coral/10 text-pharma-coral border border-pharma-coral/20'
      },
      cancelled: {
        label: language === 'el' ? 'Ακυρώθηκε' : 'Cancelled',
        className: 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20'
      },
      expired: {
        label: language === 'el' ? 'Έληξε' : 'Expired',
        className: 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20'
      }
    };

    return config[status] || config.pending;
  };

  const getLastResponse = (recipients) => {
    const responses = (recipients || []).filter(r => r.responded_at);
    if (responses.length === 0) return null;
    return [...responses].sort((a, b) => new Date(b.responded_at) - new Date(a.responded_at))[0];
  };

  const getRecipientSummary = (recipients) => {
    const summary = { pending: 0, accepted: 0, rejected: 0 };
    (recipients || []).forEach((recipient) => {
      const status = recipient.status === 'declined' ? 'rejected' : recipient.status;
      if (summary[status] !== undefined) summary[status] += 1;
    });
    return summary;
  };

  const isExpiredRequest = (request) => {
    if (!request?.expires_at) return false;
    return new Date(request.expires_at).getTime() < Date.now();
  };

  const renderRequestCard = (request, isHistory) => {
    const expired = isExpiredRequest(request);
    const statusKey = expired ? 'expired' : request.status;
    const statusConfig = getRequestStatusConfig(statusKey);
    const historyStatusLabel = getHistoryStatusLabel(request);
    const lastResponse = getLastResponse(request.patient_request_recipients);
    const summary = getRecipientSummary(request.patient_request_recipients);
    const acceptedRecipients = (request.patient_request_recipients || [])
      .filter((recipient) => recipient.request_id === request.id && recipient.status === 'accepted');
    const remainingLabel = getRemainingLabel(request.expires_at);
    const canCancel = !isHistory && !expired && request.status !== 'cancelled';
    const canChoosePharmacy = ['pending', 'accepted'].includes(request.status)
      && !request.selected_pharmacy_id;
    const selectedRecipient = request.selected_pharmacy_id
      ? acceptedRecipients.find((recipient) => recipient.pharmacy_id === request.selected_pharmacy_id)
      : null;

    return (
      <Card
        key={request.id}
        className="bg-white rounded-2xl shadow-card border-pharma-grey-pale"
        data-testid={`patient-request-${request.id}`}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-heading font-semibold text-pharma-dark-slate truncate">
                {request.medicine_query}
              </h3>
              <div className="text-sm text-pharma-slate-grey mt-1 flex flex-wrap gap-2">
                <span className="bg-pharma-ice-blue px-2 py-0.5 rounded-full text-xs">
                  {language === 'el' ? 'Δοσολογία' : 'Dosage'}:{' '}
                  {request.dosage || (language === 'el' ? 'Δεν ορίστηκε' : 'Not set')}
                </span>
                <span className="bg-pharma-ice-blue px-2 py-0.5 rounded-full text-xs">
                  {language === 'el' ? 'Μορφή' : 'Form'}:{' '}
                  {request.form ? (formLabelMap[request.form] || request.form) : (language === 'el' ? 'Δεν ορίστηκε' : 'Not set')}
                </span>
                <span className="bg-pharma-ice-blue px-2 py-0.5 rounded-full text-xs">
                  {language === 'el' ? 'Επείγον' : 'Urgency'}:{' '}
                  {request.urgency ? (urgencyLabelMap[request.urgency] || request.urgency) : (language === 'el' ? 'Δεν ορίστηκε' : 'Not set')}
                </span>
              </div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${isHistory ? 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20' : statusConfig.className}`}>
              {isHistory ? historyStatusLabel : statusConfig.label}
            </span>
          </div>
          <div className="text-xs text-pharma-slate-grey space-y-1">
            <p>{language === 'el' ? 'Δημιουργήθηκε' : 'Created'}: {formatDate(request.created_at)}</p>
            {isHistory ? (
              <>
                {request.cancelled_at && (
                  <p>{language === 'el' ? 'Ακυρώθηκε' : 'Cancelled'}: {formatDate(request.cancelled_at)}</p>
                )}
                {request.expires_at && (
                  <p>
                    {new Date(request.expires_at) <= Date.now()
                      ? `${language === 'el' ? 'Έληξε' : 'Expired'}: ${formatDate(request.expires_at)}`
                      : `${language === 'el' ? 'Λήγει' : 'Expires'}: ${formatDate(request.expires_at)}`}
                  </p>
                )}
              </>
            ) : (
              <p>
                {t('requestExpiresLabel')} {formatDateTime(request.expires_at)} - {remainingLabel}
              </p>
            )}
            <p>
              {formatTemplate(t('requestRoutedToCount'), {
                count: request.patient_request_recipients?.length || 0
              })}
            </p>
            {summary.accepted === 0 && summary.rejected === 0 ? (
              <p>
                {t('requestNoResponses')}
              </p>
            ) : (
              <p>
                {`${t('requestResponsesLabel')} ${summary.accepted} ${t('requestResponsesAccepted')}, ${summary.rejected} ${t('requestResponsesRejected')}, ${summary.pending} ${t('requestResponsesPending')}`}
              </p>
            )}
            {lastResponse && (
              <p>
                {t('requestLastResponse')}{' '}
                {lastResponse.pharmacies?.name || t('pharmacy')} - {getRequestStatusConfig(lastResponse.status === 'rejected' ? 'declined' : lastResponse.status).label}
              </p>
            )}
            {!isHistory && request.selected_pharmacy_id && selectedRecipient && (
              <div className="mt-2">
                <p className="text-xs font-medium text-pharma-charcoal">
                  {language === 'el' ? 'Επιλεγμένο φαρμακείο' : 'Selected pharmacy'}
                </p>
                <p className="text-sm text-pharma-slate-grey flex items-center gap-2 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-pharma-teal" />
                  {selectedRecipient.pharmacies?.name || t('pharmacy')}
                </p>
              </div>
            )}
            {canChoosePharmacy && acceptedRecipients.length > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs font-medium text-pharma-charcoal">
                  {language === 'el' ? 'Φαρμακεία που αποδέχτηκαν' : 'Pharmacies that accepted'}
                </p>
                <div className="space-y-2">
                  {acceptedRecipients.map((recipient) => {
                    const pharmacyName = recipient.pharmacies?.name || t('pharmacy');
                    const actionId = `${request.id}:${recipient.pharmacy_id}`;
                    return (
                      <div
                        key={actionId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pharma-grey-pale/60 bg-white px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-sm text-pharma-dark-slate">
                          <MapPin className="w-3.5 h-3.5 text-pharma-teal" />
                          <span className="truncate">{pharmacyName}</span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => choosePharmacyForRequest(request.id, recipient.pharmacy_id)}
                          disabled={choosingPharmacyId === actionId}
                        >
                          {choosingPharmacyId === actionId
                            ? t('loading')
                            : (language === 'el' ? 'Επιλογή φαρμακείου' : 'Choose this pharmacy')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {canCancel && (
            <div className="space-y-2">
              {request.status === 'accepted' && (
                <p className={`text-xs ${remainingAcceptedCancels === 0 ? 'text-pharma-coral' : 'text-pharma-slate-grey'}`}>
                  {remainingAcceptedCancels === 0
                    ? language === 'el'
                      ? 'Όριο ακυρώσεων για αποδεκτά αιτήματα: 3/μήνα (έχεις 0 διαθέσιμες).'
                      : 'Cancel limit for accepted requests: 3/month (0 remaining).'
                    : language === 'el'
                      ? `Απομένουν ${remainingAcceptedCancels} ακυρώσεις αυτόν τον μήνα για αποδεκτά αιτήματα.`
                      : `${remainingAcceptedCancels} cancellations remaining this month for accepted requests.`}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => cancelPatientRequest(request.id, request)}
                disabled={cancelingId === request.id || (request.status === 'accepted' && remainingAcceptedCancels === 0)}
                data-testid={`cancel-request-${request.id}`}
              >
                {cancelingId === request.id
                  ? t('requestCancelling')
                  : t('requestCancel')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const activeContent = activeRequests.length === 0 ? (
    <EmptyState
      icon={ClipboardList}
      title={t('myRequestsEmpty')}
      description={t('myRequestsEmptyDesc')}
    />
  ) : (
    <div className="space-y-3">
      {activeRequests.map((request) => renderRequestCard(request, false))}
    </div>
  );

  const historyContent = (
    <Suspense fallback={<SkeletonList count={2} CardComponent={SkeletonCard} />}>
      <HistoryTab
        requests={visibleHistoryRequests}
        historyRequestsCount={historyRequests.length}
        historyVisibleCount={historyVisibleCount}
        setHistoryVisibleCount={setHistoryVisibleCount}
        renderRequestCard={renderRequestCard}
      />
    </Suspense>
  );

  return (
    <section className="page-enter" id="my-requests-section">
      <div className="flex items-center justify-between gap-2 mb-4">
        <ClipboardList className="w-5 h-5 text-pharma-teal" />
        <h2 className="font-heading text-lg font-semibold text-pharma-dark-slate">
          {t('myRequestsTitle')}
        </h2>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            requestsTab === 'active'
              ? 'bg-pharma-teal text-white'
              : 'bg-white text-pharma-slate-grey border border-pharma-grey-pale'
          }`}
          onClick={() => setRequestsTab('active')}
          data-testid="tab-active"
        >
          {language === 'el' ? 'Ενεργά' : 'Active'}
        </button>
        <button
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            requestsTab === 'history'
              ? 'bg-pharma-teal text-white'
              : 'bg-white text-pharma-slate-grey border border-pharma-grey-pale'
          }`}
          onClick={() => setRequestsTab('history')}
          data-testid="tab-history"
        >
          {language === 'el' ? 'Ιστορικό' : 'History'}
        </button>
      </div>

      {requestsLoading ? (
        <SkeletonList count={2} CardComponent={SkeletonCard} />
      ) : requestsTab === 'history' ? (
        historyContent
      ) : (
        activeContent
      )}
    </section>
  );
};

export default PatientRequestsListLazy;
