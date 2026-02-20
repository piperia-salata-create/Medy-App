import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { EmptyState } from '../../components/ui/empty-states';
import { ArrowLeft, Inbox, CheckCircle2, XCircle, Clock, Search, Info } from 'lucide-react';
import { toast } from 'sonner';

const isDev = process.env.NODE_ENV !== 'production';

const STATUS_KEYS = {
  pending: 'pending',
  accepted: 'accepted',
  rejected: 'rejected',
  executed: 'executed',
  cancelled: 'cancelled',
  expired: 'expired'
};

const TXT = {
  el: {
    cancelled: 'Ακυρώθηκε',
    rejected: 'Απορρίφθηκε',
    expired: 'Έληξε',
    executed: 'Εκτελέστηκε',
    completed: 'Ολοκληρώθηκε',
    created: 'Δημιουργήθηκε',
    cancelledAt: 'Ακυρώθηκε',
    expires: 'Λήγει',
    expiredAt: 'Έληξε',
    executedTab: 'Εκτελεσμένα',
    markExecuted: 'Εκτελέστηκε',
    markExecutedDisclaimer: 'Πατήστε «Εκτελέστηκε» όταν ολοκληρώσετε τη συναλλαγή σας με τον ασθενή.',
    executedToast: 'Το αίτημα εκτελέστηκε.'
  },
  en: {
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    expired: 'Expired',
    executed: 'Executed',
    completed: 'Completed',
    created: 'Created',
    cancelledAt: 'Cancelled',
    expires: 'Expires',
    expiredAt: 'Expired',
    executedTab: 'Executed',
    markExecuted: 'Executed',
    markExecutedDisclaimer: 'Tap "Executed" when you\'ve finished the transaction with the patient.',
    executedToast: 'Request marked as executed.'
  }
};

const areRequestsEqual = (prevList = [], nextList = []) => {
  if (prevList === nextList) return true;
  if (prevList.length !== nextList.length) return false;
  for (let i = 0; i < prevList.length; i += 1) {
    const prev = prevList[i];
    const next = nextList[i];
    const prevReq = prev?.request || {};
    const nextReq = next?.request || {};
    if ((prev?.id || '') !== (next?.id || '')) return false;
    if ((prev?.status || '') !== (next?.status || '')) return false;
    if ((prev?.updated_at || '') !== (next?.updated_at || '')) return false;
    if ((prev?.responded_at || '') !== (next?.responded_at || '')) return false;
    if ((prevReq?.id || '') !== (nextReq?.id || '')) return false;
    if ((prevReq?.status || '') !== (nextReq?.status || '')) return false;
    if ((prevReq?.expires_at || '') !== (nextReq?.expires_at || '')) return false;
    if ((prevReq?.selected_pharmacy_id || '') !== (nextReq?.selected_pharmacy_id || '')) return false;
  }
  return true;
};

