import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { findPharmacyIdsByProductQuery, getProductSuggestionLabel } from '../../lib/inventory/searchInventory';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { VerifiedBadge } from '../../components/ui/status-badge';
import { SkeletonPharmacyCard, SkeletonList } from '../../components/ui/skeleton-loaders';
import { EmptyState } from '../../components/ui/empty-states';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, 
  Search, 
  Users,
  Send,
  Package,
  MapPin,
  Phone,
  CheckCircle2,
  Clock,
  Pill
} from 'lucide-react';

const areStockRequestsEqual = (prevList = [], nextList = []) => {
  if (prevList === nextList) return true;
  if (prevList.length !== nextList.length) return false;

  for (let i = 0; i < prevList.length; i += 1) {
    const prev = prevList[i] || {};
    const next = nextList[i] || {};
    if ((prev.id || '') !== (next.id || '')) return false;
    if ((prev.status || '') !== (next.status || '')) return false;
    if ((prev.updated_at || '') !== (next.updated_at || '')) return false;
    if ((prev.responded_at || '') !== (next.responded_at || '')) return false;
  }

  return true;
};

export default function InterPharmacyPage() {
  const { user, profile, isVerifiedPharmacist } = useAuth();
  const userId = user?.id || null;
  const profileId = profile?.id || null;
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [pharmacies, setPharmacies] = useState([]);
  const [myPharmacy, setMyPharmacy] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [medicineName, setMedicineName] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [productMatchPharmacyIds, setProductMatchPharmacyIds] = useState([]);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [inventoryRefreshTick, setInventoryRefreshTick] = useState(0);
  const initialLoadedRef = useRef(false);

  useEffect(() => {
    initialLoadedRef.current = false;
  }, [userId]);

  // Redirect if not verified pharmacist
  useEffect(() => {
    if (profileId && !isVerifiedPharmacist()) {
      navigate('/pharmacist');
    }
  }, [profileId, isVerifiedPharmacist, navigate]);

  const fetchMyPharmacy = useCallback(async () => {
    if (!userId) {
      setMyPharmacy(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle();

      if (error) throw error;
      setMyPharmacy(data || null);
    } catch (error) {
      console.error('Error fetching my pharmacy:', error);
    }
  }, [userId]);

  // Fetch pharmacies (no embedded relationships)
  const fetchPharmacies = useCallback(async () => {
    if (!userId) {
      setPharmacies((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    try {
      const selectFields = 'id, owner_id, name, address, phone, hours, is_on_call, on_call_schedule, is_verified, latitude, longitude, created_at, updated_at';
      const { data, error } = await supabase
        .from('pharmacies')
        .select(selectFields)
        .eq('is_verified', true)
        .neq('owner_id', userId);

      if (error) throw error;
      setPharmacies((data || []).filter((pharmacy) => pharmacy?.owner_id !== userId));
    } catch (error) {
      console.error('Error fetching pharmacies:', error);
      setPharmacies([]);
    }
  }, [userId]);

  // Fetch stock requests
  const fetchRequests = useCallback(async () => {
    if (!myPharmacy) return;
    try {
      const { data, error } = await supabase
        .from('stock_requests')
        .select(`
          *,
          from_pharmacy:pharmacies!stock_requests_from_pharmacy_id_fkey (name),
          to_pharmacy:pharmacies!stock_requests_to_pharmacy_id_fkey (name)
        `)
        .or(`from_pharmacy_id.eq.${myPharmacy.id},to_pharmacy_id.eq.${myPharmacy.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const nextRequests = data || [];
      setRequests((prev) => (areStockRequestsEqual(prev, nextRequests) ? prev : nextRequests));
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  }, [myPharmacy]);

  // Send stock request
  const sendStockRequest = async () => {
    if (!selectedPharmacy || !medicineName.trim()) {
      toast.error(language === 'el' ? 'Συμπληρώστε όλα τα πεδία' : 'Fill in all fields');
      return;
    }

    setSendingRequest(true);
    try {
      // Get current user's pharmacy
      let currentPharmacy = myPharmacy;
      if (!currentPharmacy) {
        const { data, error } = await supabase
          .from('pharmacies')
          .select('id')
          .eq('owner_id', userId)
          .maybeSingle();
        if (error) throw error;
        currentPharmacy = data;
      }

      if (!currentPharmacy) {
        toast.error(language === 'el'
          ? '\u0394\u03b5\u03bd \u03b2\u03c1\u03ad\u03b8\u03b7\u03ba\u03b5 \u03c6\u03b1\u03c1\u03bc\u03b1\u03ba\u03b5\u03af\u03bf'
          : 'Pharmacy not found');
        return;
      }

      const { error } = await supabase
        .from('stock_requests')
        .insert({
          from_pharmacy_id: currentPharmacy.id,
          to_pharmacy_id: selectedPharmacy.id,
          medicine_name: medicineName,
          message: requestMessage,
          status: 'pending'
        });

      if (error) throw error;

      toast.success(t('requestSent'));
      setRequestDialogOpen(false);
      setMedicineName('');
      setRequestMessage('');
      setSelectedPharmacy(null);
      fetchRequests();
    } catch (error) {
      toast.error(t('errorOccurred'));
    } finally {
      setSendingRequest(false);
    }
  };

  // Respond to request
  const respondToRequest = async (requestId, status) => {
    try {
      const { error } = await supabase
        .from('stock_requests')
        .update({ 
          status,
          responded_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      toast.success(
        status === 'accepted' 
          ? (language === 'el' ? 'Αίτημα αποδεκτό' : 'Request accepted')
          : (language === 'el' ? 'Αίτημα απορρίφθηκε' : 'Request declined')
      );
      fetchRequests();
    } catch (error) {
      toast.error(t('errorOccurred'));
    }
  };

  // Initial fetch
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const init = async () => {
      const isInitialLoad = !initialLoadedRef.current;
      if (isInitialLoad) {
        setLoading(true);
      }
      await Promise.all([fetchMyPharmacy(), fetchPharmacies()]);
      initialLoadedRef.current = true;
      setLoading(false);
    };
    init();
  }, [userId, fetchMyPharmacy, fetchPharmacies]);

  useEffect(() => {
    if (myPharmacy) {
      fetchRequests();
    }
  }, [myPharmacy, fetchRequests]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('stock_requests_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_requests' },
        () => fetchRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRequests]);

  useEffect(() => {
    const inventoryChannel = supabase
      .channel('inter_pharmacy_inventory_search')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pharmacy_inventory' },
        () => setInventoryRefreshTick((tick) => tick + 1)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(inventoryChannel);
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    const scopedIds = (pharmacies || []).map((p) => p.id).filter(Boolean);

    if (!query || query.length < 2 || scopedIds.length === 0) {
      setProductMatchPharmacyIds([]);
      setProductSuggestions([]);
      setProductSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setProductSearchLoading(true);
      try {
        const result = await findPharmacyIdsByProductQuery({
          query,
          pharmacyIds: scopedIds,
          excludePharmacyIds: myPharmacy?.id ? [myPharmacy.id] : []
        });
        if (!cancelled) {
          setProductMatchPharmacyIds(result?.pharmacyIds || []);
          setProductSuggestions((result?.products || []).slice(0, 6));
        }
      } catch (error) {
        console.error('B2B product search failed:', error);
        if (!cancelled) {
          setProductMatchPharmacyIds([]);
          setProductSuggestions([]);
        }
      } finally {
        if (!cancelled) setProductSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, pharmacies, inventoryRefreshTick, myPharmacy]);

  // Filter pharmacies
  const filteredPharmacies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return pharmacies.filter((p) => p?.owner_id !== userId);
    const productMatchSet = new Set(productMatchPharmacyIds);
    return pharmacies.filter((p) => {
      if (p?.owner_id === userId) return false;
      const textMatch = (p.name || '').toLowerCase().includes(query)
        || (p.address || '').toLowerCase().includes(query);
      return textMatch || productMatchSet.has(p.id);
    });
  }, [pharmacies, searchQuery, productMatchPharmacyIds, userId]);

  // Separate incoming and outgoing requests
  const incomingRequests = requests.filter(r => r.to_pharmacy_id === myPharmacy?.id);
  const outgoingRequests = requests.filter(r => r.from_pharmacy_id === myPharmacy?.id);

  if (!isVerifiedPharmacist()) {
    return null;
  }

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="inter-pharmacy-page">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/pharmacist">
            <Button variant="ghost" size="sm" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-pharma-teal" />
            <h1 className="font-heading font-semibold text-pharma-dark-slate">
              {t('interPharmacy')}
            </h1>
          </div>
          <VerifiedBadge className="ml-auto" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Search Pharmacies */}
        <section className="page-enter">
          <h2 className="font-heading text-xl font-semibold text-pharma-dark-slate mb-4">
            {language === 'el' ? 'Επαληθευμένα Φαρμακεία' : 'Verified Pharmacies'}
          </h2>
          
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-pharma-slate-grey" />
            <Input
              placeholder={language === 'el' ? 'Αναζήτηση φαρμακείου ή προϊόντος καταλόγου...' : 'Search pharmacy or catalog product...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-12 rounded-2xl border-pharma-grey-pale"
              data-testid="pharmacy-search-input"
            />
          </div>
          {searchQuery.trim().length >= 2 && productSuggestions.length > 0 && (
            <div className="mb-3 rounded-xl border border-pharma-grey-pale bg-white p-2">
              <p className="mb-1 text-xs text-pharma-slate-grey">
                {language === 'el' ? 'Προτάσεις προϊόντων' : 'Product suggestions'}
              </p>
              <div className="flex flex-wrap gap-2">
                {productSuggestions.map((product) => {
                  const label = getProductSuggestionLabel(product, language);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className="rounded-full border border-pharma-grey-pale bg-pharma-ice-blue px-3 py-1 text-xs text-pharma-charcoal hover:border-pharma-teal/40"
                      onClick={() => setSearchQuery(label)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {searchQuery.trim().length >= 2 && (
            <p className="text-xs text-pharma-slate-grey mb-4">
              {productSearchLoading
                ? (language === 'el' ? 'Αναζήτηση συσχετίσεων προϊόντων...' : 'Searching product associations...')
                : (productMatchPharmacyIds.length > 0
                  ? (language === 'el'
                    ? `Βρέθηκαν ${productMatchPharmacyIds.length} φαρμακεία που το διαχειρίζονται.`
                    : `Found ${productMatchPharmacyIds.length} pharmacies associated with this product.`)
                  : (language === 'el'
                    ? 'Δεν βρέθηκαν συσχετισμένα φαρμακεία για αυτόν τον όρο.'
                    : 'No associated pharmacies found for this query.'))}
            </p>
          )}

          {loading ? (
            <SkeletonList count={3} CardComponent={SkeletonPharmacyCard} />
          ) : filteredPharmacies.length === 0 ? (
            <EmptyState 
              icon={Users}
              title={language === 'el' ? 'Δεν βρέθηκαν φαρμακεία' : 'No pharmacies found'}
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredPharmacies.map((pharmacy) => (
                <Card 
                  key={pharmacy.id}
                  className="bg-white rounded-2xl shadow-card border-pharma-grey-pale hover:shadow-card-hover transition-all"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-pharma-ice-blue flex items-center justify-center flex-shrink-0">
                        <Pill className="w-6 h-6 text-pharma-teal" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-heading font-semibold text-pharma-dark-slate">
                            {pharmacy.name}
                          </h3>
                          <VerifiedBadge />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-pharma-slate-grey mb-1">
                          <MapPin className="w-4 h-4" />
                          <span>{pharmacy.address}</span>
                        </div>
                        {pharmacy.phone && (
                          <div className="flex items-center gap-2 text-sm text-pharma-slate-grey">
                            <Phone className="w-4 h-4" />
                            <span>{pharmacy.phone}</span>
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="mt-3 rounded-full bg-pharma-teal hover:bg-pharma-teal/90 text-white gap-2"
                          onClick={() => {
                            setSelectedPharmacy(pharmacy);
                            setRequestDialogOpen(true);
                          }}
                          data-testid={`request-btn-${pharmacy.id}`}
                        >
                          <Send className="w-4 h-4" />
                          {t('requestStock')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Stock Requests */}
        {requests.length > 0 && (
          <section className="page-enter" style={{ animationDelay: '0.1s' }}>
            <h2 className="font-heading text-xl font-semibold text-pharma-dark-slate mb-4">
              {language === 'el' ? 'Αιτήματα Αποθέματος' : 'Stock Requests'}
            </h2>
            
            <div className="space-y-4">
              {requests.map((request) => (
                <Card 
                  key={request.id}
                  className="bg-white rounded-2xl shadow-card border-pharma-grey-pale"
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          request.status === 'pending' ? 'bg-pharma-steel-blue/10' :
                          request.status === 'accepted' ? 'bg-pharma-sea-green/10' :
                          'bg-pharma-slate-grey/10'
                        }`}>
                          {request.status === 'pending' ? (
                            <Clock className="w-5 h-5 text-pharma-steel-blue" />
                          ) : request.status === 'accepted' ? (
                            <CheckCircle2 className="w-5 h-5 text-pharma-sea-green" />
                          ) : (
                            <Package className="w-5 h-5 text-pharma-slate-grey" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-pharma-dark-slate">
                            {request.medicine_name}
                          </p>
                          <p className="text-sm text-pharma-slate-grey">
                            {request.from_pharmacy?.name} → {request.to_pharmacy?.name}
                          </p>
                          {request.message && (
                            <p className="text-sm text-pharma-charcoal mt-1 bg-pharma-ice-blue p-2 rounded-lg">
                              {request.message}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                          request.status === 'accepted'
                            ? 'bg-pharma-sea-green/10 text-pharma-sea-green'
                            : request.status === 'pending'
                              ? 'bg-pharma-steel-blue/10 text-pharma-steel-blue'
                              : 'bg-pharma-slate-grey/10 text-pharma-slate-grey'
                        }`}>
                          {request.status === 'accepted'
                            ? (language === 'el' ? 'Αποδεκτό' : 'Accepted')
                            : request.status === 'pending'
                              ? (language === 'el' ? 'Εκκρεμεί' : 'Pending')
                              : (language === 'el' ? 'Απορρίφθηκε' : 'Declined')}
                        </span>
                        
                        {request.status === 'pending' && request.to_pharmacy_id === myPharmacy?.id && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="rounded-full bg-pharma-sea-green hover:bg-pharma-sea-green/90"
                              onClick={() => respondToRequest(request.id, 'accepted')}
                            >
                              {language === 'el' ? 'Αποδοχή' : 'Accept'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full"
                              onClick={() => respondToRequest(request.id, 'declined')}
                            >
                              {language === 'el' ? 'Απόρριψη' : 'Decline'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Request Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-pharma-dark-slate">
              {t('requestStock')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {selectedPharmacy && (
              <div className="p-3 bg-pharma-ice-blue rounded-xl">
                <p className="font-medium text-pharma-charcoal">{selectedPharmacy.name}</p>
                <p className="text-sm text-pharma-slate-grey">{selectedPharmacy.address}</p>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? 'Όνομα Φαρμάκου' : 'Medicine Name'}
              </label>
              <Input
                value={medicineName}
                onChange={(e) => setMedicineName(e.target.value)}
                placeholder={language === 'el' ? 'Εισάγετε όνομα φαρμάκου...' : 'Enter medicine name...'}
                className="rounded-xl"
                data-testid="request-medicine-input"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? 'Μήνυμα (προαιρετικό)' : 'Message (optional)'}
              </label>
              <Textarea
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder={language === 'el' ? 'Προσθέστε σημείωση...' : 'Add a note...'}
                className="rounded-xl"
                rows={3}
              />
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
              onClick={sendStockRequest}
              disabled={sendingRequest}
              data-testid="send-request-btn"
            >
              {sendingRequest ? t('loading') : t('sendRequest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
