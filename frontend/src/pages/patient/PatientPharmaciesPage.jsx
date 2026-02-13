import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import useGeolocation from '../../hooks/useGeolocation';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { SkeletonList, SkeletonPharmacyCard } from '../../components/ui/skeleton-loaders';
import { EmptyState } from '../../components/ui/empty-states';
import { OnCallBadge } from '../../components/ui/status-badge';
import { ArrowLeft, Search, Locate, MapPin, Pill, ChevronRight } from 'lucide-react';

const arePharmaciesEqual = (prevList = [], nextList = []) => {
  if (prevList === nextList) return true;
  if (prevList.length !== nextList.length) return false;

  for (let i = 0; i < prevList.length; i += 1) {
    const prev = prevList[i] || {};
    const next = nextList[i] || {};
    if ((prev.id || '') !== (next.id || '')) return false;
    if ((prev.updated_at || '') !== (next.updated_at || '')) return false;
    if ((prev.name || '') !== (next.name || '')) return false;
    if ((prev.address || '') !== (next.address || '')) return false;
    if (Boolean(prev.is_on_call) !== Boolean(next.is_on_call)) return false;
    if ((prev.distance_km ?? null) !== (next.distance_km ?? null)) return false;
  }

  return true;
};

export default function PatientPharmaciesPage() {
  const { profile, profileStatus } = useAuth();
  const { t, language } = useLanguage();
  const { location: userLocation, loading: locationLoading, getLocation } = useGeolocation();

  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const loadedRef = useRef(false);
  const refreshTimerRef = useRef(null);

  const isProfileReady = profileStatus === 'ready';
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

  const fetchPharmacies = useCallback(async (options = {}) => {
    if (!isProfileReady) return;

    const isInitialLoad = !loadedRef.current;
    if (isInitialLoad) {
      setLoading(true);
    } else if (options?.silent !== true) {
      setRefreshing(true);
    }

    try {
      let nextRows = [];

      if (canQueryNearby) {
        const { data, error } = await supabase.rpc('get_nearby_pharmacies', {
          p_lat: userLocation.lat,
          p_lng: userLocation.lng,
          p_radius_km: radiusKm
        });
        if (error) throw error;
        nextRows = (data || []).map((row) => ({
          ...row,
          distance_km: row.distance_km ?? null
        }));
      } else {
        const { data, error } = await supabase
          .from('pharmacies')
          .select('id,name,address,phone,hours,is_on_call,is_verified,latitude,longitude,updated_at')
          .eq('is_verified', true)
          .order('name', { ascending: true })
          .limit(200);
        if (error) throw error;
        nextRows = (data || []).map((row) => ({
          ...row,
          distance_km: null
        }));
      }

      setPharmacies((prev) => (arePharmaciesEqual(prev, nextRows) ? prev : nextRows));
      loadedRef.current = true;
    } catch (error) {
      console.error('Error loading pharmacies:', error);
      if (!loadedRef.current) {
        setPharmacies([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isProfileReady, canQueryNearby, userLocation?.lat, userLocation?.lng, radiusKm]);

  useEffect(() => {
    loadedRef.current = false;
    setLoading(true);
    setRefreshing(false);
  }, [radiusKm, canQueryNearby]);

  useEffect(() => {
    if (!isProfileReady) return;
    fetchPharmacies();
  }, [isProfileReady, fetchPharmacies]);

  useEffect(() => {
    if (!isProfileReady) return;
    const channel = supabase
      .channel('patient_pharmacies_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pharmacies' },
        () => {
          if (refreshTimerRef.current) return;
          refreshTimerRef.current = setTimeout(() => {
            refreshTimerRef.current = null;
            fetchPharmacies({ silent: false });
          }, 350);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [isProfileReady, fetchPharmacies]);

  const filteredPharmacies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return pharmacies;
    return pharmacies.filter((pharmacy) => {
      const text = [
        pharmacy?.name,
        pharmacy?.address,
        pharmacy?.phone
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return text.includes(query);
    });
  }, [pharmacies, searchQuery]);

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="patient-pharmacies-page">
      <header className="sticky top-0 z-50 glass border-b border-pharma-grey-pale/50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/patient">
              <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="font-heading font-semibold text-pharma-dark-slate">
              {t('nearbyPharmacies')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {!hasLocation && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={getLocation}
                disabled={locationLoading}
              >
                <Locate className="w-4 h-4" />
                {language === 'el' ? 'Τοποθεσία' : 'Location'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => fetchPharmacies()}
              disabled={loading || refreshing}
            >
              {language === 'el' ? 'Ανανέωση' : 'Refresh'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pharma-slate-grey" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'el' ? 'Αναζήτηση φαρμακείου...' : 'Search pharmacies...'}
            className="h-10 pl-9 rounded-xl border-pharma-grey-pale"
            data-testid="patient-pharmacies-search-input"
          />
        </div>

        <div className="min-h-[18px] text-xs text-pharma-slate-grey">
          {refreshing && !loading ? (
            language === 'el' ? 'Γίνεται ενημέρωση φαρμακείων...' : 'Updating pharmacies...'
          ) : (
            <span className="invisible">
              {language === 'el' ? 'Γίνεται ενημέρωση φαρμακείων...' : 'Updating pharmacies...'}
            </span>
          )}
        </div>

        {loading && filteredPharmacies.length === 0 ? (
          <SkeletonList count={4} CardComponent={SkeletonPharmacyCard} />
        ) : filteredPharmacies.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title={searchQuery.trim()
              ? (language === 'el' ? 'Δεν βρέθηκαν φαρμακεία' : 'No pharmacies found')
              : (language === 'el' ? 'Δεν υπάρχουν διαθέσιμα φαρμακεία' : 'No pharmacies available')}
            description={searchQuery.trim()
              ? (language === 'el' ? 'Δοκιμάστε άλλη αναζήτηση.' : 'Try a different search.')
              : (language === 'el' ? 'Ελέγξτε την τοποθεσία ή την ακτίνα αναζήτησης.' : 'Check your location or search radius.')}
          />
        ) : (
          <div className="space-y-3">
            {filteredPharmacies.map((pharmacy) => (
              <Card
                key={pharmacy.id}
                className="gradient-card rounded-xl shadow-sm border border-pharma-grey-pale/50 hover:shadow-md hover:border-pharma-teal/30 transition-all"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-pharma-teal/10 flex items-center justify-center flex-shrink-0">
                      <Pill className="w-5 h-5 text-pharma-teal" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-heading font-semibold text-pharma-dark-slate truncate">
                            {pharmacy.name}
                          </h3>
                          <p className="text-xs text-pharma-slate-grey mt-0.5 line-clamp-2">
                            {pharmacy.address || '-'}
                          </p>
                          {pharmacy.phone && (
                            <p className="text-xs text-pharma-slate-grey mt-0.5">
                              {pharmacy.phone}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          {pharmacy.is_on_call && <OnCallBadge />}
                          {pharmacy.distance_km != null && (
                            <span className="text-xs text-pharma-slate-grey whitespace-nowrap">
                              {Number(pharmacy.distance_km).toFixed(1)} km
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3">
                        <Link to={`/patient/pharmacy/${pharmacy.id}`}>
                          <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                            {language === 'el' ? 'Προβολή φαρμακείου' : 'View pharmacy'}
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