export default function PharmacistPatientRequestsPage() {
  const { user, profile, isPharmacist } = useAuth();
  const userId = user?.id || null;
  const profileId = profile?.id || null;
  const { language } = useLanguage();

  const t = useCallback((key) => (TXT[language] || TXT.en)[key], [language]);
  const navigate = useNavigate();

  const [pharmacy, setPharmacy] = useState(null);
  const pharmacyId = pharmacy?.id || null;
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [respondingId, setRespondingId] = useState(null);
  const [executingId, setExecutingId] = useState(null);
  const [patientDetailsByRequest, setPatientDetailsByRequest] = useState({});
  const hasLoadedRequestsRef = useRef(false);
  const requestsRef = useRef([]);

  useEffect(() => {
    if (profileId && !isPharmacist()) {
      navigate('/patient');
    }
  }, [profileId, isPharmacist, navigate]);

  useEffect(() => {
    hasLoadedRequestsRef.current = false;
    setLoading(true);
    setRefreshing(false);
  }, [pharmacyId, userId]);

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  const fetchPharmacy = useCallback(async () => {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .eq('owner_id', userId)
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
  }, [userId]);

  const fetchRequests = useCallback(async (pharmacyData) => {
    if (!pharmacyData) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const isInitialLoad = !hasLoadedRequestsRef.current;
    let didChange = false;
    if (isInitialLoad) {
      setLoading(true);
    }
    try {
      const retentionFloorIso = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
      const { data, error } = await supabase
        .from('patient_request_recipients')
        .select(`
          id,
          status,
          pharmacy_id,
          responded_at,
          request_id,
          updated_at,
          request:patient_requests!patient_request_recipients_request_id_fkey!inner (
            id,
            medicine_query,
            dosage,
            form,
            urgency,
            status,
            expires_at,
            deleted_at,
            created_at,
            accepted_at,
            selected_pharmacy_id
          )
        `)
        .eq('pharmacy_id', pharmacyData.id)
        .is('patient_requests.deleted_at', null)
        .gte('patient_requests.expires_at', retentionFloorIso)
        .or('status.neq.cancelled,accepted_at.not.is.null', { foreignTable: 'patient_requests' })
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (isDev && data && data.length > 0) {
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
      if (isDev && data && data.length > 0) {
        const sample = data[0];
        console.log('[PharmacistPatientRequests] sample keys', Object.keys(sample));
        console.log('[PharmacistPatientRequests] join field shape', {
          hasRequest: Object.prototype.hasOwnProperty.call(sample || {}, 'request'),
          type: typeof sample?.request,
          isArray: Array.isArray(sample?.request)
        });
        console.log('[PharmacistPatientRequests] sample row', sample);
      }
      const filtered = (data || []).filter((item) => {
        if (!item?.request) return false;
        const requestStatus = item?.request?.status ?? null;
        const acceptedAt = item?.request?.accepted_at ?? null;
        if (requestStatus === STATUS_KEYS.cancelled && !acceptedAt) {
          return false;
        }
        const selectedId = item?.request?.selected_pharmacy_id ?? null;
        return !selectedId || selectedId === pharmacyData.id;
      });
      const prevList = requestsRef.current || [];
      const nextList = areRequestsEqual(prevList, filtered) ? prevList : filtered;
      didChange = nextList !== prevList;

      if (!isInitialLoad && didChange) {
        setRefreshing(true);
      }

      setRequests(nextList);
      requestsRef.current = nextList;
      hasLoadedRequestsRef.current = true;
    } catch (error) {
      console.error('Error fetching patient requests:', error);
      toast.error(language === 'el'
        ? '\u03a3\u03c6\u03ac\u03bb\u03bc\u03b1 \u03c6\u03cc\u03c1\u03c4\u03c9\u03c3\u03b7\u03c2 \u03b1\u03b9\u03c4\u03b7\u03bc\u03ac\u03c4\u03c9\u03bd.'
        : 'Failed to load requests.');
    } finally {
      setLoading(false);
      if (!isInitialLoad && didChange) {
        setRefreshing(false);
      }
    }
  }, [language]);

  const fetchPatientDetails = useCallback(async (requestId, pharmacyId) => {
    if (!requestId || !pharmacyId) return;
    try {
      const { data, error } = await supabase.rpc('get_patient_details_for_request', {
        p_request_id: requestId,
        p_pharmacy_id: pharmacyId
      });

      if (error) {
        console.error('Error loading patient details:', error);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;

      setPatientDetailsByRequest((prev) => ({
        ...prev,
        [requestId]: row
      }));
    } catch (err) {
      console.error('Error loading patient details:', err);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const pharmacyData = await fetchPharmacy();
      await fetchRequests(pharmacyData);
    };
    if (userId) {
      load();
    }
  }, [userId, fetchPharmacy, fetchRequests]);

  useEffect(() => {
    if (!pharmacyId) return;
    const eligible = (requests || []).filter((item) => {
      const request = item?.request || {};
      return item?.status === 'accepted' && request?.selected_pharmacy_id === pharmacyId;
    });

    eligible.forEach((item) => {
      const requestId = item?.request?.id;
      if (!requestId) return;
      if (patientDetailsByRequest[requestId]) return;
      fetchPatientDetails(requestId, pharmacyId);
    });
  }, [requests, pharmacyId, fetchPatientDetails, patientDetailsByRequest]);

  useEffect(() => {
    if (!pharmacyId) return;
    const channel = supabase
      .channel(`patient_request_recipients:${pharmacyId}:manage`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patient_request_recipients', filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchRequests({ id: pharmacyId })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pharmacyId, fetchRequests]);

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
    if (requestStatus === STATUS_KEYS.executed) {
      return {
        key: STATUS_KEYS.executed,
        label: language === 'el' ? '\u0395\u03ba\u03c4\u03b5\u03bb\u03ad\u03c3\u03c4\u03b7\u03ba\u03b5' : 'Executed',
        className: 'bg-pharma-teal/10 text-pharma-teal border border-pharma-teal/20'
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
    if (requestStatus === STATUS_KEYS.executed) {
      return {
        label: t('executed'),
        className: 'bg-pharma-teal/10 text-pharma-teal border border-pharma-teal/20'
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
  }, [t]);

  // Date formatter for history timestamps
  const formatDate = useCallback((value) => {
    if (!value) return '';
    return new Date(value).toLocaleString(language === 'el' ? 'el-GR' : 'en-US');
  }, [language]);

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const normalized = (requests || []).map((item) => ({
      ...item,
      statusInfo: getStatusInfo(item)
    }));

    let byTab = normalized;
    if (activeTab === 'all') {
      byTab = normalized;
    } else if (activeTab === 'cancelled-expired') {
      byTab = normalized.filter((item) =>
        item.statusInfo.key === STATUS_KEYS.cancelled || item.statusInfo.key === STATUS_KEYS.expired
      );
    } else if (activeTab === STATUS_KEYS.executed) {
      byTab = normalized.filter((item) => item.statusInfo.key === STATUS_KEYS.executed);
    } else {
      byTab = normalized.filter((item) => item.statusInfo.key === activeTab);
    }

    if (!query) return byTab;

    return byTab.filter((item) => {
      const request = item?.request || {};
      const patientDetails = patientDetailsByRequest[request?.id] || {};
      const searchBlob = [
        request?.medicine_query,
        request?.dosage,
        request?.form,
        request?.urgency,
        request?.status,
        item?.status,
        patientDetails?.patient_full_name,
        patientDetails?.full_name,
        patientDetails?.patient_phone,
        patientDetails?.phone,
        patientDetails?.patient_address_text,
        patientDetails?.patient_address,
        patientDetails?.address_text,
        patientDetails?.address,
        patientDetails?.request_notes
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .join(' ');

      return searchBlob.includes(query);
    });
  }, [requests, activeTab, getStatusInfo, searchQuery, patientDetailsByRequest]);

  const counts = useMemo(() => {
    const base = {
      pending: 0,
      accepted: 0,
      rejected: 0,
      executed: 0,
      cancelledExpired: 0,
      all: requests?.length || 0
    };
    (requests || []).forEach((item) => {
      const info = getStatusInfo(item);
      if (info.key === STATUS_KEYS.pending) base.pending += 1;
      if (info.key === STATUS_KEYS.accepted) base.accepted += 1;
      if (info.key === STATUS_KEYS.rejected) base.rejected += 1;
      if (info.key === STATUS_KEYS.executed) base.executed += 1;
      if (info.key === STATUS_KEYS.cancelled || info.key === STATUS_KEYS.expired) base.cancelledExpired += 1;
    });
    return base;
  }, [requests, getStatusInfo]);

  const getRemainingLabel = (expiresAt) => {
    if (!expiresAt) return '-';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
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

  const markRequestExecuted = async (requestId) => {
    if (!pharmacy?.id || !requestId) return;
    setExecutingId(requestId);
    try {
      const { error } = await supabase.rpc('mark_request_executed', { p_request_id: requestId });
      if (error) throw error;
      toast.success(t('executedToast'));
      fetchRequests(pharmacy);
    } catch (error) {
      console.error('Error marking request executed:', error);
      toast.error(language === 'el'
        ? '\u03a3\u03c6\u03ac\u03bb\u03bc\u03b1 \u03b5\u03ba\u03c4\u03ad\u03bb\u03b5\u03c3\u03b7\u03c2 \u03b1\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03bf\u03c2.'
        : 'Failed to mark request executed.');
    } finally {
      setExecutingId(null);
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
                <TabsTrigger value={STATUS_KEYS.executed} className="rounded-full">
                  {t('executedTab')} ({counts.executed})
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
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pharma-slate-grey" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={
                  language === 'el'
                    ? 'Αναζήτηση με φάρμακο, δοσολογία ή λέξη-κλειδί...'
                    : 'Search by medicine, dosage, or keyword...'
                }
                className="pl-9 rounded-xl"
                data-testid="requests-search-input"
              />
            </div>
            <div className="min-h-[18px] text-xs text-pharma-slate-grey">
              {refreshing ? (
                language === 'el' ? 'Γίνεται ενημέρωση...' : 'Updating...'
              ) : (
                <span className="invisible">
                  {language === 'el' ? 'Γίνεται ενημέρωση...' : 'Updating...'}
                </span>
              )}
            </div>

            {!pharmacy ? (
              <EmptyState
                icon={Inbox}
                title={language === 'el' ? '\u0394\u03b5\u03bd \u03c5\u03c0\u03ac\u03c1\u03c7\u03b5\u03b9 \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03bf' : 'No pharmacy found'}
                description={language === 'el'
                  ? '\u03a0\u03c1\u03bf\u03c3\u03b8\u03ad\u03c3\u03c4\u03b5 \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03bf \u03b3\u03b9\u03b1 \u03bd\u03b1 \u03bb\u03b1\u03bc\u03b2\u03ac\u03bd\u03b5\u03c4\u03b5 \u03b1\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03b1.'
                  : 'Add a pharmacy to receive requests.'}
              />
            ) : (loading && requests.length === 0) ? (
              <div className="text-sm text-pharma-slate-grey">
                {language === 'el' ? '\u03a6\u03cc\u03c1\u03c4\u03c9\u03c3\u03b7...' : 'Loading...'}
              </div>
            ) : filteredRequests.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={
                  searchQuery.trim()
                    ? (language === 'el' ? 'Δεν βρέθηκαν αποτελέσματα' : 'No matching requests')
                    : (language === 'el' ? '\u0394\u03b5\u03bd \u03c5\u03c0\u03ac\u03c1\u03c7\u03bf\u03c5\u03bd \u03b1\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03b1' : 'No requests')
                }
                description={language === 'el'
                  ? (searchQuery.trim() ? 'Δοκιμάστε άλλη λέξη-κλειδί.' : '\u0394\u03bf\u03ba\u03b9\u03bc\u03ac\u03c3\u03c4\u03b5 \u03ac\u03bb\u03bb\u03bf \u03c6\u03af\u03bb\u03c4\u03c1\u03bf.')
                  : (searchQuery.trim() ? 'Try another keyword.' : 'Try another filter.')}
              />
            ) : (
              <div className="paint-stable">
                <div className="incoming-scroll max-h-[66vh] overflow-y-auto pr-1">
                  <div className="space-y-3">
                {filteredRequests.map((item) => {
                  const request = item?.request || {};
                  const statusInfo = item.statusInfo || getStatusInfo(item);
                  const historyStatusInfo = getHistoryStatusInfo(item);
                  const canRespond = statusInfo.key === STATUS_KEYS.pending;
                  const isCancelledExpired = activeTab === 'cancelled-expired';
                  const selectedByPatient = request?.selected_pharmacy_id
                    && request.selected_pharmacy_id === pharmacy?.id;
                  const canExecute = statusInfo.key === STATUS_KEYS.accepted
                    && selectedByPatient
                    && request?.status === STATUS_KEYS.accepted;
                  const showExecuteDisclaimer = canExecute && executingId !== request?.id;
                  const canViewPatientDetails = item?.status === 'accepted'
                    && request?.selected_pharmacy_id === pharmacy?.id;
                  const patientDetails = canViewPatientDetails
                    ? patientDetailsByRequest[request?.id]
                    : null;
                  const patientName = patientDetails?.patient_full_name
                    || patientDetails?.full_name
                    || '-';
                  const patientPhone = patientDetails?.patient_phone
                    || patientDetails?.phone
                    || '';
                  const patientAddress = patientDetails?.patient_address_text
                    || patientDetails?.patient_address
                    || patientDetails?.address_text
                    || patientDetails?.address
                    || '';
                  const patientLat = patientDetails?.patient_latitude ?? patientDetails?.latitude ?? null;
                  const patientLng = patientDetails?.patient_longitude ?? patientDetails?.longitude ?? null;
                  const patientNotes = patientDetails?.request_notes || '';
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
                                    {language === 'el' ? '\u039b\u03ae\u03b3\u03b5\u03b9' : 'Expires'}: {formatDateTime(request?.expires_at)} Β· {getRemainingLabel(request?.expires_at)}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {selectedByPatient && (
                              <span className="text-xs px-2 py-1 rounded-full whitespace-nowrap bg-pharma-teal/10 text-pharma-teal border border-pharma-teal/20">
                                {language === 'el' ? '\u0395\u03c0\u03b9\u03bb\u03ad\u03c7\u03b8\u03b7\u03ba\u03b5 \u03b1\u03c0\u03cc \u03b1\u03c3\u03b8\u03b5\u03bd\u03ae' : 'Selected by patient'}
                              </span>
                            )}
                            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${isCancelledExpired ? historyStatusInfo.className : statusInfo.className}`}>
                              {isCancelledExpired ? historyStatusInfo.label : statusInfo.label}
                            </span>
                          </div>
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

                        <div className="rounded-xl border border-pharma-grey-pale/60 bg-white px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-pharma-slate-grey">
                            {language === 'el' ? '\u03a3\u03c4\u03bf\u03b9\u03c7\u03b5\u03af\u03b1 \u03b1\u03c3\u03b8\u03b5\u03bd\u03ae' : 'Patient details'}
                          </p>
                          {canViewPatientDetails ? (
                            <div className="mt-1 space-y-1 text-sm text-pharma-charcoal">
                              <p className="font-medium">{patientName}</p>
                              {patientPhone && (
                                <p className="text-sm text-pharma-slate-grey">
                                  {patientPhone}
                                </p>
                              )}
                              {patientAddress ? (
                                <p className="text-sm text-pharma-slate-grey">
                                  {patientAddress}
                                </p>
                              ) : (patientLat != null && patientLng != null) ? (
                                <p className="text-sm text-pharma-slate-grey">
                                  {`${Number(patientLat).toFixed(5)}, ${Number(patientLng).toFixed(5)}`}
                                </p>
                              ) : (
                                <p className="text-sm text-pharma-slate-grey">
                                  {language === 'el' ? '\u0394\u03b5\u03bd \u03bf\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b5' : 'Not set'}
                                </p>
                              )}
                              {patientNotes && (
                                <p className="text-xs text-pharma-slate-grey">
                                  {patientNotes}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-pharma-slate-grey mt-1">
                              {language === 'el'
                                ? '\u03a4\u03b1 \u03c3\u03c4\u03bf\u03b9\u03c7\u03b5\u03af\u03b1 \u03b5\u03bc\u03c6\u03b1\u03bd\u03af\u03b6\u03bf\u03bd\u03c4\u03b1\u03b9 \u03bc\u03cc\u03bd\u03bf \u03cc\u03c4\u03b1\u03bd \u03bf \u03b1\u03c3\u03b8\u03b5\u03bd\u03ae\u03c2 \u03b5\u03c0\u03b9\u03bb\u03ad\u03be\u03b5\u03b9 \u03c4\u03bf \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03bf \u03c3\u03b1\u03c2.'
                                : 'Details are shown only when the patient selects your pharmacy.'}
                            </p>
                          )}
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
                        {canExecute && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90 gap-1"
                              onClick={() => markRequestExecuted(request?.id)}
                              disabled={executingId === request?.id}
                              data-testid={`execute-request-${request?.id}`}
                            >
                              {executingId === request?.id
                                ? (language === 'el' ? '\u0395\u03ba\u03c4\u03ad\u03bb\u03b5\u03c3\u03b7...' : 'Executing...')
                                : t('markExecuted')}
                            </Button>
                            {showExecuteDisclaimer && (
                              <div className="inline-flex min-w-0 max-w-[34ch] items-start gap-1 text-xs text-pharma-slate-grey leading-tight">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pharma-slate-grey/80" />
                                <p
                                  style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                  }}
                                >
                                  {t('markExecutedDisclaimer')}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

