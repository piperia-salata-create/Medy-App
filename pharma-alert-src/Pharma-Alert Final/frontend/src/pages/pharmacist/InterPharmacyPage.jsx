import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, ROLES } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { StatusBadge, VerifiedBadge } from '../../components/ui/status-badge';
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
  MessageSquare,
  CheckCircle2,
  Clock,
  Pill
} from 'lucide-react';

export default function InterPharmacyPage() {
  const { user, profile, isVerifiedPharmacist } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [pharmacies, setPharmacies] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [medicineName, setMedicineName] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);

  // Redirect if not verified pharmacist
  useEffect(() => {
    if (profile && !isVerifiedPharmacist()) {
      navigate('/pharmacist');
    }
  }, [profile, isVerifiedPharmacist, navigate]);

  // Fetch verified pharmacies
  const fetchPharmacies = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select(`
          *,
          profiles!pharmacies_owner_id_fkey (role)
        `)
        .neq('owner_id', user?.id);

      if (error) throw error;
      
      // Filter only verified pharmacists' pharmacies
      const verifiedPharmacies = (data || []).filter(
        p => p.profiles?.role === ROLES.PHARMACIST_VERIFIED
      );
      setPharmacies(verifiedPharmacies);
    } catch (error) {
      console.error('Error fetching pharmacies:', error);
    }
  }, [user]);

  // Fetch stock requests
  const fetchRequests = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('stock_requests')
        .select(`
          *,
          from_pharmacy:pharmacies!stock_requests_from_pharmacy_id_fkey (name),
          to_pharmacy:pharmacies!stock_requests_to_pharmacy_id_fkey (name)
        `)
        .or(`from_pharmacy_id.eq.${user.id},to_pharmacy_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  }, [user]);

  // Send stock request
  const sendStockRequest = async () => {
    if (!selectedPharmacy || !medicineName.trim()) {
      toast.error(language === 'el' ? 'Συμπληρώστε όλα τα πεδία' : 'Fill in all fields');
      return;
    }

    setSendingRequest(true);
    try {
      // Get current user's pharmacy
      const { data: myPharmacy } = await supabase
        .from('pharmacies')
        .select('id')
        .eq('owner_id', user.id)
        .single();

      if (!myPharmacy) {
        toast.error(language === 'el' ? 'Δεν βρέθηκε φαρμακείο' : 'Pharmacy not found');
        return;
      }

      const { error } = await supabase
        .from('stock_requests')
        .insert({
          from_pharmacy_id: myPharmacy.id,
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
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchPharmacies(), fetchRequests()]);
      setLoading(false);
    };
    init();
  }, [fetchPharmacies, fetchRequests]);

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

  // Filter pharmacies
  const filteredPharmacies = pharmacies.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate incoming and outgoing requests
  const incomingRequests = requests.filter(r => r.to_pharmacy?.name);
  const outgoingRequests = requests.filter(r => r.from_pharmacy?.name);

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
              placeholder={language === 'el' ? 'Αναζήτηση φαρμακείου...' : 'Search pharmacy...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-12 rounded-2xl border-pharma-grey-pale"
              data-testid="pharmacy-search-input"
            />
          </div>

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
                        <StatusBadge 
                          status={
                            request.status === 'accepted' ? 'available' :
                            request.status === 'pending' ? 'limited' : 'unavailable'
                          }
                        />
                        
                        {request.status === 'pending' && request.to_pharmacy_id === user?.id && (
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
