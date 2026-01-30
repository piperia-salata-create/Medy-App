import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { EmptyState } from '../../components/ui/empty-states';
import { ArrowLeft, Inbox, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_KEYS = {
  pending: 'pending',
  accepted: 'accepted',
  rejected: 'rejected',
  cancelled: 'cancelled',
  expired: 'expired'
};

const TXT = {
  el: { cancelled: 'Ακυρώθηκε', rejected: 'Απορρίφθηκε', expired: 'Έληξε', completed: 'Ολοκληρώθηκε', created: 'Δημιουργήθηκε', cancelledAt: 'Ακυρώθηκε', expires: 'Λήγει', expiredAt: 'Έληξε' },
  en: { cancelled: 'Cancelled', rejected: 'Rejected', expired: 'Expired', completed: 'Completed', created: 'Created', cancelledAt: 'Cancelled', expires: 'Expires', expiredAt: 'Expired' }
};

export default function PharmacistPatientRequestsPage() {
  const { user, profile, isPharmacist } = useAuth();
  const { language } = useLanguage();

  const t = useCallback((key) => (TXT[language] || TXT.en)[key], [language]);
  const navigate = useNavigate();

  const [pharmacy, setPharmacy] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [respondingId, setRespondingId] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (profile && !isPharmacist()) {
      navigate('/patient');
    }
  }, [profile, isPharmacist, navigate]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchPharmacy = useCallback(async () => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setPharmacy(data || null);
      return data || null;
    } catch (error) {
      console.error('Error fetching pharmacy:', error);
      setPharmacy(null);
      return null;
    }
  }, [user]);

  const fetchRequests = useCallback(async (pharmacyData) => {
    if (!pharmacyData) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('patient_request_recipients')
        .select(`
          id,
          status,
          pharmacy_id,
          responded_at,
          request_id,
          updated_at,
          request:patient_requests!patient_request_recipients_request_id_fkey (
            id,
            medicine_query,
            dosage,
            form,
            urgency,
            status,
            expires_at,
            created_at
          )
        `)
        .eq('pharmacy_id', pharmacyData.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (data && data.length > 0) {
        const sample = data[0];
        const requestId = sample?.request_id;
        const requestIsNull = sample?.request == null;
        console.log('[PharmacistPatientRequests] sample request_id', requestId, 'request is null', requestIsNull);
        if (requestIsNull && requestId) {
          const { data: requestData, error: requestError } = await supabase
            .from('patient_requests')
            .select('id, medicine_query, dosage, form, urgency')
            .eq('id', requestId)
            .maybeSingle();
          console.log('[PharmacistPatientRequests] direct request lookup', {
            requestId,
            requestData,
            requestError
          });
        }
      }
      if (process.env.NODE_ENV === 'development' && data && data.length > 0) {
        const sample = data[0];
        console.log('[PharmacistPatientRequests] sample keys', Object.keys(sample));
        console.log('[PharmacistPatientRequests] join field shape', {
          hasRequest: Object.prototype.hasOwnProperty.call(sample || {}, 'request'),
          type: typeof sample?.request,
          isArray: Array.isArray(sample?.request)
        });
        console.log('[PharmacistPatientRequests] sample row', sample);
      }
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching patient requests:', error);
      toast.error(language === 'el'
        ? '\u03a3\u03c6\u03ac\u03bb\u03bc\u03b1 \u03c6\u03cc\u03c1\u03c4\u03c9\u03c3\u03b7\u03c2 \u03b1\u03b9\u03c4\u03b7\u03bc\u03ac\u03c4\u03c9\u03bd.'
        : 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, [language, t]);

  useEffect(() => {
    const load = async () => {
      const pharmacyData = await fetchPharmacy();
      await fetchRequests(pharmacyData);
    };
    if (user) {
      load();
    }
  }, [user, fetchPharmacy, fetchRequests]);

  useEffect(() => {
    if (!pharmacy?.id) return;
    const channel = supabase
      .channel(`patient_request_recipients:${pharmacy.id}:manage`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patient_request_recipients', filter: `pharmacy_id=eq.${pharmacy.id}` },
        () => fetchRequests(pharmacy)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pharmacy, fetchRequests]);

  const getStatusInfo = useCallback((recipient) => {
    const request = recipient?.request || {};
    const recipientStatus = recipient?.status || STATUS_KEYS.pending;
    const requestStatus = request?.status;
    const expiresAt = request?.expires_at ? new Date(request?.expires_at).getTime() : null;
    const isExpired = expiresAt ? expiresAt < Date.now() : false;

    if (requestStatus === 'cancelled' || recipientStatus === 'cancelled') {
      return {
        key: STATUS_KEYS.cancelled,
        label: language === 'el' ? '\u0391\u03ba\u03c5\u03c1\u03ce\u03b8\u03b7\u03ba\u03b5' : 'Cancelled',
        className: 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20'
      };
    }
    if (requestStatus === 'expired' || isExpired) {
      return {
        key: STATUS_KEYS.expired,
        label: language === 'el' ? '\u0388\u03bb\u03b7\u03be\u03b5' : 'Expired',
        className: 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20'
      };
    }
    if (recipientStatus === STATUS_KEYS.accepted) {
      return {
        key: STATUS_KEYS.accepted,
        label: language === 'el' ? '\u0391\u03c0\u03bf\u03b4\u03b5\u03ba\u03c4\u03cc' : 'Accepted',
        className: 'bg-pharma-sea-green/10 text-pharma-sea-green border border-pharma-sea-green/20'
      };
    }
    if (recipientStatus === STATUS_KEYS.rejected || recipientStatus === 'declined') {
      return {
        key: STATUS_KEYS.rejected,
        label: language === 'el' ? '\u0391\u03c0\u03bf\u03c1\u03c1\u03af\u03c6\u03b8\u03b7\u03ba\u03b5' : 'Rejected',
        className: 'bg-pharma-coral/10 text-pharma-coral border border-pharma-coral/20'
      };
    }
    return {
      key: STATUS_KEYS.pending,
      label: language === 'el' ? '\u03a3\u03b5 \u03b1\u03bd\u03b1\u03bc\u03bf\u03bd\u03ae' : 'Pending',
      className: 'bg-pharma-steel-blue/10 text-pharma-steel-blue border border-pharma-steel-blue/20'
    };
  }, [language]);

  // Helper for Cancelled/Expired tab badge
  const getHistoryStatusInfo = useCallback((item) => {
    const request = item?.request ?? item?.patient_requests ?? item?.patient_request ?? null;
    const requestStatus = request?.status;
    const recipientStatus = item?.status;
    const now = Date.now();

    // Priority: cancelled > rejected > expired
    if (requestStatus === 'cancelled' || recipientStatus === 'cancelled') {
      return {
        label: t('cancelled'),
        className: 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20'
      };
    }
    if (requestStatus === 'rejected' || recipientStatus === 'rejected' || recipientStatus === 'declined') {
      return {
        label: t('rejected'),
        className: 'bg-pharma-coral/10 text-pharma-coral border border-pharma-coral/20'
      };
    }
    if (request?.expires_at && new Date(request.expires_at).getTime() <= now) {
      return {
        label: t('expired'),
        className: 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20'
      };
    }
    // Fallback
    return {
      label: t('completed'),
      className: 'bg-pharma-slate-grey/10 text-pharma-slate-grey border border-pharma-slate-grey/20'
    };
  }, [language, t]);

  // Date formatter for history timestamps
  const formatDate = useCallback((value) => {
    if (!value) return '';
    return new Date(value).toLocaleString(language === 'el' ? 'el-GR' : 'en-US');
  }, [language]);

  const filteredRequests = useMemo(() => {
    const normalized = (requests || []).map((item) => ({
      ...item,
      statusInfo: getStatusInfo(item)
    }));

    if (activeTab === 'all') return normalized;
    if (activeTab === 'cancelled-expired') {
      return normalized.filter((item) =>
        item.statusInfo.key === STATUS_KEYS.cancelled || item.statusInfo.key === STATUS_KEYS.expired
      );
    }
    return normalized.filter((item) => item.statusInfo.key === activeTab);
  }, [requests, activeTab, getStatusInfo]);

  const counts = useMemo(() => {
    const base = {
      pending: 0,
      accepted: 0,
      rejected: 0,
      cancelledExpired: 0,
      all: requests?.length || 0
    };
    (requests || []).forEach((item) => {
      const info = getStatusInfo(item);
      if (info.key === STATUS_KEYS.pending) base.pending += 1;
      if (info.key === STATUS_KEYS.accepted) base.accepted += 1;
      if (info.key === STATUS_KEYS.rejected) base.rejected += 1;
      if (info.key === STATUS_KEYS.cancelled || info.key === STATUS_KEYS.expired) base.cancelledExpired += 1;
    });
    return base;
  }, [requests, getStatusInfo]);

  const getRemainingLabel = (expiresAt) => {
    if (!expiresAt) return '-';
    const diffMs = new Date(expiresAt).getTime() - nowTick;
    if (diffMs <= 0) return language === 'el' ? '\u0388\u03bb\u03b7\u03be\u03b5' : 'Expired';
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return language === 'el'
        ? `\u039b\u03ae\u03b3\u03b5\u03b9 \u03c3\u03b5 ${hours}\u03c9 ${minutes}\u03bb`
        : `Expires in ${hours}h ${minutes}m`;
    }
    return language === 'el'
      ? `\u039b\u03ae\u03b3\u03b5\u03b9 \u03c3\u03b5 ${minutes}\u03bb`
      : `Expires in ${minutes}m`;
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString(language === 'el' ? 'el-GR' : 'en-US');
  };

  const respondToRequest = async (recipientId, status) => {
    if (!pharmacy?.id) return;
    setRespondingId(recipientId);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('patient_request_recipients')
        .update({
          status,
          responded_at: nowIso,
          updated_at: nowIso
        })
        .eq('id', recipientId)
        .eq('pharmacy_id', pharmacy.id);

      if (error) throw error;

      toast.success(
        status === 'accepted'
          ? (language === 'el' ? '\u0391\u03af\u03c4\u03b7\u03bc\u03b1 \u03b1\u03c0\u03bf\u03b4\u03b5\u03ba\u03c4\u03cc' : 'Request accepted')
          : (language === 'el' ? '\u0391\u03af\u03c4\u03b7\u03bc\u03b1 \u03b1\u03c0\u03bf\u03c1\u03c1\u03af\u03c6\u03b8\u03b7\u03ba\u03b5' : 'Request rejected')
      );
      fetchRequests(pharmacy);
    } catch (error) {
      console.error('Error responding to request:', error);
      toast.error(language === 'el' ? '\u03a3\u03c6\u03ac\u03bb\u03bc\u03b1 \u03b5\u03bd\u03b7\u03bc\u03ad\u03c1\u03c9\u03c3\u03b7\u03c2' : 'Update failed');
    } finally {
      setRespondingId(null);
    }
  };

  if (!isPharmacist()) {
    return null;
  }

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="pharmacist-patient-requests-page">
      <header className="sticky top-0 z-50 glass border-b border-pharma-grey-pale/50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/pharmacist">
            <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-heading font-semibold text-pharma-dark-slate">
            {language === 'el'
              ? '\u0391\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03b1 \u0391\u03c3\u03b8\u03b5\u03bd\u03ce\u03bd'
              : 'Patient Requests'}
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
              <Inbox className="w-5 h-5 text-pharma-teal" />
              {language === 'el'
                ? '\u0394\u03b9\u03b1\u03c7\u03b5\u03af\u03c1\u03b9\u03c3\u03b7 \u0391\u03b9\u03c4\u03b7\u03bc\u03ac\u03c4\u03c9\u03bd'
                : 'Manage Requests'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex flex-wrap gap-2 h-auto bg-transparent">
                <TabsTrigger value="pending" className="rounded-full">
                  {language === 'el' ? '\u03a3\u03b5 \u03b1\u03bd\u03b1\u03bc\u03bf\u03bd\u03ae' : 'Pending'} ({counts.pending})
                </TabsTrigger>
                <TabsTrigger value="accepted" className="rounded-full">
                  {language === 'el' ? '\u0391\u03c0\u03bf\u03b4\u03b5\u03ba\u03c4\u03ac' : 'Accepted'} ({counts.accepted})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="rounded-full">
                  {language === 'el' ? '\u0391\u03c0\u03bf\u03c1\u03c1\u03b9\u03c6\u03b8\u03ad\u03bd\u03c4\u03b1' : 'Rejected'} ({counts.rejected})
                </TabsTrigger>
                <TabsTrigger value="cancelled-expired" className="rounded-full">
                  {language === 'el'
                    ? '\u0391\u03ba\u03c5\u03c1\u03c9\u03bc\u03ad\u03bd\u03b1/\u039b\u03b7\u03b3\u03bc\u03ad\u03bd\u03b1'
                    : 'Cancelled/Expired'} ({counts.cancelledExpired})
                </TabsTrigger>
                <TabsTrigger value="all" className="rounded-full">
                  {language === 'el' ? '\u038c\u03bb\u03b1' : 'All'} ({counts.all})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {!pharmacy ? (
              <EmptyState
                icon={Inbox}
                title={language === 'el' ? '\u0394\u03b5\u03bd \u03c5\u03c0\u03ac\u03c1\u03c7\u03b5\u03b9 \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03bf' : 'No pharmacy found'}
                description={language === 'el'
                  ? '\u03a0\u03c1\u03bf\u03c3\u03b8\u03ad\u03c3\u03c4\u03b5 \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03bf \u03b3\u03b9\u03b1 \u03bd\u03b1 \u03bb\u03b1\u03bc\u03b2\u03ac\u03bd\u03b5\u03c4\u03b5 \u03b1\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03b1.'
                  : 'Add a pharmacy to receive requests.'}
              />
            ) : loading ? (
              <div className="text-sm text-pharma-slate-grey">
                {language === 'el' ? '\u03a6\u03cc\u03c1\u03c4\u03c9\u03c3\u03b7...' : 'Loading...'}
              </div>
            ) : filteredRequests.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={language === 'el' ? '\u0394\u03b5\u03bd \u03c5\u03c0\u03ac\u03c1\u03c7\u03bf\u03c5\u03bd \u03b1\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03b1' : 'No requests'}
                description={language === 'el'
                  ? '\u0394\u03bf\u03ba\u03b9\u03bc\u03ac\u03c3\u03c4\u03b5 \u03ac\u03bb\u03bb\u03bf \u03c6\u03af\u03bb\u03c4\u03c1\u03bf.'
                  : 'Try another filter.'}
              />
            ) : (
              <div className="space-y-3">
                {filteredRequests.map((item) => {
                  const request = item?.request || {};
                  const statusInfo = item.statusInfo || getStatusInfo(item);
                  const historyStatusInfo = getHistoryStatusInfo(item);
                  const canRespond = statusInfo.key === STATUS_KEYS.pending;
                  const isCancelledExpired = activeTab === 'cancelled-expired';
                  return (
                    <Card key={item.id} className="bg-white rounded-2xl border border-pharma-grey-pale">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-pharma-dark-slate truncate">
                              {request?.medicine_query || (language === 'el' ? '\u0391\u03af\u03c4\u03b7\u03bc\u03b1' : 'Request')}
                            </p>
                            <div className="text-xs text-pharma-slate-grey mt-1 space-y-1">
                              {isCancelledExpired ? (
                                // Cancelled/Expired tab timestamps
                                <>
                                  <p>{t('created')}: {formatDate(request?.created_at)}</p>
                                  {request?.cancelled_at && (
                                    <p>{t('cancelledAt')}: {formatDate(request?.cancelled_at)}</p>
                                  )}
                                  {request?.expires_at && (
                                    <p>
                                      {new Date(request.expires_at) <= Date.now()
                                        ? `${t('expiredAt')}: ${formatDate(request.expires_at)}`
                                        : `${t('expires')}: ${formatDate(request.expires_at)}`}
                                    </p>
                                  )}
                                </>
                              ) : (
                                // Active tabs timestamps
                                <>
                                  <p>
                                    {language === 'el' ? '\u0394\u03b7\u03bc\u03b9\u03bf\u03c5\u03c1\u03b3\u03ae\u03b8\u03b7\u03ba\u03b5' : 'Created'}: {formatDateTime(request?.created_at)}
                                  </p>
                                  <p className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" />
                                    {language === 'el' ? '\u039b\u03ae\u03b3\u03b5\u03b9' : 'Expires'}: {formatDateTime(request?.expires_at)} · {getRemainingLabel(request?.expires_at)}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${isCancelledExpired ? historyStatusInfo.className : statusInfo.className}`}>
                            {isCancelledExpired ? historyStatusInfo.label : statusInfo.label}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div className="rounded-xl border border-pharma-grey-pale/60 bg-pharma-ice-blue/50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-pharma-slate-grey">
                              {language === 'el' ? '\u0394\u03bf\u03c3\u03bf\u03bb\u03bf\u03b3\u03af\u03b1' : 'Dosage'}
                            </p>
                            <p className="text-pharma-charcoal">
                              {request?.dosage || (language === 'el' ? '\u0394\u03b5\u03bd \u03bf\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b5' : 'Not set')}
                            </p>
                          </div>
                          <div className="rounded-xl border border-pharma-grey-pale/60 bg-pharma-ice-blue/50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-pharma-slate-grey">
                              {language === 'el' ? '\u039c\u03bf\u03c1\u03c6\u03ae' : 'Form'}
                            </p>
                            <p className="text-pharma-charcoal">
                              {request?.form || (language === 'el' ? '\u0394\u03b5\u03bd \u03bf\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b5' : 'Not set')}
                            </p>
                          </div>
                          <div className="rounded-xl border border-pharma-grey-pale/60 bg-pharma-ice-blue/50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-pharma-slate-grey">
                              {language === 'el' ? '\u0395\u03c0\u03b5\u03af\u03b3\u03bf\u03bd' : 'Urgency'}
                            </p>
                            <p className="text-pharma-charcoal">
                              {request?.urgency || (language === 'el' ? '\u0394\u03b5\u03bd \u03bf\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b5' : 'Not set')}
                            </p>
                          </div>
                        </div>

                        {canRespond && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="rounded-full bg-pharma-sea-green hover:bg-pharma-sea-green/90 gap-1"
                              onClick={() => respondToRequest(item.id, 'accepted')}
                              disabled={respondingId === item.id}
                              data-testid={`accept-request-${item.id}`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              {language === 'el' ? '\u0391\u03c0\u03bf\u03b4\u03bf\u03c7\u03ae' : 'Accept'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full gap-1"
                              onClick={() => respondToRequest(item.id, 'rejected')}
                              disabled={respondingId === item.id}
                              data-testid={`reject-request-${item.id}`}
                            >
                              <XCircle className="w-4 h-4" />
                              {language === 'el' ? '\u0391\u03c0\u03cc\u03c1\u03c1\u03b9\u03c8\u03b7' : 'Reject'}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
