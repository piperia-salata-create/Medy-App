import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeniorMode } from '../../contexts/SeniorModeContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { OnCallBadge, VerifiedBadge } from '../../components/ui/status-badge';
import { Skeleton } from '../../components/ui/skeleton-loaders';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Heart,
  MapPin,
  Phone,
  Clock,
  Pill,
  Navigation,
  Calendar,
  ExternalLink
} from 'lucide-react';

const isDev = process.env.NODE_ENV !== 'production';

const areCatalogProductsEqual = (prevList = [], nextList = []) => {
  if (prevList === nextList) return true;
  if (prevList.length !== nextList.length) return false;

  for (let i = 0; i < prevList.length; i += 1) {
    const prev = prevList[i] || {};
    const next = nextList[i] || {};
    const prevProduct = prev.product || {};
    const nextProduct = next.product || {};

    if ((prev.pharmacy_id || '') !== (next.pharmacy_id || '')) return false;
    if ((prev.product_id || '') !== (next.product_id || '')) return false;
    if ((prevProduct.id || '') !== (nextProduct.id || '')) return false;
    if ((prevProduct.category || '') !== (nextProduct.category || '')) return false;
    if ((prevProduct.name_el || '') !== (nextProduct.name_el || '')) return false;
    if ((prevProduct.name_en || '') !== (nextProduct.name_en || '')) return false;
    if ((prevProduct.brand || '') !== (nextProduct.brand || '')) return false;
    if ((prevProduct.strength || '') !== (nextProduct.strength || '')) return false;
    if ((prevProduct.form || '') !== (nextProduct.form || '')) return false;
  }

  return true;
};

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

