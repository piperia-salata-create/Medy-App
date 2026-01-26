import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeniorMode } from '../../contexts/SeniorModeContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { StatusBadge, OnCallBadge } from '../../components/ui/status-badge';
import { SkeletonPharmacyCard, SkeletonMedicineCard, SkeletonList } from '../../components/ui/skeleton-loaders';
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
  Locate
} from 'lucide-react';

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

  // Fetch pharmacies
  const fetchPharmacies = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .limit(20);

      if (error) throw error;
      
      let pharmacyData = data || [];
      
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

  // Refetch pharmacies when location changes
  useEffect(() => {
    if (userLocation) {
      fetchPharmacies();
    }
  }, [userLocation, fetchPharmacies]);

  // Initial fetch
  useEffect(() => {
    console.log('PatientDashboard init', { user, session, authLoading });
    if (authLoading) return;
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchPharmacies(), fetchFavorites()]);
      setLoading(false);
    };
    init();
  }, [authLoading, fetchPharmacies, fetchFavorites, user, session]);

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
              {greeting()}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
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
                  {pharmacies.slice(0, 5).map((pharmacy) => (
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
                              {pharmacy.distance !== null && pharmacy.distance !== undefined && (
                                <span className="text-xs font-medium text-pharma-teal bg-pharma-teal/10 px-2 py-0.5 rounded-full">
                                  {formatDistance(pharmacy.distance)}
                                </span>
                              )}
                              <div className="flex items-center gap-1 text-xs text-pharma-slate-grey">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{pharmacy.hours || '08:00 - 21:00'}</span>
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
    </div>
  );
}
