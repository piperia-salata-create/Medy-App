import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { PHARMACY_PRESENCE_HEARTBEAT_MS } from '../../lib/pharmacyPresence';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { EmptyState } from '../../components/ui/empty-states';
import { toast } from 'sonner';
import { 
  Bell, 
  Settings, 
  LogOut,
  Pill,
  Users,
  Menu,
  X,
  Clock,
  Inbox,
  XCircle,
  CheckCircle2,
  Send,
  ArrowRight,
  Package,
  Boxes
} from 'lucide-react';

const isDev = process.env.NODE_ENV !== 'production';
const DEBUG = localStorage.getItem('DEBUG_LOGS') === '1';
const pharmacistDashboardDataCache = new Map();
const pharmacistDashboardUiCache = {
  deferMountReady: false,
  lightStageReady: false
};

const CONNECTION_STATUS_LABELS = {
  pending: {
    el: '\u0391\u03bd\u03b1\u03bc\u03bf\u03bd\u03ae \u03b1\u03c0\u03bf\u03b4\u03bf\u03c7\u03ae\u03c2',
    en: 'Pending acceptance'
  },
  accepted: {
    el: '\u03a3\u03c5\u03bd\u03b4\u03b5\u03b4\u03b5\u03bc\u03ad\u03bd\u03bf\u03c2',
    en: 'Connected'
  },
  rejected: {
    el: '\u0391\u03c0\u03bf\u03c1\u03c1\u03af\u03c6\u03b8\u03b7\u03ba\u03b5',
    en: 'Rejected'
  },
  cancelled: {
    el: '\u0391\u03ba\u03c5\u03c1\u03ce\u03b8\u03b7\u03ba\u03b5',
    en: 'Cancelled'
  }
};

const getConnectionStatusLabel = (status, language) => {
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : '';
  const labels = CONNECTION_STATUS_LABELS[normalizedStatus];
  if (!labels) return status || '-';
  return language === 'el' ? labels.el : labels.en;
};

const getConnectionDisplayName = (connection, language) => (
  connection?.other_pharmacy_name
  || connection?.other_full_name
  || (language === 'el' ? '\u03a6\u03b1\u03c1\u03bc\u03b1\u03ba\u03bf\u03c0\u03bf\u03b9\u03cc\u03c2' : 'Pharmacist')
);

const areConnectionSummariesEqual = (prev = {}, next = {}) => {
  if (prev.incoming !== next.incoming) return false;
  if (prev.outgoing !== next.outgoing) return false;
  if (prev.accepted !== next.accepted) return false;
  const prevRecent = Array.isArray(prev.recentAccepted) ? prev.recentAccepted : [];
  const nextRecent = Array.isArray(next.recentAccepted) ? next.recentAccepted : [];
  if (prevRecent.length !== nextRecent.length) return false;
  for (let i = 0; i < prevRecent.length; i += 1) {
    const p = prevRecent[i];
    const n = nextRecent[i];
    if ((p?.id || '') !== (n?.id || '')) return false;
    if ((p?.status || '') !== (n?.status || '')) return false;
    if ((p?.created_at || '') !== (n?.created_at || '')) return false;
  }
  return true;
};

const buildIncomingRecipientSignature = (row = {}) => {
  const req = row.request ?? row.patient_requests ?? {};
  return [
    row.id || '',
    row.status || '',
    req.id || '',
    req.status || '',
    req.expires_at || '',
    req.selected_pharmacy_id || '',
    req.created_at || '',
    req.medicine_query || '',
    req.notes || ''
  ].join('|');
};

const stabilizeIncomingRecipients = (prevList = [], nextList = []) => {
  const prevMap = new Map(
    prevList.map((item) => [
      item?.id,
      { item, sig: buildIncomingRecipientSignature(item) }
    ])
  );

  const result = nextList.map((item) => {
    const prevEntry = prevMap.get(item?.id);
    const sigNew = buildIncomingRecipientSignature(item);
    if (prevEntry && prevEntry.sig === sigNew) {
      return prevEntry.item;
    }
    return item;
  });

  if (prevList.length === result.length && result.every((item, index) => item === prevList[index])) {
    return prevList;
  }

  return result;
};