export default function PharmacyDetailPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id || null;
  const { t, language } = useLanguage();
  const { seniorMode } = useSeniorMode();
  
  const [pharmacy, setPharmacy] = useState(null);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);
  const formattedHoursRows = useMemo(
    () => getFormattedHoursRows(pharmacy?.hours, language),
    [pharmacy?.hours, language]
  );

  useEffect(() => {
    loadedRef.current = false;
    setLoading(true);
  }, [id, userId]);

  // Fetch pharmacy details
  useEffect(() => {
    if (isDev) {
      console.log('PharmacyDetailPage init', { userId, authLoading });
    }
    if (authLoading) return;
    const fetchPharmacy = async () => {
      if (!loadedRef.current) {
        setLoading(true);
      }
      try {
        // Fetch pharmacy
        const { data: pharmacyData, error: pharmacyError } = await supabase
          .from('pharmacies')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (pharmacyError) throw pharmacyError;
        if (!pharmacyData) {
          setPharmacy(null);
          setCatalogProducts((prev) => (prev.length === 0 ? prev : []));
          return;
        }

        if (pharmacyError) throw pharmacyError;
        setPharmacy(pharmacyData);

        // Fetch declared catalog associations for this pharmacy
        const { data: inventoryRows, error: inventoryError } = await supabase
          .schema('app_public')
          .from('pharmacy_inventory_public')
          .select('pharmacy_id, product_id')
          .eq('pharmacy_id', id)
          .order('product_id', { ascending: true });

        if (!inventoryError) {
          const productIds = Array.from(
            new Set((inventoryRows || []).map((row) => row?.product_id).filter(Boolean))
          );

          if (productIds.length > 0) {
            const { data: productRows, error: productError } = await supabase
              .schema('app_public')
              .from('catalog')
              .select('id, category, name_el, name_en, brand, strength, form')
              .in('id', productIds);

            if (!productError) {
              const productsById = new Map((productRows || []).map((row) => [row.id, row]));
              const mergedRows = (inventoryRows || []).map((row) => ({
                ...row,
                product: productsById.get(row.product_id) || null
              }));
              setCatalogProducts((prev) => (areCatalogProductsEqual(prev, mergedRows) ? prev : mergedRows));
            }
          } else {
            setCatalogProducts((prev) => (prev.length === 0 ? prev : []));
          }
        }

        // Check if favorite
        if (userId) {
          const { data: favoriteData, error: favoriteError } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', userId)
            .eq('pharmacy_id', id)
            .maybeSingle();

          if (favoriteError) throw favoriteError;

          setIsFavorite(!!favoriteData);
        } else {
          setIsFavorite(false);
        }
      } catch (error) {
        console.error('Error fetching pharmacy:', error);
      } finally {
        loadedRef.current = true;
        setLoading(false);
      }
    };

    fetchPharmacy();
  }, [authLoading, id, userId]);

  // Toggle favorite
  const toggleFavorite = async () => {
    if (!userId) {
      toast.error(language === 'el' ? 'Συνδεθείτε για αποθήκευση' : 'Sign in to save');
      return;
    }

    try {
      if (isFavorite) {
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('pharmacy_id', id);
        
        setIsFavorite(false);
        toast.success(language === 'el' ? 'Αφαιρέθηκε από αγαπημένα' : 'Removed from favorites');
      } else {
        await supabase
          .from('favorites')
          .insert({ user_id: userId, pharmacy_id: id });
        
        setIsFavorite(true);
        toast.success(language === 'el' ? 'Προστέθηκε στα αγαπημένα' : 'Added to favorites');
      }
    } catch (error) {
      toast.error(t('errorOccurred'));
    }
  };

  // Open in maps
  const openInMaps = () => {
    if (pharmacy?.address) {
      const encodedAddress = encodeURIComponent(pharmacy.address);
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue">
        <header className="sticky top-0 z-50 bg-white border-b border-pharma-grey-pale">
          <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-4">
            <Link to="/patient">
              <Button variant="ghost" size="sm" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <Skeleton className="h-6 w-48" />
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </main>
      </div>
    );
  }

  if (!pharmacy) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue flex items-center justify-center">
        <div className="text-center">
          <p className="text-pharma-slate-grey mb-4">
            {language === 'el' ? 'Φαρμακείο δεν βρέθηκε' : 'Pharmacy not found'}
          </p>
          <Link to="/patient">
            <Button className="rounded-full">
              {t('back')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="pharmacy-detail-page">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/patient">
              <Button variant="ghost" size="sm" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="font-heading font-semibold text-pharma-dark-slate truncate">
              {pharmacy.name}
            </h1>
          </div>
          <button
            onClick={toggleFavorite}
            className="p-2 rounded-full hover:bg-pharma-ice-blue transition-colors"
            data-testid="favorite-toggle-btn"
          >
            <Heart className={`w-6 h-6 transition-colors ${
              isFavorite 
                ? 'fill-pharma-teal text-pharma-teal' 
                : 'text-pharma-silver'
            }`} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Pharmacy Info Card */}
        <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale overflow-hidden page-enter">
          <CardContent className="p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-20 h-20 rounded-2xl bg-pharma-ice-blue flex items-center justify-center flex-shrink-0">
                <Pill className="w-10 h-10 text-pharma-teal" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-pharma-dark-slate text-2xl mb-1">
                  {pharmacy.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {pharmacy.is_on_call && <OnCallBadge />}
                  {pharmacy.is_verified && <VerifiedBadge />}
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-pharma-teal mt-0.5" />
                <div>
                  <p className="text-pharma-charcoal">{pharmacy.address}</p>
                  <button 
                    onClick={openInMaps}
                    className="text-sm text-pharma-teal hover:underline flex items-center gap-1 mt-1"
                  >
                    {t('getDirections')}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
              
              {pharmacy.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-pharma-teal" />
                  <a 
                    href={`tel:${pharmacy.phone}`}
                    className="text-pharma-charcoal hover:text-pharma-teal"
                  >
                    {pharmacy.phone}
                  </a>
                </div>
              )}
              
              {pharmacy.hours && (
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-pharma-teal mt-0.5" />
                  <div className="flex-1">
                    {formattedHoursRows.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        {formattedHoursRows.map((row) => (
                          <div key={row.dayKey} className="flex items-center justify-between rounded-lg border border-pharma-grey-pale/70 bg-pharma-ice-blue/40 px-2.5 py-1.5 text-sm">
                            <span className="font-medium text-pharma-dark-slate">{row.dayLabel}</span>
                            <span className="text-pharma-charcoal">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-pharma-charcoal break-words">{String(pharmacy.hours)}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <a href={`tel:${pharmacy.phone}`} className="flex-1">
                <Button 
                  size={seniorMode ? 'lg' : 'default'}
                  className="w-full rounded-full bg-pharma-teal hover:bg-pharma-teal/90 text-white gap-2"
                  data-testid="call-pharmacy-btn"
                >
                  <Phone className="w-5 h-5" />
                  {t('callNow')}
                </Button>
              </a>
              <Button 
                size={seniorMode ? 'lg' : 'default'}
                variant="outline"
                className="flex-1 rounded-full border-pharma-teal text-pharma-teal hover:bg-pharma-teal/5 gap-2"
                onClick={openInMaps}
                data-testid="directions-btn"
              >
                <Navigation className="w-5 h-5" />
                {t('getDirections')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* On-Call Schedule */}
        {pharmacy.on_call_schedule && (
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter" style={{ animationDelay: '0.1s' }}>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                <Calendar className="w-5 h-5 text-pharma-royal-blue" />
                {t('onCallSchedule')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-pharma-charcoal">{pharmacy.on_call_schedule}</p>
            </CardContent>
          </Card>
        )}

        {/* Catalog products associated with this pharmacy */}
        {catalogProducts.length > 0 && (
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter" style={{ animationDelay: '0.2s' }}>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg text-pharma-dark-slate">
                {language === 'el' ? 'Προϊόντα που διαχειρίζεται' : 'Products this pharmacy handles'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {catalogProducts.map((item) => {
                  const product = item?.product || {};
                  const displayName = language === 'el'
                    ? (product.name_el || product.name_en || 'Προϊόν')
                    : (product.name_en || product.name_el || 'Product');
                  return (
                  <div 
                    key={`${item.product_id || 'product'}-${item.pharmacy_id || 'pharmacy'}`}
                    className="flex items-center justify-between p-3 bg-pharma-ice-blue rounded-xl"
                  >
                    <div>
                      <p className="font-medium text-pharma-charcoal">
                        {displayName}
                      </p>
                      {product?.category && (
                        <p className="text-sm text-pharma-slate-grey">
                          {product.category}
                        </p>
                      )}
                    </div>
                    <span className="rounded-full bg-pharma-steel-blue/10 px-2 py-1 text-xs text-pharma-steel-blue">
                      {language === 'el' ? 'Συσχέτιση καταλόγου' : 'Catalog association'}
                    </span>
                  </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
