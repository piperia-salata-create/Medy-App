import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeniorMode } from '../../contexts/SeniorModeContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { StatusBadge, OnCallBadge } from '../../components/ui/status-badge';
import { SkeletonPharmacyCard, SkeletonMedicineCard, SkeletonList, SkeletonCard } from '../../components/ui/skeleton-loaders';
import { EmptyState } from '../../components/ui/empty-states';
import { PharmacyMap, useGeolocation, calculateDistance, formatDistance } from '../../components/ui/pharmacy-map';
import { toast } from 'sonner';
import { 
  Search, 
  MapPin, 
  Phone, 
  Heart, 
  Bell, 
  Settings, 
  LogOut,
  Clock,
  Pill,
  ChevronRight,
  Navigation,
  Menu,
  X,
  Map,
  List,
  Locate,
  Send,
  ClipboardList
} from 'lucide-react';

const dayKeyByIndex = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const timeToMinutes = (time) => {
  if (!time || typeof time !== 'string') return null;
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const isPharmacyOpenNow = (hoursValue) => {
  if (!hoursValue) return false;
  let parsed = null;
  if (typeof hoursValue === 'string') {
    try {
      parsed = JSON.parse(hoursValue);
    } catch (err) {
      return false;
    }
  } else if (typeof hoursValue === 'object') {
    parsed = hoursValue;
  }
  if (!parsed || typeof parsed !== 'object') return false;

  const todayKey = dayKeyByIndex[new Date().getDay()] || 'mon';
  const entry = parsed[todayKey] || {};
  if (entry.closed === true) return false;
  const openValue = typeof entry.open === 'string' ? entry.open : '';
  const closeValue = typeof entry.close === 'string' ? entry.close : '';
  if (!openValue || !closeValue) return false;

  const openMinutes = timeToMinutes(openValue);
  const closeMinutes = timeToMinutes(closeValue);
  if (openMinutes === null || closeMinutes === null) return false;
  if (closeMinutes <= openMinutes) return false;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
};

export default function PatientDashboard() {
  const { user, session, loading: authLoading, profile, signOut } = useAuth();
  const { t, language } = useLanguage();
  const { seniorMode } = useSeniorMode();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const { location: userLocation, loading: locationLoading, getLocation } = useGeolocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [pharmacies, setPharmacies] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestMedicine, setRequestMedicine] = useState('');
  const [requestDosage, setRequestDosage] = useState('');
  const [requestForm, setRequestForm] = useState('');
  const [requestUrgency, setRequestUrgency] = useState('normal');
  const [requestDuration, setRequestDuration] = useState('1h');
  const [requestSending, setRequestSending] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [showExpiredRequests, setShowExpiredRequests] = useState(false);
  const [requestsTab, setRequestsTab] = useState('active'); // 'active' or 'history'
  const [historyVisibleCount, setHistoryVisibleCount] = useState(5);
  const [acceptedCancelCountThisMonth, setAcceptedCancelCountThisMonth] = useState(0);
  const remainingAcceptedCancels = Math.max(0, 3 - acceptedCancelCountThisMonth);
  const [nowTick, setNowTick] = useState(Date.now());
  const initFetchSessionRef = useRef(null);

  // Fetch pharmacies
  const fetchPharmacies = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*');

      if (error) throw error;
      
      let pharmacyData = data || [];
      console.log('[PatientDashboard] nearby pharmacies fetch', {
        userCoords: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
        radius: null,
        count: pharmacyData.length
      });
      
      // Sort by distance if user location available
      if (userLocation && pharmacyData.length > 0) {
        pharmacyData = pharmacyData.map(p => ({
          ...p,
          distance: p.latitude && p.longitude 
            ? calculateDistance(userLocation.lat, userLocation.lng, p.latitude, p.longitude)
            : null
        })).sort((a, b) => {
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
      }
      
      setPharmacies(pharmacyData);
    } catch (error) {
      console.error('Error fetching pharmacies:', error);
    }
  }, [userLocation]);

  // Fetch user favorites
  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('pharmacy_id')
        .eq('user_id', user.id);

      if (error) throw error;
      setFavorites((data || []).map(f => f.pharmacy_id));
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  }, [user]);

  // Fetch patient requests
  const fetchMyRequests = useCallback(async () => {
    if (!user) {
      setMyRequests([]);
      setRequestsLoading(false);
      return;
    }

    setRequestsLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const { error: expireError } = await supabase
        .from('patient_requests')
        .update({ status: 'expired', updated_at: nowIso })
        .eq('status', 'pending')
        .not('expires_at', 'is', null)
        .lt('expires_at', nowIso);
      if (expireError) {
        console.error('Error expiring patient requests:', expireError);
      }

      // Single query - no .or(), no expires_at filtering
      const { data, error } = await supabase
        .from('patient_requests')
        .select('*')
        .eq('patient_id', user.id)
        .in('status', ['pending', 'accepted', 'cancelled', 'rejected'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      const requests = data || [];

      if (requests.length === 0) {
        setMyRequests([]);
        return;
      }

      const requestIds = requests.map(r => r.id);
      let recipients = [];
      try {
        const { data: recipientData, error: recipientError } = await supabase
          .from('patient_request_recipients')
          .select(`
            request_id,
            status,
            responded_at,
            pharmacy_id,
            pharmacies (name)
          `)
          .in('request_id', requestIds);

        if (recipientError) throw recipientError;
        recipients = recipientData || [];
      } catch (recipientErr) {
        console.error('Error fetching request recipients:', recipientErr);
      }

      const recipientsByRequest = recipients.reduce((acc, recipient) => {
        const key = recipient.request_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push(recipient);
        return acc;
      }, {});

      setMyRequests(
        requests.map(request => ({
          ...request,
          patient_request_recipients: recipientsByRequest[request.id] || []
        }))
      );
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setRequestsLoading(false);
    }
  }, [user, nowTick]);

  // Fetch accepted-cancel monthly usage
  const fetchAcceptedCancelCount = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthStartIso = monthStart.toISOString();

      const { data, error } = await supabase
        .from('patient_requests')
        .select('id', { count: 'exact' })
        .eq('patient_id', user.id)
        .eq('status', 'cancelled')
        .eq('cancelled_by', 'patient')
        .eq('cancel_kind', 'accepted')
        .gte('cancelled_at', monthStartIso);

      if (error) {
        console.error('Error fetching accepted cancel count:', error);
        return;
      }

      setAcceptedCancelCountThisMonth(data?.length || 0);
    } catch (err) {
      console.error('Error fetching accepted cancel count:', err);
    }
  }, [user]);

  // Search medicines
  const searchMedicines = useCallback(async (query) => {
    if (!query.trim()) {
      setMedicines([]);
      return;
    }

    setSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from('medicines')
        .select(`
          *,
          pharmacy_stock (
            pharmacy_id,
            status,
            quantity,
            pharmacies (name, address, phone, latitude, longitude)
          )
        `)
        .ilike('name', `%${query}%`)
        .limit(20);

      if (error) throw error;
      setMedicines(data || []);
    } catch (error) {
      console.error('Error searching medicines:', error);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Toggle favorite
  const toggleFavorite = async (pharmacyId) => {
    if (!user) {
      toast.error(language === 'el' ? 'Συνδεθείτε για αποθήκευση' : 'Sign in to save');
      return;
    }

    const isFavorite = favorites.includes(pharmacyId);

    try {
      if (isFavorite) {
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('pharmacy_id', pharmacyId);
        
        setFavorites(prev => prev.filter(id => id !== pharmacyId));
        toast.success(language === 'el' ? 'Αφαιρέθηκε από αγαπημένα' : 'Removed from favorites');
      } else {
        await supabase
          .from('favorites')
          .insert({ user_id: user.id, pharmacy_id: pharmacyId });
        
        setFavorites(prev => [...prev, pharmacyId]);
        toast.success(language === 'el' ? 'Προστέθηκε στα αγαπημένα' : 'Added to favorites');
      }
    } catch (error) {
      toast.error(t('errorOccurred'));
    }
  };

  // Create patient request
  const sendPatientRequest = async () => {
    if (!user) {
      toast.error(t('requestSignInRequired'));
      return;
    }

    if (!requestMedicine.trim()) {
      toast.error(t('requestMedicineRequired'));
      return;
    }

    setRequestSending(true);
    try {
      const targetPharmacyIds = getTargetPharmacyIds();
      if (targetPharmacyIds.length === 0) {
        toast.error(t('requestNoPharmacies'));
        return;
      }

      const expiresAt = new Date(Date.now() + durationToMinutes(requestDuration) * 60000).toISOString();
      const { data: requestRow, error: requestError } = await supabase
        .from('patient_requests')
        .insert({
          patient_id: user.id,
          medicine_query: requestMedicine.trim(),
          dosage: requestDosage || null,
          form: requestForm || null,
          urgency: requestUrgency || 'normal',
          status: 'pending',
          expires_at: expiresAt
        })
        .select('id')
        .single();

      if (requestError) throw requestError;

      const recipientRows = targetPharmacyIds.map((pharmacyId) => ({
        request_id: requestRow.id,
        pharmacy_id: pharmacyId
      }));

      const { error: recipientsError } = await supabase
        .from('patient_request_recipients')
        .insert(recipientRows);

      if (recipientsError) throw recipientsError;

      toast.success(t('requestSent'));
      setRequestDialogOpen(false);
      setRequestMedicine('');
      setRequestDosage('');
      setRequestForm('');
      setRequestUrgency('normal');
      setRequestDuration('1h');
      await fetchMyRequests();
      setRequestsTab('active');

      const section = document.getElementById('my-requests-section');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
      console.error('Error sending request:', error);
      toast.error(t('errorOccurred'));
    } finally {
      setRequestSending(false);
    }
  };

  const cancelPatientRequest = async (requestId, request) => {
    if (!user || !requestId) return;
    console.log('[cancel] requestId:', requestId, 'type:', typeof requestId);
    console.log('[cancel click] request object:', request);
    console.log('[cancel click] request.id:', request?.id);
    console.log('[cancel click] request.request_id:', request?.request_id);
    setCancelingId(requestId);
    try {
      const { error } = await supabase.rpc('cancel_patient_request', { p_request_id: requestId });

      if (error) {
        console.error('Error cancelling request:', error);
        if (String(error.message).includes('CANCEL_LIMIT_REACHED')) {
          toast.error(language === 'el' 
            ? 'Έχεις φτάσει το όριο ακυρώσεων (3/μήνα) για αποδεκτά αιτήματα.'
            : 'You have reached the cancel limit (3/month) for accepted requests.');
        } else {
          toast.error(language === 'el' 
            ? 'Αποτυχία ακύρωσης αιτήματος.'
            : 'Failed to cancel request.');
        }
        return;
      }

      toast.success(language === 'el' ? 'Το αίτημα ακυρώθηκε.' : 'Request cancelled.');
      fetchMyRequests();
      fetchAcceptedCancelCount();
    } finally {
      setCancelingId(null);
    }
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
        label: language === 'el' ? '\u0391\u03ba\u03c5\u03c1\u03ce\u03b8\u03b7\u03ba\u03b5' : 'Cancelled',
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

  const durationOptions = [
    { value: '30m', label: language === 'el' ? '30 λεπτά' : '30 min' },
    { value: '1h', label: language === 'el' ? '1 ώρα' : '1 hour' },
    { value: '2h', label: language === 'el' ? '2 ώρες' : '2 hours' },
    { value: '3h', label: language === 'el' ? '3 ώρες' : '3 hours' },
    { value: '5h', label: language === 'el' ? '5 ώρες' : '5 hours' }
  ];

  const durationToMinutes = (value) => {
    const map = {
      '30m': 30,
      '1h': 60,
      '2h': 120,
      '3h': 180,
      '5h': 300
    };
    return map[value] || 60;
  };

  const dosageOptions = useMemo(
    () => Array.from({ length: 10 }, (_, index) => `${index + 1}`),
    []
  );

  const formOptions = useMemo(
    () => ([
      { value: 'tablet', label: language === 'el' ? '\u0394\u03b9\u03c3\u03ba\u03af\u03bf' : 'Tablet' },
      { value: 'capsule', label: language === 'el' ? '\u039a\u03ac\u03c8\u03bf\u03c5\u03bb\u03b1' : 'Capsule' },
      { value: 'syrup', label: language === 'el' ? '\u03a3\u03b9\u03c1\u03cc\u03c0\u03b9' : 'Syrup' },
      { value: 'cream', label: language === 'el' ? '\u039a\u03c1\u03ad\u03bc\u03b1' : 'Cream' },
      { value: 'drops', label: language === 'el' ? '\u03a3\u03c4\u03b1\u03b3\u03cc\u03bd\u03b5\u03c2' : 'Drops' },
      { value: 'spray', label: language === 'el' ? 'Spray' : 'Spray' },
      { value: 'injection', label: language === 'el' ? '\u0395\u03bd\u03ad\u03c3\u03b7' : 'Injection' },
      { value: 'other', label: language === 'el' ? '\u0386\u03bb\u03bb\u03bf' : 'Other' }
    ]),
    [language]
  );

  const urgencyOptions = useMemo(
    () => ([
      { value: 'normal', label: language === 'el' ? '\u039a\u03b1\u03bd\u03bf\u03bd\u03b9\u03ba\u03cc' : 'Normal' },
      { value: 'urgent', label: language === 'el' ? '\u0395\u03c0\u03b5\u03af\u03b3\u03bf\u03bd' : 'Urgent' }
    ]),
    [language]
  );

  const formLabelMap = useMemo(
    () => formOptions.reduce((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {}),
    [formOptions]
  );

  const urgencyLabelMap = useMemo(
    () => urgencyOptions.reduce((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {}),
    [urgencyOptions]
  );

  const formatTemplate = (template, values) =>
    template.replace(/\{(\w+)\}/g, (_, key) => (values[key] ?? ''));

  const getRemainingLabel = (expiresAt) => {
    if (!expiresAt) return '';
    const diffMs = new Date(expiresAt).getTime() - nowTick;
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

  const formatPharmacyHours = (hoursValue) => {
    if (!hoursValue || typeof hoursValue !== 'string') return null;
    let parsed;
    try {
      parsed = JSON.parse(hoursValue);
    } catch (err) {
      return hoursValue;
    }
    if (!parsed || typeof parsed !== 'object') return hoursValue;
    const labels = language === 'el'
      ? { mon: '\u0394\u03b5\u03c5', tue: '\u03a4\u03c1\u03b9', wed: '\u03a4\u03b5\u03c4', thu: '\u03a0\u03b5\u03bc', fri: '\u03a0\u03b1\u03c1', sat: '\u03a3\u03b1\u03b2', sun: '\u039a\u03c5\u03c1' }
      : { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
    const closedLabel = language === 'el' ? '\u039a\u03bb\u03b5\u03b9\u03c3\u03c4\u03cc' : 'Closed';
    const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const parts = dayOrder.map((dayKey) => {
      const entry = parsed[dayKey] || {};
      const openValue = typeof entry.open === 'string' ? entry.open : '';
      const closeValue = typeof entry.close === 'string' ? entry.close : '';
      const hasTimes = openValue && closeValue;
      const isClosed = entry.closed === true || !hasTimes;
      const timeValue = isClosed ? closedLabel : `${openValue}-${closeValue}`;
      return `${labels[dayKey]} ${timeValue}`;
    });
    return parts.join(', ');
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
    return new Date(request.expires_at).getTime() < nowTick;
  };

  const getTargetPharmacyIds = () => {
    const target = [];
    const favoriteIds = new Set(favorites || []);
    const pharmacyList = pharmacies || [];
    const eligiblePharmacies = pharmacyList.filter((p) => {
      if (!p?.owner_id) return false;
      if (!p?.is_verified) return false;
      const isOnCall = Boolean(p?.is_on_call);
      const isOpenNow = isPharmacyOpenNow(p?.hours);
      return isOnCall || isOpenNow;
    });
    const seen = new Set();

    eligiblePharmacies.forEach((pharmacy) => {
      if (!pharmacy?.id) return;
      if (!favoriteIds.has(pharmacy.id)) return;
      if (seen.has(pharmacy.id)) return;
      seen.add(pharmacy.id);
      target.push(pharmacy.id);
    });

    eligiblePharmacies.forEach((pharmacy) => {
      if (!pharmacy?.id) return;
      if (favoriteIds.has(pharmacy.id)) return;
      if (seen.has(pharmacy.id)) return;
      seen.add(pharmacy.id);
      target.push(pharmacy.id);
    });

    return target;
  };

  // Client-side derived lists
  const activeRequests = useMemo(() => {
    const now = Date.now();
    return (myRequests || []).filter(request => {
      const isPendingOrAccepted = request.status === 'pending' || request.status === 'accepted';
      const isNotExpired = !request.expires_at || new Date(request.expires_at).getTime() > now;
      return isPendingOrAccepted && isNotExpired;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [myRequests]);

  const historyRequests = useMemo(() => {
    const now = Date.now();
    return (myRequests || []).filter(request => {
      const isCancelledOrRejected = request.status === 'cancelled' || request.status === 'rejected';
      const isTimeExpired = request.expires_at && new Date(request.expires_at).getTime() <= now;
      return isCancelledOrRejected || isTimeExpired;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [myRequests]);

  const visibleRequests = useMemo(() => {
    if (requestsTab === 'active') {
      return activeRequests;
    }
    // History tab: progressive reveal
    return historyRequests.slice(0, historyVisibleCount);
  }, [requestsTab, activeRequests, historyRequests, historyVisibleCount]);

  // Reset historyVisibleCount when switching tabs
  useEffect(() => {
    if (requestsTab === 'history') {
      setHistoryVisibleCount(5);
    }
  }, [requestsTab]);

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Get location on mount
  useEffect(() => {
    getLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update "now" for remaining time display
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Refetch pharmacies when location changes
  useEffect(() => {
    if (userLocation) {
      fetchPharmacies();
    }
  }, [userLocation, fetchPharmacies]);

  // Initial fetch
  useEffect(() => {
    if (authLoading) return;
    const sessionKey = session?.access_token || session?.user?.id || user?.id || 'anon';
    if (initFetchSessionRef.current === sessionKey) return;
    initFetchSessionRef.current = sessionKey;
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchPharmacies(), fetchFavorites(), fetchMyRequests()]);
      await fetchAcceptedCancelCount();
      setLoading(false);
    };
    init();
  }, [authLoading, fetchPharmacies, fetchFavorites, fetchMyRequests, user, session]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchMedicines(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchMedicines]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('pharmacy_stock_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pharmacy_stock' },
        () => {
          fetchPharmacies();
          if (searchQuery) searchMedicines(searchQuery);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPharmacies, searchMedicines, searchQuery]);

  // Subscribe to patient request updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`patient_requests:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patient_requests', filter: `patient_id=eq.${user.id}` },
        () => fetchMyRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchMyRequests]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (language === 'el') {
      if (hour < 12) return 'Καλημέρα';
      if (hour < 18) return 'Καλησπέρα';
      return 'Καλησπέρα';
    }
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getDisplayName = () => {
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

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="patient-dashboard">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-pharma-grey-pale/50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/patient" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-teal flex items-center justify-center">
              <Pill className="w-4 h-4 text-white" />
            </div>
            <span className="font-heading font-bold text-pharma-dark-slate hidden sm:block">
              {t('appName')}
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Link to="/patient/favorites">
              <Button variant="ghost" size="sm" className="rounded-full gap-2 h-9" data-testid="nav-favorites-btn">
                <Heart className="w-4 h-4" />
                {t('favorites')}
              </Button>
            </Link>
            <Link to="/patient/reminders">
              <Button variant="ghost" size="sm" className="rounded-full gap-2 h-9" data-testid="nav-reminders-btn">
                <Clock className="w-4 h-4" />
                {language === 'el' ? 'Υπενθυμίσεις' : 'Reminders'}
              </Button>
            </Link>
            <Link to="/patient/notifications" className="relative">
              <Button variant="ghost" size="sm" className="rounded-full gap-2 h-9" data-testid="nav-notifications-btn">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-pharma-teal text-white text-[10px] rounded-full flex items-center justify-center font-semibold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/patient/settings">
              <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0" data-testid="nav-settings-btn">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              size="sm"
              className="rounded-full h-9 w-9 p-0 text-pharma-slate-grey"
              onClick={handleSignOut}
              data-testid="nav-signout-btn"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-pharma-ice-blue"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="mobile-menu-btn"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-pharma-grey-pale p-3 space-y-1 animate-slide-up">
            <Link to="/patient/favorites" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-lg h-11">
                <Heart className="w-5 h-5" />
                {t('favorites')}
              </Button>
            </Link>
            <Link to="/patient/reminders" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-lg h-11">
                <Clock className="w-5 h-5" />
                {language === 'el' ? 'Υπενθυμίσεις' : 'Reminders'}
              </Button>
            </Link>
            <Link to="/patient/notifications" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-lg h-11">
                <Bell className="w-5 h-5" />
                {t('notifications')}
                {unreadCount > 0 && (
                  <span className="ml-auto bg-pharma-teal text-white text-xs px-2 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/patient/settings" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-lg h-11">
                <Settings className="w-5 h-5" />
                {t('settings')}
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 rounded-lg h-11 text-pharma-slate-grey"
              onClick={handleSignOut}
            >
              <LogOut className="w-5 h-5" />
              {t('signOut')}
            </Button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-5 space-y-6">
        {/* Welcome & Search */}
        <section className="page-enter">
          <div className="mb-5">
            <h1 className="font-heading text-2xl font-bold text-pharma-dark-slate mb-0.5">
              {greeting()}{getDisplayName() ? `, ${getDisplayName().split(' ')[0]}` : ''}!
            </h1>
            <p className="text-pharma-slate-grey text-sm">
              {language === 'el' 
                ? 'Τι φάρμακο ψάχνετε σήμερα;'
                : 'What medicine are you looking for today?'}
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-pharma-slate-grey" />
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-12 pr-4 rounded-xl border-pharma-grey-pale bg-white shadow-sm focus:border-pharma-teal focus:ring-pharma-teal/20 text-base"
              data-testid="medicine-search-input"
            />
          </div>
        </section>

        {/* Request Medicine */}
        <section className="page-enter">
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Send className="w-4 h-4 text-pharma-teal" />
                  <h2 className="font-heading text-lg font-semibold text-pharma-dark-slate">
                    {t('requestMedicineTitle')}
                  </h2>
                </div>
                <p className="text-sm text-pharma-slate-grey">
                  {t('requestMedicineDesc')}
                </p>
              </div>
              <Button
                className="rounded-full gradient-teal text-white gap-2"
                onClick={() => setRequestDialogOpen(true)}
                data-testid="open-request-dialog-btn"
              >
                <Send className="w-4 h-4" />
                {t('sendRequest')}
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* My Requests */}
        <section className="page-enter" id="my-requests-section">
          <div className="flex items-center justify-between gap-2 mb-4">
            <ClipboardList className="w-5 h-5 text-pharma-teal" />
            <h2 className="font-heading text-lg font-semibold text-pharma-dark-slate">
              {t('myRequestsTitle')}
            </h2>
          </div>

          {/* Tabs for Active/History */}
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
          ) : visibleRequests.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t('myRequestsEmpty')}
              description={t('myRequestsEmptyDesc')}
            />
          ) : (
            <>
              <div className="space-y-3">
                {visibleRequests.map((request) => {
                  const expired = isExpiredRequest(request);
                  const statusKey = expired ? 'expired' : request.status;
                  const statusConfig = getRequestStatusConfig(statusKey);
                  const historyStatusLabel = getHistoryStatusLabel(request);
                  const lastResponse = getLastResponse(request.patient_request_recipients);
                  const summary = getRecipientSummary(request.patient_request_recipients);
                  const remainingLabel = getRemainingLabel(request.expires_at);
                  const canCancel = requestsTab === 'active' && !expired && request.status !== 'cancelled';
                  const isHistory = requestsTab === 'history';
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
                                {language === 'el' ? '\u0394\u03bf\u03c3\u03bf\u03bb\u03bf\u03b3\u03af\u03b1' : 'Dosage'}:{' '}
                                {request.dosage || (language === 'el' ? '\u0394\u03b5\u03bd \u03bf\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b5' : 'Not set')}
                              </span>
                              <span className="bg-pharma-ice-blue px-2 py-0.5 rounded-full text-xs">
                                {language === 'el' ? '\u039c\u03bf\u03c1\u03c6\u03ae' : 'Form'}:{' '}
                                {request.form ? (formLabelMap[request.form] || request.form) : (language === 'el' ? '\u0394\u03b5\u03bd \u03bf\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b5' : 'Not set')}
                              </span>
                              <span className="bg-pharma-ice-blue px-2 py-0.5 rounded-full text-xs">
                                {language === 'el' ? '\u0395\u03c0\u03b5\u03af\u03b3\u03bf\u03bd' : 'Urgency'}:{' '}
                                {request.urgency ? (urgencyLabelMap[request.urgency] || request.urgency) : (language === 'el' ? '\u0394\u03b5\u03bd \u03bf\u03c1\u03af\u03c3\u03c4\u03b7\u03ba\u03b5' : 'Not set')}
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
                      </div>
                      {canCancel && (
                        <div className="space-y-2">
                          {/* Helper text for accepted requests */}
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
              })}
              </div>
              {/* Show more/less buttons for History tab */}
              {requestsTab === 'history' && historyRequests.length > 5 && (
                <div className="flex justify-center gap-2 pt-2">
                  {historyVisibleCount > 5 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setHistoryVisibleCount(5)}
                    >
                      {language === 'el' ? 'Εμφάνιση λιγότερων' : 'Show less'}
                    </Button>
                  )}
                  {historyRequests.length > historyVisibleCount && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setHistoryVisibleCount(c => c + 5)}
                    >
                      {language === 'el' ? 'Εμφάνιση περισσότερων' : 'Show more'}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* Search Results */}
        {searchQuery && (
          <section className="page-enter">
            <h2 className="font-heading text-lg font-semibold text-pharma-dark-slate mb-3">
              {language === 'el' ? 'Αποτελέσματα Αναζήτησης' : 'Search Results'}
            </h2>
            
            {searchLoading ? (
              <SkeletonList count={3} CardComponent={SkeletonMedicineCard} />
            ) : medicines.length === 0 ? (
              <EmptyState 
                title={t('noResults')}
                description={language === 'el' 
                  ? 'Δοκιμάστε διαφορετικό όνομα φαρμάκου'
                  : 'Try a different medicine name'}
              />
            ) : (
              <div className="space-y-3">
                {medicines.map((medicine) => (
                  <Card 
                    key={medicine.id}
                    className="gradient-card rounded-xl shadow-sm border border-pharma-grey-pale/50 hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-heading font-semibold text-pharma-dark-slate">
                            {medicine.name}
                          </h3>
                          <p className="text-xs text-pharma-slate-grey">{medicine.description}</p>
                        </div>
                      </div>
                      
                      {medicine.pharmacy_stock?.length > 0 && (
                        <div className="space-y-2 mt-3">
                          <p className="text-xs font-medium text-pharma-charcoal">
                            {language === 'el' ? 'Διαθέσιμο σε:' : 'Available at:'}
                          </p>
                          {medicine.pharmacy_stock.slice(0, 3).map((stock, idx) => (
                            <div 
                              key={idx}
                              className="flex items-center justify-between p-2.5 bg-pharma-ice-blue/50 rounded-lg"
                            >
                              <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-pharma-teal" />
                                <span className="text-sm text-pharma-charcoal">
                                  {stock.pharmacies?.name || 'Pharmacy'}
                                </span>
                              </div>
                              <StatusBadge status={stock.status} size="sm" />
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Nearby Pharmacies */}
        {!searchQuery && (
          <section className="page-enter stagger-1">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <h2 className="font-heading text-lg font-semibold text-pharma-dark-slate">
                  {t('nearbyPharmacies')}
                </h2>
                {!userLocation && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-8 gap-1.5 text-pharma-teal"
                    onClick={getLocation}
                    disabled={locationLoading}
                    data-testid="get-location-btn"
                  >
                    <Locate className="w-4 h-4" />
                    {language === 'el' ? 'Τοποθεσία' : 'Location'}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-pharma-grey-pale overflow-hidden">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 ${viewMode === 'list' ? 'bg-pharma-teal text-white' : 'bg-white text-pharma-slate-grey hover:bg-pharma-ice-blue'}`}
                    data-testid="view-list-btn"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('map')}
                    className={`p-2 ${viewMode === 'map' ? 'bg-pharma-teal text-white' : 'bg-white text-pharma-slate-grey hover:bg-pharma-ice-blue'}`}
                    data-testid="view-map-btn"
                  >
                    <Map className="w-4 h-4" />
                  </button>
                </div>
                <Link to="/patient/pharmacies">
                  <Button variant="ghost" size="sm" className="rounded-full gap-1 text-pharma-teal h-8">
                    {t('viewAll')}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Map View */}
            {viewMode === 'map' && (
              <div className="mb-4">
                <PharmacyMap 
                  pharmacies={pharmacies}
                  userLocation={userLocation}
                  height="350px"
                  className="shadow-md"
                />
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              loading ? (
                <SkeletonList count={3} CardComponent={SkeletonPharmacyCard} />
              ) : pharmacies.length === 0 ? (
                <EmptyState 
                  icon={MapPin}
                  title={language === 'el' ? 'Δεν βρέθηκαν φαρμακεία' : 'No pharmacies found'}
                />
              ) : (
                <div className="space-y-3">
                  {pharmacies.map((pharmacy) => (
                    <Card 
                      key={pharmacy.id}
                      className="gradient-card rounded-xl shadow-sm border border-pharma-grey-pale/50 hover:shadow-md hover:border-pharma-teal/30 transition-all cursor-pointer"
                      data-testid={`pharmacy-card-${pharmacy.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-xl bg-pharma-teal/10 flex items-center justify-center flex-shrink-0">
                            <Pill className="w-6 h-6 text-pharma-teal" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-heading font-semibold text-pharma-dark-slate">
                                  {pharmacy.name}
                                </h3>
                                <div className="flex items-center gap-1.5 text-xs text-pharma-slate-grey mt-0.5">
                                  <MapPin className="w-3.5 h-3.5" />
                                  <span className="truncate">{pharmacy.address}</span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(pharmacy.id);
                                }}
                                className="p-1.5 rounded-full hover:bg-pharma-ice-blue transition-colors"
                                data-testid={`favorite-btn-${pharmacy.id}`}
                              >
                                <Heart 
                                  className={`w-5 h-5 transition-colors ${
                                    favorites.includes(pharmacy.id) 
                                      ? 'fill-pharma-teal text-pharma-teal' 
                                      : 'text-pharma-silver'
                                  }`}
                                />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {pharmacy.is_on_call && <OnCallBadge />}
                              <span className="text-xs font-medium text-pharma-teal bg-pharma-teal/10 px-2 py-0.5 rounded-full">
                                {pharmacy.distance !== null && pharmacy.distance !== undefined
                                  ? formatDistance(pharmacy.distance)
                                  : (language === 'el'
                                    ? '\u0391\u03c0\u03cc\u03c3\u03c4\u03b1\u03c3\u03b7: \u03ac\u03b3\u03bd\u03c9\u03c3\u03c4\u03b7'
                                    : 'Distance: unknown')}
                              </span>
                              <div className="flex items-center gap-1 text-xs text-pharma-slate-grey">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{formatPharmacyHours(pharmacy.hours) || pharmacy.hours || '08:00 - 21:00'}</span>
                              </div>
                            </div>

                            <div className="flex gap-2 mt-3">
                              <a 
                                href={`tel:${pharmacy.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1"
                              >
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="w-full rounded-lg gap-1.5 border-pharma-teal text-pharma-teal hover:bg-pharma-teal/5 h-9"
                                  data-testid={`call-btn-${pharmacy.id}`}
                                >
                                  <Phone className="w-4 h-4" />
                                  {t('callNow')}
                                </Button>
                              </a>
                              <Link 
                                to={`/patient/pharmacy/${pharmacy.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1"
                              >
                                <Button 
                                  size="sm"
                                  className="w-full rounded-lg gap-1.5 gradient-teal text-white h-9"
                                >
                                  <Navigation className="w-4 h-4" />
                                  {t('getDirections')}
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            )}
          </section>
        )}
      </main>

      {/* Request Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-pharma-dark-slate">
              {t('requestMedicineTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {t('requestMedicineLabel')} *
              </label>
              <Input
                value={requestMedicine}
                onChange={(e) => setRequestMedicine(e.target.value)}
                placeholder={t('requestMedicinePlaceholder')}
                className="rounded-xl"
                data-testid="patient-request-medicine-input"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? '\u0394\u03bf\u03c3\u03bf\u03bb\u03bf\u03b3\u03af\u03b1' : 'Dosage'}
              </label>
              <Select value={requestDosage} onValueChange={setRequestDosage}>
                <SelectTrigger className="rounded-xl h-10" data-testid="patient-request-dosage-select">
                  <SelectValue placeholder={language === 'el' ? '\u0395\u03c0\u03b9\u03bb\u03ad\u03be\u03c4\u03b5' : 'Select'} />
                </SelectTrigger>
                <SelectContent>
                  {dosageOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? '\u039c\u03bf\u03c1\u03c6\u03ae' : 'Form'}
              </label>
              <Select value={requestForm} onValueChange={setRequestForm}>
                <SelectTrigger className="rounded-xl h-10" data-testid="patient-request-form-select">
                  <SelectValue placeholder={language === 'el' ? '\u0395\u03c0\u03b9\u03bb\u03ad\u03be\u03c4\u03b5' : 'Select'} />
                </SelectTrigger>
                <SelectContent>
                  {formOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? '\u0395\u03c0\u03b5\u03af\u03b3\u03bf\u03bd' : 'Urgency'}
              </label>
              <Select value={requestUrgency} onValueChange={setRequestUrgency}>
                <SelectTrigger className="rounded-xl h-10" data-testid="patient-request-urgency-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {urgencyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? 'Ενεργό για' : 'Active for'}
              </label>
              <Select value={requestDuration} onValueChange={setRequestDuration}>
                <SelectTrigger className="rounded-xl h-10" data-testid="patient-request-duration-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setRequestDialogOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90"
              onClick={sendPatientRequest}
              disabled={requestSending}
              data-testid="patient-request-submit-btn"
            >
              {requestSending ? t('loading') : t('sendRequest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
