import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
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
  Phone,
  MapPin,
  Building2,
  Clock,
  Inbox,
  XCircle,
  CheckCircle2,
  Send,
  ArrowRight,
  Package,
  Shield
} from 'lucide-react';

const PharmacistConnectionsCard = lazy(() => import('./PharmacistConnectionsCardLazy'));

const isDev = process.env.NODE_ENV !== 'production';
const DEBUG = localStorage.getItem('DEBUG_LOGS') === '1';

export default function PharmacistDashboardLazy() {
  const { user, profile, signOut, isPharmacist, profileStatus } = useAuth();
  const { language } = useLanguage();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const isProfileReady = profileStatus === 'ready';

  // State
  const [pharmacy, setPharmacy] = useState(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  
  // Connections state
  const [connections, setConnections] = useState({ incoming: 0, outgoing: 0, accepted: 0, recentAccepted: [] });
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  
  // Stock requests state
  const [stockRequests, setStockRequests] = useState({ pending: 0, recent: [] });
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [deferMount, setDeferMount] = useState(false);
  const [showAddressText, setShowAddressText] = useState(false);
  const [lightStageReady, setLightStageReady] = useState(false);
  const canLoadLight = isProfileReady && lightStageReady;
  const canLoadData = isProfileReady && deferMount && lightStageReady;

  // Redirect if not pharmacist
  useEffect(() => {
    if (!isProfileReady) return;
    if (profile && !isPharmacist()) {
      navigate('/patient');
    }
  }, [profile, isPharmacist, navigate, isProfileReady]);

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
    let id;
    if (typeof requestAnimationFrame === 'function') {
      id = requestAnimationFrame(() => setShowAddressText(true));
      return () => cancelAnimationFrame(id);
    }
    id = setTimeout(() => setShowAddressText(true), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!isProfileReady) {
      setLightStageReady(false);
      return;
    }
    const timer = setTimeout(() => setLightStageReady(true), 200);
    return () => clearTimeout(timer);
  }, [isProfileReady]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isProfileReady) return;
    import('../shared/SettingsPage');
    import('../shared/SettingsProfilePage');
  }, [isProfileReady]);

  // Fetch pharmacist's pharmacy
  // TODO: Handle multiple pharmacies - currently using first one
  const fetchPharmacy = useCallback(async () => {
    if (!canLoadLight) return null;
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .eq('owner_id', user.id)
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
  }, [canLoadLight, user]);

  // Fetch connections summary
  const fetchConnections = useCallback(async () => {
    if (!canLoadLight) return;
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('pharmacist_connections')
        .select(`
          *,
          requester:profiles!pharmacist_connections_requester_pharmacist_id_fkey (
            id, full_name, pharmacy_name
          ),
          target:profiles!pharmacist_connections_target_pharmacist_id_fkey (
            id, full_name, pharmacy_name
          )
        `)
        .or(`requester_pharmacist_id.eq.${user.id},target_pharmacist_id.eq.${user.id}`);

      if (error) throw error;

      const all = data || [];
      const incoming = all.filter(c => c.status === 'pending' && c.target_pharmacist_id === user.id).length;
      const outgoing = all.filter(c => c.status === 'pending' && c.requester_pharmacist_id === user.id).length;
      const acceptedList = all.filter(c => c.status === 'accepted');
      
      setConnections({
        incoming,
        outgoing,
        accepted: acceptedList.length,
        recentAccepted: acceptedList.slice(0, 3)
      });
    } catch (error) {
      console.error('Error fetching connections:', error);
    }
  }, [canLoadLight, user]);

  // Fetch stock requests
  const fetchStockRequests = useCallback(async () => {
    if (!canLoadData) return;
    if (!pharmacy) return;
    try {
      const { data, error } = await supabase
        .from('stock_requests')
        .select('*')
        .eq('to_pharmacy_id', pharmacy.id)
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
  }, [canLoadData, pharmacy]);

  // Fetch incoming patient requests
  const fetchIncomingRequests = useCallback(async () => {
    if (!canLoadData) return;
    if (!pharmacy) return;
    setIncomingLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('patient_request_recipients')
        .select(`
          id,
          status,
          responded_at,
          request_id,
          request:patient_requests!patient_request_recipients_request_id_fkey (
            id,
            medicine_query,
            dosage,
            form,
            urgency,
            status,
            created_at,
            expires_at,
            selected_pharmacy_id,
            notes
          )
        `)
        .eq('pharmacy_id', pharmacy.id)
        .eq('status', 'pending')
        .gt('patient_requests.expires_at', nowIso)
        .or(`selected_pharmacy_id.is.null,selected_pharmacy_id.eq.${pharmacy.id}`, { foreignTable: 'patient_requests' })
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (DEBUG && data && data.length > 0) {
        console.log('[PharmacistDashboard] sample recipient row', data[0]);
      }
      const now = Date.now();
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

        if (selectedId && selectedId !== pharmacy.id) return false;

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
      setIncomingRequests(filtered);
    } catch (error) {
      console.error('Error fetching incoming requests:', error);
    } finally {
      setIncomingLoading(false);
    }
  }, [canLoadData, pharmacy]);

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

    setSendingInvite(true);
    try {
      // Find pharmacist by email
      const { data: targetProfile, error: findError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, pharmacy_name')
        .eq('email', inviteEmail.trim().toLowerCase())
        .eq('role', 'pharmacist')
        .maybeSingle();
      if (findError) {
        console.error('Error finding pharmacist by email:', findError);
      }

      if (findError || !targetProfile) {
        toast.error(language === 'el' ? 'Δεν βρέθηκε φαρμακοποιός' : 'Pharmacist not found');
        return;
      }

      if (targetProfile.id === user.id) {
        toast.error(language === 'el' ? 'Δεν μπορείτε να προσκαλέσετε τον εαυτό σας' : 'Cannot invite yourself');
        return;
      }

      // Check for existing connection
      const { data: existing } = await supabase
        .from('pharmacist_connections')
        .select('id, status')
        .or(
          `and(requester_pharmacist_id.eq.${user.id},target_pharmacist_id.eq.${targetProfile.id}),` +
          `and(requester_pharmacist_id.eq.${targetProfile.id},target_pharmacist_id.eq.${user.id})`
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
          requester_pharmacist_id: user.id,
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

      fetchIncomingRequests();
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
      setLoading(true);
      await fetchPharmacy();
      await fetchConnections();
      setLoading(false);
    };
    
    if (user && canLoadLight) {
      loadData();
    }
  }, [user, fetchPharmacy, fetchConnections, canLoadLight]);

  // Fetch stock requests after pharmacy is loaded
  useEffect(() => {
    if (!canLoadData) return;
    if (pharmacy) {
      fetchStockRequests();
      fetchIncomingRequests();
    }
  }, [pharmacy, fetchStockRequests, fetchIncomingRequests, canLoadData]);

  // Realtime subscriptions
  useEffect(() => {
    if (!canLoadData) return;
    if (!user) return;

    const connectionsChannel = supabase
      .channel('pharmacist_connections_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pharmacist_connections' }, fetchConnections)
      .subscribe();

    return () => {
      supabase.removeChannel(connectionsChannel);
    };
  }, [user, fetchConnections, canLoadData]);

  useEffect(() => {
    if (!canLoadData) return;
    if (!pharmacy) return;

    const requestsChannel = supabase
      .channel(`patient_request_recipients:${pharmacy.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patient_request_recipients', filter: `pharmacy_id=eq.${pharmacy.id}` },
        () => fetchIncomingRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
    };
  }, [pharmacy, fetchIncomingRequests, canLoadData]);

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
    const diffMs = new Date(expiresAt).getTime() - nowTick;
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

  const formatHours = (hoursValue) => {
    if (!hoursValue || typeof hoursValue !== 'string') return null;
    const labels = language === 'el'
      ? { mon: 'Δευ', tue: 'Τρι', wed: 'Τετ', thu: 'Πεμ', fri: 'Παρ', sat: 'Σαβ', sun: 'Κυρ' }
      : { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
    const closedLabel = language === 'el' ? 'Κλειστό' : 'Closed';
    const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    let parsed;
    try {
      parsed = JSON.parse(hoursValue);
    } catch (err) {
      return hoursValue;
    }
    if (!parsed || typeof parsed !== 'object') return hoursValue;

    const dayEntries = dayOrder.map((dayKey) => {
      const entry = parsed[dayKey] || {};
      const openValue = typeof entry.open === 'string' ? entry.open : '';
      const closeValue = typeof entry.close === 'string' ? entry.close : '';
      const hasTimes = openValue && closeValue;
      const isClosed = entry.closed === true || !hasTimes;
      return {
        label: labels[dayKey],
        value: isClosed ? closedLabel : `${openValue}–${closeValue}`
      };
    });

    const groups = [];
    dayEntries.forEach((entry, index) => {
      if (groups.length === 0) {
        groups.push({ start: index, end: index, value: entry.value });
        return;
      }
      const last = groups[groups.length - 1];
      if (last.value === entry.value) {
        last.end = index;
      } else {
        groups.push({ start: index, end: index, value: entry.value });
      }
    });

    return groups.map((group) => {
      const startLabel = dayEntries[group.start].label;
      const endLabel = dayEntries[group.end].label;
      const range = group.start === group.end ? startLabel : `${startLabel}–${endLabel}`;
      return `${range} ${group.value}`;
    }).join(', ');
  };

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
              <Button variant="ghost" size="icon" className="rounded-full relative" data-testid="nav-notifications-btn">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-pharma-coral text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {unreadCount}
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
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="bg-white rounded-2xl shadow-card border-pharma-grey-pale animate-pulse">
                <CardContent className="p-6 h-40" />
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-6">
            {/* STATUS CARD - On Duty Toggle */}
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter" data-testid="status-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                  <Clock className="w-5 h-5 text-pharma-teal" />
                  {language === 'el' ? 'Κατάσταση Εφημερίας' : 'Duty Status'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center justify-between">
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

            {/* PHARMACY PROFILE CARD */}
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter" style={{ animationDelay: '0.05s' }} data-testid="pharmacy-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-pharma-royal-blue" />
                  {language === 'el' ? 'Το Φαρμακείο Μου' : 'My Pharmacy'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {pharmacy ? (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-pharma-dark-slate">{pharmacy.name}</p>
                        {pharmacy.is_verified && (
                          <span className="inline-flex items-center gap-1 text-xs text-pharma-sea-green mt-1">
                            <Shield className="w-3 h-3" />
                            {language === 'el' ? 'Επαληθευμένο' : 'Verified'}
                          </span>
                        )}
                      </div>
                    </div>
                    {pharmacy.address && (
                      // This block was LCP; we will defer it.
                      showAddressText ? (
                        <p className="text-sm text-pharma-slate-grey flex items-center gap-2">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          {pharmacy.address}
                        </p>
                      ) : (
                        <div className="flex items-center gap-2 min-h-[20px]">
                          <MapPin className="w-4 h-4 flex-shrink-0 text-pharma-slate-grey/60" />
                          <div className="h-4 w-56 rounded-full bg-pharma-grey-pale/70 animate-pulse" />
                        </div>
                      )
                    )}
                    {pharmacy.phone && (
                      <p className="text-sm text-pharma-slate-grey flex items-center gap-2">
                        <Phone className="w-4 h-4 flex-shrink-0" />
                        {pharmacy.phone}
                      </p>
                    )}
                    {formatHours(pharmacy.hours) && (
                      <p className="text-sm text-pharma-slate-grey flex items-center gap-2">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        {formatHours(pharmacy.hours)}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Link to="/pharmacist/settings">
                        <Button variant="outline" size="sm" className="rounded-full" data-testid="edit-pharmacy-btn">
                          {language === 'el' ? 'Επεξεργασία' : 'Edit Profile'}
                        </Button>
                      </Link>
                      {getMapsUrl(pharmacy) && (
                        <a
                          href={getMapsUrl(pharmacy)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block"
                        >
                          <Button variant="outline" size="sm" className="rounded-full" data-testid="open-maps-btn">
                            {language === 'el' ? 'Άνοιγμα Χάρτη' : 'Open in Maps'}
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-pharma-slate-grey mb-3">
                      {language === 'el' ? 'Δεν έχετε φαρμακείο' : 'No pharmacy registered'}
                    </p>
                    <Link to="/pharmacist/pharmacy/new">
                      <Button className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90" data-testid="add-pharmacy-btn">
                        {language === 'el' ? 'Προσθήκη Φαρμακείου' : 'Add Pharmacy'}
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CONNECTIONS SUMMARY CARD */}
            <Suspense fallback={<div className="h-56 rounded-2xl bg-white/70 shadow-sm animate-pulse" />}>
              <PharmacistConnectionsCard
                connections={connections}
                userId={user?.id}
                language={language}
                onInvite={() => setInviteDialogOpen(true)}
              />
            </Suspense>

            {/* STOCK REQUESTS SUMMARY */}
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter" style={{ animationDelay: '0.15s' }} data-testid="stock-requests-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                  <Package className="w-5 h-5 text-pharma-coral" />
                  {language === 'el' ? 'Αιτήματα Αποθέματος' : 'Stock Requests'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center justify-between mb-4 p-3 bg-pharma-coral/10 rounded-xl">
                  <div>
                    <p className="text-2xl font-bold text-pharma-coral" data-testid="pending-requests-count">
                      {stockRequests.pending}
                    </p>
                    <p className="text-sm text-pharma-slate-grey">
                      {language === 'el' ? 'Εκκρεμή αιτήματα' : 'Pending requests'}
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
                    {language === 'el' ? 'Δεν υπάρχουν εκκρεμή αιτήματα' : 'No pending requests'}
                  </p>
                )}

                <Link to="/pharmacist/inter-pharmacy">
                  <Button variant="outline" className="w-full rounded-full gap-2" data-testid="view-requests-btn">
                    {language === 'el' ? 'Διαχείριση Αιτημάτων' : 'Manage Requests'}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
            </div>

            {/* INCOMING PATIENT REQUESTS */}
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter" style={{ animationDelay: '0.2s' }} data-testid="incoming-patient-requests-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-pharma-teal" />
                  {language === 'el' ? 'Εισερχόμενα Αιτήματα Ασθενών' : 'Incoming Patient Requests'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {!pharmacy ? (
                  <p className="text-sm text-pharma-slate-grey">
                    {language === 'el' ? 'Προσθέστε φαρμακείο για να λαμβάνετε αιτήματα.' : 'Add a pharmacy to receive requests.'}
                  </p>
                ) : incomingLoading ? (
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
                                {language === 'el' ? 'Λήγει:' : 'Expires'} {formatDateTime(req.request?.expires_at)} · {getRemainingLabel(req.request?.expires_at)}
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
