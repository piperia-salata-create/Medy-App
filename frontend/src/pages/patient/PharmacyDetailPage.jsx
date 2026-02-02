import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeniorMode } from '../../contexts/SeniorModeContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { StatusBadge, OnCallBadge, VerifiedBadge } from '../../components/ui/status-badge';
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

export default function PharmacyDetailPage() {
  const { id } = useParams();
  const { user, session, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const { seniorMode } = useSeniorMode();
  
  const [pharmacy, setPharmacy] = useState(null);
  const [stock, setStock] = useState([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch pharmacy details
  useEffect(() => {
    if (isDev) {
      console.log('PharmacyDetailPage init', { user, session, authLoading });
    }
    if (authLoading) return;
    const fetchPharmacy = async () => {
      setLoading(true);
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
          setStock([]);
          return;
        }

        if (pharmacyError) throw pharmacyError;
        setPharmacy(pharmacyData);

        // Fetch stock
        const { data: stockData, error: stockError } = await supabase
          .from('pharmacy_stock')
          .select(`
            *,
            medicines (id, name, description, category)
          `)
          .eq('pharmacy_id', id);

        if (!stockError) {
          setStock(stockData || []);
        }

        // Check if favorite
        if (user) {
          const { data: favoriteData, error: favoriteError } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('pharmacy_id', id)
            .maybeSingle();

          if (favoriteError) throw favoriteError;

          setIsFavorite(!!favoriteData);
        }
      } catch (error) {
        console.error('Error fetching pharmacy:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPharmacy();
  }, [authLoading, id, user, session]);

  // Toggle favorite
  const toggleFavorite = async () => {
    if (!user) {
      toast.error(language === 'el' ? 'Συνδεθείτε για αποθήκευση' : 'Sign in to save');
      return;
    }

    try {
      if (isFavorite) {
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('pharmacy_id', id);
        
        setIsFavorite(false);
        toast.success(language === 'el' ? 'Αφαιρέθηκε από αγαπημένα' : 'Removed from favorites');
      } else {
        await supabase
          .from('favorites')
          .insert({ user_id: user.id, pharmacy_id: id });
        
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
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-pharma-teal" />
                  <span className="text-pharma-charcoal">{pharmacy.hours}</span>
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

        {/* Available Medicines */}
        {stock.length > 0 && (
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter" style={{ animationDelay: '0.2s' }}>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg text-pharma-dark-slate">
                {language === 'el' ? 'Διαθέσιμα Φάρμακα' : 'Available Medicines'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {stock.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-pharma-ice-blue rounded-xl"
                  >
                    <div>
                      <p className="font-medium text-pharma-charcoal">
                        {item.medicines?.name || 'Unknown'}
                      </p>
                      {item.medicines?.category && (
                        <p className="text-sm text-pharma-slate-grey">
                          {item.medicines.category}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={item.status} size="sm" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