export default function PharmacistDashboardLazy() {
  const { user, profile, signOut, isPharmacist, profileStatus } = useAuth();
  const userId = user?.id || null;
  const profileId = profile?.id || null;
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const isProfileReady = profileStatus === 'ready';
  const cachedData = userId ? pharmacistDashboardDataCache.get(userId) : null;

  // State
  const [pharmacy, setPharmacy] = useState(cachedData?.pharmacy || null);
  const pharmacyId = pharmacy?.id || null;
  const [isOnDuty, setIsOnDuty] = useState(Boolean(cachedData?.isOnDuty));
  const [loading, setLoading] = useState(() => !cachedData);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Connections state
  const [connections, setConnections] = useState(cachedData?.connections || { incoming: 0, outgoing: 0, accepted: 0, recentAccepted: [] });
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  
  // Stock requests state
  const [stockRequests, setStockRequests] = useState(cachedData?.stockRequests || { pending: 0, recent: [] });
  const [exchangeUnreadCount, setExchangeUnreadCount] = useState(0);
  const [incomingRequests, setIncomingRequests] = useState(cachedData?.incomingRequests || []);
  const [incomingInitialLoading, setIncomingInitialLoading] = useState(false);
  const [incomingRefreshing, setIncomingRefreshing] = useState(false);
  const [deferMount, setDeferMount] = useState(pharmacistDashboardUiCache.deferMountReady);
  const [lightStageReady, setLightStageReady] = useState(pharmacistDashboardUiCache.lightStageReady);
  const canLoadLight = isProfileReady && lightStageReady;
  const canLoadData = isProfileReady && deferMount && lightStageReady;
  const incomingLoadedRef = useRef(false);
  const incomingRequestsRef = useRef([]);
  const connectionRefreshTimerRef = useRef(null);
  const initialDataLoadedRef = useRef(false);

  useEffect(() => {
    const userCache = userId ? pharmacistDashboardDataCache.get(userId) : null;
    if (userCache) {
      setPharmacy(userCache.pharmacy || null);
      setIsOnDuty(Boolean(userCache.isOnDuty));
      setConnections(userCache.connections || { incoming: 0, outgoing: 0, accepted: 0, recentAccepted: [] });
      setStockRequests(userCache.stockRequests || { pending: 0, recent: [] });
      setIncomingRequests(userCache.incomingRequests || []);
      initialDataLoadedRef.current = true;
      setLoading(false);
      return;
    }

    setPharmacy(null);
    setIsOnDuty(false);
    setConnections({ incoming: 0, outgoing: 0, accepted: 0, recentAccepted: [] });
    setStockRequests({ pending: 0, recent: [] });
    setIncomingRequests([]);
    initialDataLoadedRef.current = false;
    setLoading(Boolean(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    pharmacistDashboardDataCache.set(userId, {
      pharmacy,
      isOnDuty,
      connections,
      stockRequests,
      incomingRequests
    });
  }, [userId, pharmacy, isOnDuty, connections, stockRequests, incomingRequests]);

  // Redirect if not pharmacist
  useEffect(() => {
    if (!isProfileReady) return;
    if (profileId && !isPharmacist()) {
      navigate('/patient');
    }
  }, [profileId, isPharmacist, navigate, isProfileReady]);

  useEffect(() => {
    if (deferMount) return;
    const markReady = () => {
      pharmacistDashboardUiCache.deferMountReady = true;
      setDeferMount(true);
    };
    const id = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(markReady)
      : setTimeout(markReady, 0);
    return () => {
      if (typeof id === 'number') {
        clearTimeout(id);
      } else if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(id);
      }
    };
  }, [deferMount]);

  useEffect(() => {
    if (!isProfileReady) {
      setLightStageReady(false);
      return;
    }
    if (lightStageReady) return;
    if (pharmacistDashboardUiCache.lightStageReady) {
      setLightStageReady(true);
      return;
    }
    const timer = setTimeout(() => {
      pharmacistDashboardUiCache.lightStageReady = true;
      setLightStageReady(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [isProfileReady, lightStageReady]);

  useEffect(() => {
    incomingLoadedRef.current = false;
    setIncomingInitialLoading(false);
    setIncomingRefreshing(false);
  }, [pharmacyId]);

  useEffect(() => {
    incomingRequestsRef.current = incomingRequests;
  }, [incomingRequests]);

  useEffect(() => {
    if (!isProfileReady) return;
    import('../shared/SettingsPage');
    import('../shared/SettingsProfilePage');
  }, [isProfileReady]);

  // Fetch pharmacist's pharmacy
  // TODO: Handle multiple pharmacies - currently using first one
  const fetchPharmacy = useCallback(async () => {
    if (!canLoadLight) return null;
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setPharmacy(null);
        setIsOnDuty(false);
        return null;
      }

      setPharmacy(data);
      setIsOnDuty(data.is_on_call || false);
      return data;
    } catch (error) {
      console.error('Error fetching pharmacy:', error);
      return null;
    }
  }, [canLoadLight, userId]);

  // Fetch connections summary
  const fetchConnections = useCallback(async () => {
    if (!canLoadLight) return;
    if (!userId) return;
    try {
      const { data: rawConnections, error: rawConnectionsError } = await supabase
        .from('pharmacist_connections')
        .select('id, status, created_at, requester_pharmacist_id, target_pharmacist_id')
        .or(`requester_pharmacist_id.eq.${userId},target_pharmacist_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (rawConnectionsError) throw rawConnectionsError;

      const { data: connectionProfiles, error: rpcError } = await supabase
        .rpc('get_my_pharmacist_connections');

      if (rpcError) throw rpcError;

      const profileByConnectionId = new Map(
        (connectionProfiles || []).map((row) => [row.connection_id, row])
      );

      const all = (rawConnections || []).map((connection) => {
        const profileDetails = profileByConnectionId.get(connection.id) || {};
        return {
          ...connection,
          other_pharmacist_id: profileDetails.other_pharmacist_id || null,
          other_full_name: profileDetails.other_full_name || null,
          other_pharmacy_name: profileDetails.other_pharmacy_name || null
        };
      });

      const incoming = all.filter(c => c.status === 'pending' && c.target_pharmacist_id === userId).length;
      const outgoing = all.filter(c => c.status === 'pending' && c.requester_pharmacist_id === userId).length;
      const acceptedList = all
        .filter(c => c.status === 'accepted')
        .map((connection) => ({
          ...connection,
          display_name: getConnectionDisplayName(connection, language),
          status_label: getConnectionStatusLabel(connection.status, language)
        }));
      
      const nextSummary = {
        incoming,
        outgoing,
        accepted: acceptedList.length,
        recentAccepted: acceptedList.slice(0, 3)
      };
      setConnections((prev) => (areConnectionSummariesEqual(prev, nextSummary) ? prev : nextSummary));
    } catch (error) {
      console.error('Error fetching connections:', error);
    }
  }, [canLoadLight, userId, language]);

  const fetchExchangeUnreadCount = useCallback(async () => {
    if (!canLoadLight || !userId) {
      setExchangeUnreadCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('exchange_notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);

      if (error) throw error;
      setExchangeUnreadCount(count || 0);
    } catch (error) {
      if (DEBUG) {
        console.error('Error fetching exchange unread count:', error);
      }
    }
  }, [canLoadLight, userId]);

  useEffect(() => {
    if (!canLoadLight || !userId) {
      setExchangeUnreadCount(0);
      return undefined;
    }

    fetchExchangeUnreadCount();

    const channel = supabase
      .channel(`exchange_notifications_badge:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exchange_notifications',
          filter: `recipient_user_id=eq.${userId}`
        },
        () => fetchExchangeUnreadCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canLoadLight, fetchExchangeUnreadCount, userId]);

  // Fetch stock requests
  const fetchStockRequests = useCallback(async () => {
    if (!canLoadData) return;
    if (!pharmacyId) return;
    try {
      const { data, error } = await supabase
        .from('stock_requests')
        .select('*')
        .eq('to_pharmacy_id', pharmacyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error && error.code !== 'PGRST116') throw error;

      setStockRequests({
        pending: data?.length || 0,
        recent: data || []
      });
    } catch (error) {
      console.error('Error fetching stock requests:', error);
    }
  }, [canLoadData, pharmacyId]);

  // Fetch incoming patient requests
  const fetchIncomingRequests = useCallback(async (options = {}) => {
    if (!canLoadData) return;
    if (!pharmacyId) return;
    const now = Date.now();
    const isInitialLoad = !incomingLoadedRef.current;
    let didChange = false;
    if (isInitialLoad && options?.silent !== true) {
      setIncomingInitialLoading(true);
    }
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('patient_request_recipients')
        .select(`
          id,
          status,
          responded_at,
          request_id,
          request:patient_requests!patient_request_recipients_request_id_fkey!inner (
            id,
            medicine_query,
            dosage,
            form,
            urgency,
            status,
            created_at,
            expires_at,
            deleted_at,
            selected_pharmacy_id,
            notes
          )
        `)
        .eq('pharmacy_id', pharmacyId)
        .eq('status', 'pending')
        .is('patient_requests.deleted_at', null)
        .gt('patient_requests.expires_at', nowIso)
        .neq('patient_requests.status', 'cancelled')
        .or(`selected_pharmacy_id.is.null,selected_pharmacy_id.eq.${pharmacyId}`, { foreignTable: 'patient_requests' })
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (DEBUG && data && data.length > 0) {
        console.log('[PharmacistDashboard] sample recipient row', data[0]);
      }
      const filtered = (data || []).filter((recipient) => {
        // Guard: exclude if request is null
        const req = recipient.request ?? recipient.patient_requests ?? null;
        if (!req) {
          if (DEBUG) {
            console.warn('[PharmacistDashboard] Excluding row with null request:', recipient.id);
          }
          return false;
        }

        const requestStatus = req.status;
        const recipientStatus = recipient.status;
        const expiresAt = req.expires_at;
        const selectedId = req.selected_pharmacy_id ?? null;

        if (selectedId && selectedId !== pharmacyId) return false;

        // isCancelled: check request.status OR recipient.status
        const isCancelled = requestStatus === 'cancelled' || recipientStatus === 'cancelled';
        if (isCancelled) return false;

        // isExpired: check expires_at
        const isExpired = expiresAt && new Date(expiresAt).getTime() <= now;
        if (isExpired) return false;

        // isActiveIncoming: must be pending or accepted at request level
        const isActiveIncoming = requestStatus === 'pending' || requestStatus === 'accepted';
        if (!isActiveIncoming) return false;

        return true;
      });
      filtered.sort((a, b) => {
        const aReq = a?.request ?? a?.patient_requests ?? {};
        const bReq = b?.request ?? b?.patient_requests ?? {};
        const aRaw = new Date(aReq?.created_at || 0).getTime();
        const bRaw = new Date(bReq?.created_at || 0).getTime();
        const aTime = Number.isFinite(aRaw) ? aRaw : 0;
        const bTime = Number.isFinite(bRaw) ? bRaw : 0;
        if (bTime !== aTime) return bTime - aTime;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });

      const prevList = incomingRequestsRef.current || [];
      const stabilized = stabilizeIncomingRecipients(prevList, filtered);
      didChange = stabilized !== prevList;

      if (!isInitialLoad && didChange) {
        setIncomingRefreshing(true);
      }

      setIncomingRequests(stabilized);
      incomingRequestsRef.current = stabilized;
      incomingLoadedRef.current = true;
    } catch (error) {
      console.error('Error fetching incoming requests:', error);
    } finally {
      setIncomingInitialLoading(false);
      if (!isInitialLoad && didChange) {
        setIncomingRefreshing(false);
      }
    }
  }, [canLoadData, pharmacyId]);

  // Toggle on-duty status
  const toggleOnDuty = async (checked) => {
    // Optimistic update
    setIsOnDuty(checked);
    
    try {
      if (!pharmacy) {
        toast.error(language === 'el' ? 'Δεν βρέθηκε φαρμακείο' : 'Pharmacy not found');
        setIsOnDuty(!checked);
        return;
      }

      const { error } = await supabase
        .from('pharmacies')
        .update({ is_on_call: checked })
        .eq('id', pharmacy.id);

      if (error) throw error;

      toast.success(
        checked 
          ? (language === 'el' ? 'Είστε σε εφημερία' : 'You are now on duty')
          : (language === 'el' ? 'Τέλος εφημερίας' : 'You are now off duty')
      );
    } catch (error) {
      // Revert on error
      setIsOnDuty(!checked);
      toast.error(language === 'el' ? 'Σφάλμα ενημέρωσης' : 'Update failed');
    }
  };
  // Send invite
  const sendInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error(language === 'el' ? 'Εισάγετε email' : 'Enter an email');
      return;
    }

    const normalizedInviteEmail = inviteEmail.trim().toLowerCase();
    const normalizedOwnEmail = (user?.email || profile?.email || '').trim().toLowerCase();
    if (normalizedOwnEmail && normalizedInviteEmail === normalizedOwnEmail) {
      toast.error(language === 'el' ? 'Δεν μπορείτε να προσκαλέσετε τον εαυτό σας' : 'Cannot invite yourself');
      return;
    }

    setSendingInvite(true);
    try {
      const { data: target, error: findError } = await supabase
        .rpc('find_pharmacist_profile_by_email', { p_email: normalizedInviteEmail });

      if (findError) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Error finding pharmacist by email via RPC:', findError);
        }
        toast.error(language === 'el' ? '\u03A3\u03C6\u03AC\u03BB\u03BC\u03B1 \u03B1\u03BD\u03B1\u03B6\u03AE\u03C4\u03B7\u03C3\u03B7\u03C2 \u03C6\u03B1\u03C1\u03BC\u03B1\u03BA\u03BF\u03C0\u03BF\u03B9\u03BF\u03CD' : 'Error looking up pharmacist');
        return;
      }

      const targetProfile = Array.isArray(target) ? target[0] : target;

      if (!targetProfile || (Array.isArray(target) && target.length === 0)) {
        toast.error(language === 'el' ? '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 \u03B5\u03B3\u03B3\u03C1\u03B1\u03C6\u03AE \u03C6\u03B1\u03C1\u03BC\u03B1\u03BA\u03BF\u03C0\u03BF\u03B9\u03BF\u03CD \u03BC\u03B5 \u03B1\u03C5\u03C4\u03CC \u03C4\u03BF email' : 'No pharmacist profile found with this email');
        return;
      }
      if (targetProfile.id === userId) {
        toast.error(language === 'el' ? 'Δεν μπορείτε να προσκαλέσετε τον εαυτό σας' : 'Cannot invite yourself');
        return;
      }

      // Check for existing connection
      const { data: existing } = await supabase
        .from('pharmacist_connections')
        .select('id, status')
        .or(
          `and(requester_pharmacist_id.eq.${userId},target_pharmacist_id.eq.${targetProfile.id}),` +
          `and(requester_pharmacist_id.eq.${targetProfile.id},target_pharmacist_id.eq.${userId})`
        )
        .maybeSingle();

      if (existing) {
        toast.error(language === 'el' ? 'Υπάρχει ήδη σύνδεση' : 'Connection already exists');
        return;
      }

      // Create invite
      const { error: insertError } = await supabase
          .from('pharmacist_connections')
          .insert({
          requester_pharmacist_id: userId,
          target_pharmacist_id: targetProfile.id,
          status: 'pending'
        });

      if (insertError) throw insertError;

      toast.success(language === 'el' ? 'Πρόσκληση εστάλη!' : 'Invite sent!');
      setInviteDialogOpen(false);
      setInviteEmail('');
      fetchConnections();
    } catch (error) {
      console.error('Error sending invite:', error);
      toast.error(language === 'el' ? 'Σφάλμα αποστολής' : 'Error sending invite');
    } finally {
      setSendingInvite(false);
    }
  };

  const respondToPatientRequest = async (recipientId, status) => {
    try {
      if (!pharmacy?.id) {
        toast.error(language === 'el'
          ? '\u0394\u03b5\u03bd \u03b2\u03c1\u03ad\u03b8\u03b7\u03ba\u03b5 \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03bf.'
          : 'Pharmacy not found.');
        return;
      }

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
          ? (language === 'el' ? 'Αίτημα αποδεκτό' : 'Request accepted')
          : (language === 'el' ? 'Αίτημα απορρίφθηκε' : 'Request rejected')
      );

      fetchIncomingRequests({ silent: true });
    } catch (error) {
      console.error('Error responding to patient request:', error);
      toast.error(language === 'el' ? 'Σφάλμα ενημέρωσης' : 'Update failed');
    }
  };

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      const isInitialLoad = !initialDataLoadedRef.current;
      if (isInitialLoad) {
        setLoading(true);
      }
      await fetchPharmacy();
      await fetchConnections();
      if (isInitialLoad) {
        initialDataLoadedRef.current = true;
        setLoading(false);
      }
    };
    
    if (userId && canLoadLight) {
      loadData();
    }
  }, [userId, fetchPharmacy, fetchConnections, canLoadLight]);

  // Fetch stock requests after pharmacy is loaded
  useEffect(() => {
    if (!canLoadData) return;
    if (pharmacyId) {
      fetchStockRequests();
      fetchIncomingRequests();
    }
  }, [pharmacyId, fetchStockRequests, fetchIncomingRequests, canLoadData]);

  // Realtime subscriptions
  useEffect(() => {
    if (!canLoadData) return;
    if (!userId) return;

    const scheduleConnectionsRefresh = () => {
      if (connectionRefreshTimerRef.current) return;
      connectionRefreshTimerRef.current = setTimeout(() => {
        connectionRefreshTimerRef.current = null;
        fetchConnections();
      }, 250);
    };

    const connectionsChannel = supabase
      .channel(`pharmacist_connections_realtime:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pharmacist_connections', filter: `requester_pharmacist_id=eq.${userId}` },
        scheduleConnectionsRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pharmacist_connections', filter: `target_pharmacist_id=eq.${userId}` },
        scheduleConnectionsRefresh
      )
      .subscribe();

    return () => {
      if (connectionRefreshTimerRef.current) {
        clearTimeout(connectionRefreshTimerRef.current);
        connectionRefreshTimerRef.current = null;
      }
      supabase.removeChannel(connectionsChannel);
    };
  }, [userId, fetchConnections, canLoadData]);

  useEffect(() => {
    if (!canLoadData) return;
    if (!pharmacyId) return;

    const requestsChannel = supabase
      .channel(`patient_request_recipients:${pharmacyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patient_request_recipients', filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchIncomingRequests({ silent: true })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
    };
  }, [pharmacyId, fetchIncomingRequests, canLoadData]);

  useEffect(() => {
    if (!canLoadLight) return;
    if (!userId || !pharmacy?.id) return;
    if (!isOnDuty) return;

    let isCancelled = false;

    const sendPresenceHeartbeat = async () => {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('pharmacies')
        .update({ updated_at: nowIso })
        .eq('id', pharmacy.id)
        .eq('owner_id', userId)
        .eq('is_on_call', true);

      if (error && DEBUG && !isCancelled) {
        console.error('Pharmacy heartbeat failed:', error);
      }
    };

    sendPresenceHeartbeat();
    const timer = setInterval(sendPresenceHeartbeat, PHARMACY_PRESENCE_HEARTBEAT_MS);

    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [canLoadLight, isOnDuty, pharmacy?.id, userId]);

  if (!isProfileReady || !deferMount) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue p-4 space-y-4">
        <div className="h-8 w-44 bg-white rounded-xl shadow-sm animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-40 bg-white rounded-2xl shadow-sm animate-pulse" />
          <div className="h-40 bg-white rounded-2xl shadow-sm animate-pulse" />
        </div>
        <div className="h-32 bg-white rounded-2xl shadow-sm animate-pulse" />
      </div>
    );
  }

  if (!isPharmacist()) {
    return null;
  }

  const getMapsUrl = (pharmacyData) => {
    if (!pharmacyData) return null;
    const hasCoords = pharmacyData.latitude !== null && pharmacyData.latitude !== undefined
      && pharmacyData.longitude !== null && pharmacyData.longitude !== undefined;
    const query = hasCoords
      ? `${pharmacyData.latitude},${pharmacyData.longitude}`
      : pharmacyData.address;
    if (!query) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  };

  const getRemainingLabel = (expiresAt) => {
    if (!expiresAt) return '';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return language === 'el' ? 'Έληξε' : 'Expired';
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return language === 'el'
        ? `Λήγει σε ${hours}ω ${minutes}λ`
        : `Expires in ${hours}h ${minutes}m`;
    }
    return language === 'el'
      ? `Λήγει σε ${minutes}λ`
      : `Expires in ${minutes}m`;
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString(language === 'el' ? 'el-GR' : 'en-US');
  };

  const isVerified = Boolean(pharmacy?.is_verified);

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="pharmacist-dashboard">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pharma-teal flex items-center justify-center">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-pharma-dark-slate">
                {language === 'el' ? 'Πίνακας Ελέγχου' : 'Dashboard'}
              </h1>
              <p className="text-xs text-pharma-slate-grey">
                {profile?.full_name || user?.email}
              </p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-2">
            <Link to="/pharmacist/inventory">
              <Button variant="ghost" className="rounded-full gap-2" data-testid="nav-inventory-btn">
                <Boxes className="w-4 h-4" />
                {language === 'el' ? 'Απόθεμα' : 'Inventory'}
              </Button>
            </Link>
            <Link to="/pharmacist/connections">
              <Button variant="ghost" className="rounded-full gap-2" data-testid="nav-connections-btn">
                <Users className="w-4 h-4" />
                {language === 'el' ? 'Συνδέσεις' : 'Connections'}
                {connections.incoming > 0 && (
                  <span className="bg-pharma-coral text-white text-xs px-1.5 py-0.5 rounded-full">
                    {connections.incoming}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/pharmacist/notifications">
              <Button
                variant="ghost"
                className={`rounded-full gap-2 relative ${exchangeUnreadCount > 0 ? 'bg-pharma-teal/10 text-pharma-teal hover:bg-pharma-teal/15' : ''}`}
                data-testid="nav-notifications-btn"
              >
                <Bell className="w-4 h-4" />
                {language === 'el' ? 'Ειδοποιήσεις' : 'Notifications'}
                {exchangeUnreadCount > 0 && (
                  <span className="bg-pharma-coral text-white text-xs px-1.5 py-0.5 rounded-full">
                    {exchangeUnreadCount > 9 ? '9+' : exchangeUnreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/pharmacist/settings">
              <Button variant="ghost" size="icon" className="rounded-full" data-testid="nav-settings-btn">
                <Settings className="w-5 h-5" />
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full text-pharma-slate-grey"
              onClick={handleSignOut}
              data-testid="signout-btn"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </nav>

          {/* Mobile Menu Toggle */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden rounded-full"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="mobile-menu-btn"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-pharma-grey-pale p-4 space-y-2 animate-slide-up">
            <Link to="/pharmacist/inventory" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl">
                <Boxes className="w-5 h-5" />
                {language === 'el' ? 'Απόθεμα' : 'Inventory'}
              </Button>
            </Link>
            <Link to="/pharmacist/connections" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl">
                <Users className="w-5 h-5" />
                {language === 'el' ? 'Συνδέσεις' : 'Connections'}
                {connections.incoming > 0 && (
                  <span className="bg-pharma-coral text-white text-xs px-1.5 py-0.5 rounded-full ml-auto">
                    {connections.incoming}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/pharmacist/notifications" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl">
                <Bell className="w-5 h-5" />
                {language === 'el' ? 'Ειδοποιήσεις' : 'Notifications'}
                {exchangeUnreadCount > 0 && (
                  <span className="bg-pharma-coral text-white text-xs px-1.5 py-0.5 rounded-full ml-auto">
                    {exchangeUnreadCount > 9 ? '9+' : exchangeUnreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/pharmacist/settings" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl">
                <Settings className="w-5 h-5" />
                {language === 'el' ? 'Ρυθμίσεις' : 'Settings'}
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 rounded-xl text-pharma-slate-grey"
              onClick={handleSignOut}
            >
              <LogOut className="w-5 h-5" />
              {language === 'el' ? 'Αποσύνδεση' : 'Sign Out'}
            </Button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {loading ? (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {['top-card-1', 'top-card-2'].map((cardKey) => (
                <Card key={cardKey} className="bg-white rounded-2xl shadow-card border-pharma-grey-pale animate-pulse">
                  <CardContent className="p-6 h-40" />
                </Card>
              ))}
            </div>
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale animate-pulse">
              <CardContent className="p-6 h-72" />
            </Card>
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 items-stretch">
            {/* STATUS CARD - On Duty Toggle */}
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter h-full w-full" data-testid="status-card">
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                    <Clock className="w-5 h-5 text-pharma-teal" />
                    {language === 'el' ? 'Κατάσταση Εφημερίας' : 'Duty Status'}
                  </CardTitle>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      isVerified
                        ? 'bg-pharma-sea-green/10 text-pharma-sea-green'
                        : 'bg-pharma-coral/10 text-pharma-coral'
                    }`}
                  >
                    {isVerified ? t('pharmacyVerifiedBadge') : t('pharmacyNotVerifiedBadge')}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 h-full">
                <div className="flex items-center justify-between min-h-[92px]">
                  <div>
                    <p className="text-pharma-charcoal font-medium">
                      {isOnDuty 
                        ? (language === 'el' ? 'Σε Εφημερία' : 'On Duty')
                        : (language === 'el' ? 'Εκτός Εφημερίας' : 'Off Duty')
                      }
                    </p>
                    <p className="text-sm text-pharma-slate-grey">
                      {isOnDuty
                        ? (language === 'el' ? 'Οι ασθενείς μπορούν να σας βρουν' : 'Patients can find you')
                        : (language === 'el' ? 'Δεν εμφανίζεστε στις αναζητήσεις' : 'Not visible in searches')
                      }
                    </p>
                  </div>
                  <Switch
                    checked={isOnDuty}
                    onCheckedChange={toggleOnDuty}
                    className="data-[state=checked]:bg-pharma-sea-green"
                    data-testid="on-duty-toggle"
                  />
                </div>
              </CardContent>
            </Card>

            {/* STOCK REQUESTS SUMMARY */}
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter h-full" style={{ animationDelay: '0.15s' }} data-testid="stock-requests-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                  <Package className="w-5 h-5 text-pharma-coral" />
                  {language === 'el' ? '\u0391\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03b1 \u0391\u03c0\u03bf\u03b8\u03ad\u03bc\u03b1\u03c4\u03bf\u03c2' : 'Stock Requests'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center justify-between mb-4 p-3 bg-pharma-coral/10 rounded-xl">
                  <div>
                    <p className="text-2xl font-bold text-pharma-coral" data-testid="pending-requests-count">
                      {stockRequests.pending}
                    </p>
                    <p className="text-sm text-pharma-slate-grey">
                      {language === 'el' ? '\u0395\u03ba\u03ba\u03c1\u03b5\u03bc\u03ae \u03b1\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03b1' : 'Pending requests'}
                    </p>
                  </div>
                  <Package className="w-10 h-10 text-pharma-coral/30" />
                </div>

                {stockRequests.recent.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {stockRequests.recent.slice(0, 3).map((req) => (
                      <div key={req.id} className="flex items-center gap-2 p-2 bg-pharma-grey-pale/30 rounded-lg">
                        <Clock className="w-4 h-4 text-pharma-coral flex-shrink-0" />
                        <span className="text-sm text-pharma-charcoal truncate">
                          {req.medicine_name || 'Stock request'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-pharma-slate-grey text-center py-4">
                    {language === 'el' ? '\u0394\u03b5\u03bd \u03c5\u03c0\u03ac\u03c1\u03c7\u03bf\u03c5\u03bd \u03b5\u03ba\u03ba\u03c1\u03b5\u03bc\u03ae \u03b1\u03b9\u03c4\u03ae\u03bc\u03b1\u03c4\u03b1' : 'No pending requests'}
                  </p>
                )}

                <Link to="/pharmacist/inter-pharmacy">
                  <Button variant="outline" className="w-full rounded-full gap-2" data-testid="view-requests-btn">
                    {language === 'el' ? '\u0394\u03b9\u03b1\u03c7\u03b5\u03af\u03c1\u03b9\u03c3\u03b7 \u0391\u03b9\u03c4\u03b7\u03bc\u03ac\u03c4\u03c9\u03bd' : 'Manage Requests'}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
            </div>

            {/* INCOMING PATIENT REQUESTS */}
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter w-full" style={{ animationDelay: '0.2s' }} data-testid="incoming-patient-requests-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-pharma-teal" />
                  {language === 'el' ? 'Εισερχόμενα Αιτήματα Ασθενών' : 'Incoming Patient Requests'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2 flex flex-col min-h-0">
                <div className="mb-2 min-h-[18px] text-xs text-pharma-slate-grey">
                  {incomingRefreshing ? (
                    language === 'el' ? 'Γίνεται ενημέρωση...' : 'Updating...'
                  ) : (
                    <span className="invisible">
                      {language === 'el' ? 'Γίνεται ενημέρωση...' : 'Updating...'}
                    </span>
                  )}
                </div>
                <div className="paint-stable">
                  <div className="incoming-scroll max-h-[420px] md:max-h-[520px] lg:max-h-[600px] overflow-y-auto pr-1">
                  {!pharmacy ? (
                    <p className="text-sm text-pharma-slate-grey">
                      {language === 'el' ? 'Προσθέστε φαρμακείο για να λαμβάνετε αιτήματα.' : 'Add a pharmacy to receive requests.'}
                    </p>
                  ) : (incomingInitialLoading && incomingRequests.length === 0) ? (
                    <p className="text-sm text-pharma-slate-grey">
                      {language === 'el' ? 'Φόρτωση...' : 'Loading...'}
                    </p>
                  ) : incomingRequests.length === 0 ? (
                    <EmptyState
                      icon={Inbox}
                      title={language === 'el' ? 'Δεν υπάρχουν αιτήματα' : 'No incoming requests'}
                      description={language === 'el' ? 'Θα εμφανίζονται εδώ όταν υπάρχουν.' : 'They will appear here when available.'}
                    />
                  ) : (
                    <div className="space-y-3">
                      {incomingRequests.map((req) => {
                        // Render-time guard
                        if (!req.request) {
                          if (DEBUG) {
                            console.warn('[PharmacistDashboard] Skipping render of row with null request:', req.id);
                          }
                          return null;
                        }
                        return (
                        <div key={req.id} className="p-4 rounded-xl border border-pharma-grey-pale bg-pharma-ice-blue/40">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-pharma-dark-slate truncate">
                                {req.request?.medicine_query || 'Request'}
                              </p>
                              {req.request?.notes && (
                                <p className="text-sm text-pharma-slate-grey mt-1">
                                  {req.request?.notes}
                                </p>
                              )}
                              {req.request?.created_at && (
                                <p className="text-xs text-pharma-silver mt-2">
                                  {new Date(req.request?.created_at).toLocaleString(language === 'el' ? 'el-GR' : 'en-US')}
                                </p>
                              )}
                              {req.request?.expires_at && (
                                <p className="text-xs text-pharma-slate-grey mt-1">
                                  {language === 'el' ? 'Λήγει:' : 'Expires'} {formatDateTime(req.request?.expires_at)} Β· {getRemainingLabel(req.request?.expires_at)}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                className="rounded-full bg-pharma-sea-green hover:bg-pharma-sea-green/90 gap-1"
                                onClick={() => respondToPatientRequest(req.id, 'accepted')}
                                data-testid={`accept-patient-request-${req.id}`}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                {language === 'el' ? 'Αποδοχή' : 'Accept'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full gap-1"
                                onClick={() => respondToPatientRequest(req.id, 'rejected')}
                                data-testid={`reject-patient-request-${req.id}`}
                              >
                                <XCircle className="w-4 h-4" />
                                {language === 'el' ? 'Απόρριψη' : 'Reject'}
                              </Button>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </div>
                {pharmacy ? (
                  <Link to="/pharmacist/patient-requests">
                    <Button
                      variant="outline"
                      className="w-full rounded-full gap-2 mt-4"
                      data-testid="manage-patient-requests-btn"
                    >
                      {language === 'el' ? '\u0394\u03b9\u03b1\u03c7\u03b5\u03af\u03c1\u03b9\u03c3\u03b7 \u0391\u03b9\u03c4\u03b7\u03bc\u03ac\u03c4\u03c9\u03bd' : 'Manage Requests'}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full rounded-full gap-2 mt-4"
                    disabled
                    data-testid="manage-patient-requests-btn"
                  >
                    {language === 'el' ? '\u0394\u03b9\u03b1\u03c7\u03b5\u03af\u03c1\u03b9\u03c3\u03b7 \u0391\u03b9\u03c4\u03b7\u03bc\u03ac\u03c4\u03c9\u03bd' : 'Manage Requests'}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-pharma-dark-slate">
              {language === 'el' ? 'Πρόσκληση Φαρμακοποιού' : 'Invite Pharmacist'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-pharma-slate-grey">
              {language === 'el' 
                ? 'Εισάγετε το email του φαρμακοποιού.'
                : 'Enter the pharmacist\'s email address.'}
            </p>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="pharmacist@example.com"
              className="rounded-xl"
              data-testid="invite-email-input"
            />
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setInviteDialogOpen(false);
                setInviteEmail('');
              }}
            >
              {language === 'el' ? 'Ακύρωση' : 'Cancel'}
            </Button>
            <Button
              className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90 gap-2"
              onClick={sendInvite}
              disabled={sendingInvite}
              data-testid="send-invite-btn"
            >
              <Send className="w-4 h-4" />
              {sendingInvite 
                ? (language === 'el' ? 'Αποστολή...' : 'Sending...')
                : (language === 'el' ? 'Αποστολή' : 'Send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
