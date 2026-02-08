import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeniorMode } from '../../contexts/SeniorModeContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import { findPharmacyIdsByProductQuery, getProductSuggestionLabel } from '../../lib/inventory/searchInventory';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { OnCallBadge } from '../../components/ui/status-badge';
import { SkeletonPharmacyCard, SkeletonList, SkeletonCard } from '../../components/ui/skeleton-loaders';
import { EmptyState } from '../../components/ui/empty-states';
import useGeolocation from '../../hooks/useGeolocation';
import { formatDistance } from '../../lib/geoUtils';
import { formatWeeklyHours } from '../../lib/formatHours';
import { toast } from 'sonner';
import { 
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
  Search,
  Send
} from 'lucide-react';

const PharmacyMap = lazy(() => import('../../components/ui/pharmacy-map').then((mod) => ({
  default: mod.PharmacyMap || mod.default
})));
const PatientRequestsList = lazy(() => import('./PatientRequestsListLazy').then((mod) => ({
  default: mod.default || mod.PatientRequestsListLazy
})));

const isDev = process.env.NODE_ENV !== 'production';

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

export default function PatientDashboardLazy() {
  const { user, session, loading: authLoading, profile, signOut, profileStatus } = useAuth();
  const { t, language } = useLanguage();
  const { seniorMode } = useSeniorMode();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const { location: userLocation, loading: locationLoading, getLocation } = useGeolocation();
  const isProfileReady = profileStatus === 'ready';

  const [pharmacies, setPharmacies] = useState([]);
  const [nearbyPharmacies, setNearbyPharmacies] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [inventoryMatchPharmacyIds, setInventoryMatchPharmacyIds] = useState([]);
  const [inventoryProductSuggestions, setInventoryProductSuggestions] = useState([]);
  const [inventorySearchLoading, setInventorySearchLoading] = useState(false);
  const [inventoryRefreshTick, setInventoryRefreshTick] = useState(0);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestMedicine, setRequestMedicine] = useState('');
  const [requestDosage, setRequestDosage] = useState('');
  const [requestForm, setRequestForm] = useState('');
  const [requestUrgency, setRequestUrgency] = useState('normal');
  const [requestDuration, setRequestDuration] = useState('1h');
  const [requestSending, setRequestSending] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);
  const [choosingPharmacyId, setChoosingPharmacyId] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [acceptedCancelCountThisMonth, setAcceptedCancelCountThisMonth] = useState(0);
  const remainingAcceptedCancels = Math.max(0, 3 - acceptedCancelCountThisMonth);
  const initFetchSessionRef = useRef(null);
  const initLightFetchSessionRef = useRef(null);
  const [deferMount, setDeferMount] = useState(false);
  const [lightStageReady, setLightStageReady] = useState(false);
  const canLoadLight = isProfileReady && lightStageReady;
  const canLoadData = isProfileReady && deferMount && lightStageReady;
  const radiusKm = useMemo(() => {
    const raw =
      profile?.nearby_radius_km ??
      profile?.radius_km ??
      profile?.search_radius_km ??
      profile?.distance_radius_km ??
      null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [profile]);
  const hasLocation = Number.isFinite(userLocation?.lat) && Number.isFinite(userLocation?.lng);
  const hasRadius = Number.isFinite(radiusKm) && radiusKm > 0;
  const canQueryNearby = hasLocation && hasRadius;
  const nearbyPharmacyIds = useMemo(
    () => (nearbyPharmacies || []).map((pharmacy) => pharmacy?.id).filter(Boolean),
    [nearbyPharmacies]
  );

  // Fetch pharmacies
  const fetchPharmacies = useCallback(async () => {
    if (!canLoadData) return;
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*');

      if (error) throw error;
      
      setPharmacies(data || []);
    } catch (error) {
      console.error('Error fetching pharmacies:', error);
    }
  }, [canLoadData]);

  const fetchNearbyPharmacies = useCallback(async () => {
    if (!canLoadData) return;
    if (!canQueryNearby) {
      setNearbyPharmacies([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('get_nearby_pharmacies', {
          p_lat: userLocation.lat,
          p_lng: userLocation.lng,
          p_radius_km: radiusKm
        });

      if (error) throw error;

      const pharmacyData = (data || []).map((row) => ({
        ...row,
        distance: row.distance_km
      }));
      if (isDev) {
        console.log('[PatientDashboard] nearby pharmacies fetch', {
          userCoords: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
          radius: radiusKm,
          count: pharmacyData.length
        });
        console.log('[PatientDashboard] nearby list count', pharmacyData.length);
      }

      setNearbyPharmacies(pharmacyData);
    } catch (error) {
      console.error('Error fetching nearby pharmacies:', error);
      setNearbyPharmacies([]);
    } finally {
      setLoading(false);
    }
  }, [canLoadData, canQueryNearby, radiusKm, userLocation]);

  // Fetch user favorites
  const fetchFavorites = useCallback(async () => {
    if (!canLoadLight) return;
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
  }, [canLoadLight, user]);

  // Fetch patient requests
  const fetchMyRequests = useCallback(async () => {
    if (!canLoadData) return;
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
        .in('status', ['pending', 'accepted', 'cancelled', 'rejected', 'expired', 'executed', 'closed'])
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
            pharmacies (id, name, address, phone, latitude, longitude)
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
  }, [canLoadData, user]);

  // Fetch accepted-cancel monthly usage
  const fetchAcceptedCancelCount = useCallback(async () => {
    if (!canLoadLight) return;
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
  }, [canLoadLight, user]);


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
      if (!canQueryNearby) {
        toast.error(t('requestNoPharmacies'));
        return;
      }

      const nearbyList = nearbyPharmacies || [];
      if (isDev) {
        console.log('[PatientDashboard] submit nearby count', nearbyList.length);
      }

      const nearbyIds = new Set(nearbyList.map((pharmacy) => pharmacy?.id).filter(Boolean));
      const nearbyFullList = (pharmacies || []).filter((pharmacy) => nearbyIds.has(pharmacy?.id));
      const targetPharmacyIds = getTargetPharmacyIds(nearbyFullList);
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
    if (isDev) {
      console.log('[cancel] requestId:', requestId, 'type:', typeof requestId);
      console.log('[cancel click] request object:', request);
      console.log('[cancel click] request.id:', request?.id);
      console.log('[cancel click] request.request_id:', request?.request_id);
    }
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

  const choosePharmacyForRequest = async (requestId, pharmacyId) => {
    if (!user || !requestId || !pharmacyId) return;
    const actionId = `${requestId}:${pharmacyId}`;
    setChoosingPharmacyId(actionId);
    try {
      const { error } = await supabase
        .from('patient_requests')
        .update({
          selected_pharmacy_id: pharmacyId,
          selected_at: new Date().toISOString()
        })
        .eq('id', requestId)
        .select('*')
        .single();

      if (error) {
        console.error('Error choosing pharmacy:', error);
        toast.error(t('errorOccurred'));
        return;
      }

      toast.success(language === 'el'
        ? 'Το φαρμακείο επιλέχθηκε.'
        : 'Pharmacy selected.');
      await fetchMyRequests();
    } finally {
      setChoosingPharmacyId(null);
    }
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

  const formatPharmacyHours = (hoursValue) => formatWeeklyHours(hoursValue);

  const filteredNearbyPharmacies = useMemo(() => {
    const query = inventorySearchQuery.trim();
    if (query.length < 2) return nearbyPharmacies;
    const matchSet = new Set(inventoryMatchPharmacyIds);
    return nearbyPharmacies.filter((pharmacy) => matchSet.has(pharmacy?.id));
  }, [nearbyPharmacies, inventorySearchQuery, inventoryMatchPharmacyIds]);

  const getTargetPharmacyIds = (pharmacyList = []) => {
    const target = [];
    const favoriteIds = new Set(favorites || []);
    const eligiblePharmacies = (pharmacyList || []).filter((p) => {
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

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  useEffect(() => {
    const id = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => setDeferMount(true))
      : setTimeout(() => setDeferMount(true), 0);
    return () => {
      if (typeof id === 'number') {
        clearTimeout(id);
      } else if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(id);
      }
    };
  }, []);

  useEffect(() => {
    if (!isProfileReady) {
      setLightStageReady(false);
      return;
    }
    const timer = setTimeout(() => setLightStageReady(true), 200);
    return () => clearTimeout(timer);
  }, [isProfileReady]);

  // Get location on mount
  useEffect(() => {
    if (!deferMount) return;
    getLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferMount]);

  // Refetch pharmacies when location changes
  useEffect(() => {
    if (!canLoadData) return;
    if (userLocation) {
      fetchNearbyPharmacies();
    }
  }, [canLoadData, userLocation, fetchNearbyPharmacies]);

  // Light prefetch
  useEffect(() => {
    if (!canLoadLight) return;
    if (authLoading) return;
    const sessionKey = session?.access_token || session?.user?.id || user?.id || 'anon';
    if (initLightFetchSessionRef.current === sessionKey) return;
    initLightFetchSessionRef.current = sessionKey;
    const init = async () => {
      await Promise.all([fetchFavorites(), fetchAcceptedCancelCount()]);
    };
    init();
  }, [authLoading, fetchFavorites, fetchAcceptedCancelCount, user, session, canLoadLight]);

  // Initial fetch
  useEffect(() => {
    if (!canLoadData) return;
    if (authLoading) return;
    const sessionKey = session?.access_token || session?.user?.id || user?.id || 'anon';
    if (initFetchSessionRef.current === sessionKey) return;
    initFetchSessionRef.current = sessionKey;
  const init = async () => {
      await Promise.all([fetchPharmacies(), fetchNearbyPharmacies(), fetchMyRequests()]);
    };
    init();
  }, [authLoading, fetchPharmacies, fetchNearbyPharmacies, fetchMyRequests, user, session, canLoadData]);

  useEffect(() => {
    if (!canLoadData) return;
    if (!canQueryNearby) return;
    fetchNearbyPharmacies();
  }, [canLoadData, canQueryNearby, fetchNearbyPharmacies, userLocation, radiusKm]);

  useEffect(() => {
    const query = inventorySearchQuery.trim();
    if (!canQueryNearby || query.length < 2 || nearbyPharmacyIds.length === 0) {
      setInventoryMatchPharmacyIds([]);
      setInventoryProductSuggestions([]);
      setInventorySearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setInventorySearchLoading(true);
      try {
        const result = await findPharmacyIdsByProductQuery({
          query,
          pharmacyIds: nearbyPharmacyIds,
          associationStatus: 'active'
        });
        if (!cancelled) {
          setInventoryMatchPharmacyIds(result?.pharmacyIds || []);
          setInventoryProductSuggestions((result?.products || []).slice(0, 6));
        }
      } catch (error) {
        console.error('Patient inventory search failed:', error);
        if (!cancelled) {
          setInventoryMatchPharmacyIds([]);
          setInventoryProductSuggestions([]);
        }
      } finally {
        if (!cancelled) setInventorySearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inventorySearchQuery, nearbyPharmacyIds, canQueryNearby, inventoryRefreshTick]);

  useEffect(() => {
    if (!canLoadData) return;
    const inventoryChannel = supabase
      .channel('patient_inventory_search')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pharmacy_inventory' },
        () => setInventoryRefreshTick((tick) => tick + 1)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_catalog' },
        () => setInventoryRefreshTick((tick) => tick + 1)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(inventoryChannel);
    };
  }, [canLoadData]);

  // Subscribe to patient request updates
  useEffect(() => {
    if (!canLoadData) return;
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
  }, [user, fetchMyRequests, canLoadData]);

  if (!isProfileReady || !deferMount) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue p-4 space-y-4">
        <div className="h-8 w-44 bg-white rounded-xl shadow-sm animate-pulse" />
        <SkeletonList count={3} />
        <SkeletonCard />
      </div>
    );
  }

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

  const getHonorificLabel = () => {
    const rawHonorific =
      profile?.honorific ||
      session?.user?.user_metadata?.honorific ||
      user?.user_metadata?.honorific ||
      '';
    if (!rawHonorific) return '';
    if (language === 'el') {
      return rawHonorific === 'mr' ? 'Κ.' : 'Κα.';
    }
    return rawHonorific === 'mr' ? 'Mr.' : 'Ms.';
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
              {(() => {
                const displayName = getDisplayName();
                const honorific = getHonorificLabel();
                const firstName = displayName ? displayName.split(' ')[0] : '';
                const nameLabel = firstName
                  ? `${honorific ? `${honorific} ` : ''}${firstName}`
                  : '';
                return `${greeting()}${nameLabel ? `, ${nameLabel}` : ''}!`;
              })()}
            </h1>
            <p className="text-pharma-slate-grey text-sm">
              {language === 'el' 
                ? 'Τι φάρμακο ψάχνετε σήμερα;'
                : 'What medicine are you looking for today?'}
            </p>
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
        <Suspense fallback={<SkeletonList count={2} CardComponent={SkeletonCard} />}>
          <PatientRequestsList
            requests={myRequests}
            requestsLoading={requestsLoading}
            remainingAcceptedCancels={remainingAcceptedCancels}
            cancelPatientRequest={cancelPatientRequest}
            cancelingId={cancelingId}
            choosePharmacyForRequest={choosePharmacyForRequest}
            choosingPharmacyId={choosingPharmacyId}
            userLocation={userLocation}
          />
        </Suspense>

        {/* Nearby Pharmacies */}
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

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pharma-slate-grey" />
              <Input
                value={inventorySearchQuery}
                onChange={(e) => setInventorySearchQuery(e.target.value)}
                placeholder={language === 'el' ? 'Αναζήτηση προϊόντος καταλόγου...' : 'Search catalog product...'}
                className="h-10 pl-9 rounded-xl border-pharma-grey-pale"
                data-testid="patient-inventory-search-input"
              />
            </div>
            {inventorySearchQuery.trim().length >= 2 && inventoryProductSuggestions.length > 0 && (
              <div className="mb-3 rounded-xl border border-pharma-grey-pale bg-white p-2">
                <p className="mb-1 text-xs text-pharma-slate-grey">
                  {language === 'el' ? 'Προτάσεις προϊόντων' : 'Product suggestions'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {inventoryProductSuggestions.map((product) => {
                    const label = getProductSuggestionLabel(product, language);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        className="rounded-full border border-pharma-grey-pale bg-pharma-ice-blue px-3 py-1 text-xs text-pharma-charcoal hover:border-pharma-teal/40"
                        onClick={() => setInventorySearchQuery(label)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {inventorySearchQuery.trim().length >= 2 && (
              <p className="text-xs text-pharma-slate-grey mb-3">
                {inventorySearchLoading
                  ? (language === 'el' ? 'Αναζήτηση συσχετίσεων προϊόντων...' : 'Searching product associations...')
                  : (filteredNearbyPharmacies.length > 0
                    ? (language === 'el'
                      ? `Βρέθηκαν ${filteredNearbyPharmacies.length} κοντινά φαρμακεία που το διαχειρίζονται.`
                      : `Found ${filteredNearbyPharmacies.length} nearby pharmacies associated with this product.`)
                    : (language === 'el'
                      ? 'Δεν βρέθηκαν κοντινά συσχετισμένα φαρμακεία για αυτό το προϊόν.'
                      : 'No nearby associated pharmacies found for this product.'))}
              </p>
            )}

            {!canQueryNearby ? (
              <EmptyState
                icon={MapPin}
                title={
                  !hasLocation
                    ? (language === 'el' ? 'Απαιτείται τοποθεσία' : 'Location required')
                    : (language === 'el' ? 'Ορίστε ακτίνα αναζήτησης' : 'Set search radius')
                }
                description={
                  !hasLocation
                    ? (language === 'el'
                      ? 'Ενεργοποιήστε την τοποθεσία για να δείτε κοντινά φαρμακεία.'
                      : 'Enable location to see nearby pharmacies.')
                    : (language === 'el'
                      ? 'Ορίστε την ακτίνα αναζήτησης για να εμφανιστούν κοντινά φαρμακεία.'
                      : 'Set your search radius to see nearby pharmacies.')
                }
                action={
                  !hasLocation
                    ? getLocation
                    : () => navigate('/patient/settings')
                }
                actionLabel={
                  !hasLocation
                    ? (language === 'el' ? 'Χρήση τοποθεσίας' : 'Use location')
                    : (language === 'el' ? 'Ρυθμίσεις' : 'Settings')
                }
              />
            ) : (
              <>
                {/* Map View */}
                {viewMode === 'map' && (
                  <Suspense fallback={<div className="mb-4 h-[350px] w-full rounded-2xl bg-white/70 shadow-sm animate-pulse" />}>
                    <div className="mb-4">
                      <PharmacyMap 
                        pharmacies={filteredNearbyPharmacies}
                        userLocation={userLocation}
                        height="350px"
                        className="shadow-md"
                      />
                    </div>
                  </Suspense>
                )}

                {/* List View */}
                {viewMode === 'list' && (
                  loading ? (
                    <SkeletonList count={3} CardComponent={SkeletonPharmacyCard} />
                  ) : filteredNearbyPharmacies.length === 0 ? (
                    <EmptyState 
                      icon={MapPin}
                      title={inventorySearchQuery.trim().length >= 2
                        ? (language === 'el' ? 'Δεν βρέθηκαν φαρμακεία με αυτό το προϊόν.' : 'No pharmacies found for this product.')
                        : (language === 'el' ? 'Δεν βρέθηκαν κοντινά φαρμακεία.' : 'No nearby pharmacies found.')}
                    />
                  ) : (
                    <div className="space-y-3">
                      {filteredNearbyPharmacies.map((pharmacy) => {
                        const hoursLabel = formatPharmacyHours(pharmacy.hours);
                        const distanceKm = pharmacy.distance_km ?? pharmacy.distance;
                        return (
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
                                <div className="flex items-start justify-between gap-2 min-w-0">
                                  <div className="min-w-0">
                                    <h3 className="font-heading font-semibold text-pharma-dark-slate truncate">
                                      {pharmacy.name}
                                    </h3>
                                    <div className="flex items-start gap-1.5 text-xs text-pharma-slate-grey mt-0.5 min-w-0">
                                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                      <span className="line-clamp-2 break-words overflow-hidden">
                                        {pharmacy.address}
                                      </span>
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
                                    {distanceKm !== null && distanceKm !== undefined
                                      ? formatDistance(distanceKm)
                                      : '\u2014'}
                                  </span>
                                  {hoursLabel && (
                                    <div className="flex items-center gap-1 text-xs text-pharma-slate-grey">
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>{hoursLabel}</span>
                                    </div>
                                  )}
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
                        );
                      })}
                    </div>
                  )
                )}
              </>
            )}
          </section>
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
