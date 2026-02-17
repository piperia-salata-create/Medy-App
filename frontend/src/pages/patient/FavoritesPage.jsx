import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { StatusBadge, OnCallBadge } from '../../components/ui/status-badge';
import { SkeletonPharmacyCard, SkeletonList } from '../../components/ui/skeleton-loaders';
import { EmptyState } from '../../components/ui/empty-states';
import { formatWeeklyHours } from '../../lib/formatHours';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Heart,
  MapPin,
  Phone,
  Clock,
  Pill,
  Navigation
} from 'lucide-react';

const isDev = process.env.NODE_ENV !== 'production';
const HOURS_DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HOURS_DAY_LABELS = {
  el: {
    mon: '\u0394\u03b5\u03c5',
    tue: '\u03a4\u03c1\u03b9',
    wed: '\u03a4\u03b5\u03c4',
    thu: '\u03a0\u03b5\u03bc',
    fri: '\u03a0\u03b1\u03c1',
    sat: '\u03a3\u03b1\u03b2',
    sun: '\u039a\u03c5\u03c1'
  },
  en: {
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun'
  }
};

const parseHoursSchedule = (hoursValue) => {
  if (!hoursValue) return null;
  let parsed = hoursValue;
  if (typeof hoursValue === 'string') {
    const trimmed = hoursValue.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed;
};

const getFormattedHoursRows = (hoursValue, language) => {
  const parsed = parseHoursSchedule(hoursValue);
  if (!parsed) return [];
  const labels = language === 'el' ? HOURS_DAY_LABELS.el : HOURS_DAY_LABELS.en;

  return HOURS_DAY_ORDER.map((dayKey) => {
    const entry = parsed?.[dayKey] || {};
    const openValue = typeof entry.open === 'string' ? entry.open.trim() : '';
    const closeValue = typeof entry.close === 'string' ? entry.close.trim() : '';
    const isClosed = entry.closed === true || !openValue || !closeValue;
    return {
      dayKey,
      dayLabel: labels[dayKey],
      value: isClosed
        ? (language === 'el' ? '\u039a\u03bb\u03b5\u03b9\u03c3\u03c4\u03cc' : 'Closed')
        : `${openValue} - ${closeValue}`
    };
  });
};

export default function FavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id || null;
  const { t, language } = useLanguage();
  
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  // Fetch favorites with pharmacy details
  const fetchFavorites = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    if (!loadedRef.current) {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select(`
          id,
          pharmacy_id,
          pharmacies (
            id,
            name,
            address,
            phone,
            hours,
            is_on_call
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;
      setFavorites(data || []);
      loadedRef.current = true;
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Remove from favorites
  const removeFavorite = async (favoriteId, pharmacyName) => {
    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('id', favoriteId);

      if (error) throw error;
      
      setFavorites(prev => prev.filter(f => f.id !== favoriteId));
      toast.success(
        language === 'el' 
          ? `${pharmacyName} αφαιρέθηκε από τα αγαπημένα`
          : `${pharmacyName} removed from favorites`
      );
    } catch (error) {
      toast.error(t('errorOccurred'));
    }
  };

  useEffect(() => {
    loadedRef.current = false;
    setLoading(true);
    if (isDev) {
      console.log('FavoritesPage init', { userId, authLoading });
    }
    if (authLoading) return;
    fetchFavorites();
  }, [authLoading, fetchFavorites, userId]);

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="favorites-page">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/patient">
            <Button variant="ghost" size="sm" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-pharma-teal" />
            <h1 className="font-heading font-semibold text-pharma-dark-slate">
              {t('favorites')}
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <SkeletonList count={3} CardComponent={SkeletonPharmacyCard} />
        ) : favorites.length === 0 ? (
          <EmptyState
            icon={Heart}
            title={language === 'el' ? 'Δεν έχετε αγαπημένα' : 'No favorites yet'}
            description={language === 'el' 
              ? 'Προσθέστε φαρμακεία στα αγαπημένα σας για γρήγορη πρόσβαση'
              : 'Add pharmacies to your favorites for quick access'}
            actionLabel={language === 'el' ? 'Αναζήτηση Φαρμακείων' : 'Browse Pharmacies'}
            action={() => window.location.href = '/patient/pharmacies'}
          />
        ) : (
          <div className="space-y-4 page-enter">
            {favorites.map((favorite) => {
              const hoursLabel = formatWeeklyHours(favorite.pharmacies?.hours, language);
              const formattedHoursRows = getFormattedHoursRows(favorite.pharmacies?.hours, language);
              return (
              <Card 
                key={favorite.id}
                className="bg-white rounded-2xl shadow-card border-pharma-grey-pale hover:shadow-card-hover transition-all"
                data-testid={`favorite-card-${favorite.id}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-pharma-ice-blue flex items-center justify-center flex-shrink-0">
                      <Pill className="w-7 h-7 text-pharma-teal" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-heading font-semibold text-pharma-dark-slate text-lg">
                            {favorite.pharmacies?.name}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-pharma-slate-grey mt-1">
                            <MapPin className="w-4 h-4" />
                            <span className="truncate">{favorite.pharmacies?.address}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFavorite(favorite.id, favorite.pharmacies?.name)}
                          className="p-2 rounded-full hover:bg-pharma-ice-blue transition-colors"
                          data-testid={`remove-favorite-${favorite.id}`}
                        >
                          <Heart className="w-5 h-5 fill-pharma-teal text-pharma-teal" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {favorite.pharmacies?.is_on_call && <OnCallBadge />}
                        {favorite.pharmacies?.hours && (
                          <div className="flex items-start gap-2 text-sm text-pharma-slate-grey">
                            <Clock className="w-4 h-4 mt-0.5" />
                            <div className="flex-1">
                              {formattedHoursRows.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                                  {formattedHoursRows.map((row) => (
                                    <div key={row.dayKey} className="flex items-center justify-between rounded-lg border border-pharma-grey-pale/70 bg-pharma-ice-blue/40 px-2.5 py-1.5 text-sm">
                                      <span className="font-medium text-pharma-dark-slate">{row.dayLabel}</span>
                                      <span className="text-pharma-charcoal">{row.value}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="line-clamp-2 break-words">{hoursLabel}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 mt-4">
                        <a 
                          href={`tel:${favorite.pharmacies?.phone}`}
                          className="flex-1"
                        >
                          <Button 
                            variant="outline" 
                            className="w-full rounded-full gap-2 border-pharma-teal text-pharma-teal hover:bg-pharma-teal/5"
                          >
                            <Phone className="w-4 h-4" />
                            {t('callNow')}
                          </Button>
                        </a>
                        <Link 
                          to={`/patient/pharmacy/${favorite.pharmacies?.id}`}
                          className="flex-1"
                        >
                          <Button className="w-full rounded-full gap-2 bg-pharma-teal hover:bg-pharma-teal/90 text-white">
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
        )}
      </main>
    </div>
  );
}
