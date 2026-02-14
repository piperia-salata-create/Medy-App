import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-states';
import { SkeletonList, SkeletonPharmacyCard } from '../../components/ui/skeleton-loaders';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

const statusLabel = (status) => status || 'pending';
const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

export default function InterPharmacyPage() {
  const { user, isPharmacist } = useAuth();
  useLanguage();
  const navigate = useNavigate();
  const userId = user?.id || null;

  const [loading, setLoading] = useState(true);
  const [myPharmacy, setMyPharmacy] = useState(null);
  const [activeOffers, setActiveOffers] = useState([]);
  const [myOffers, setMyOffers] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [allMedicines, setAllMedicines] = useState([]);

  const [offerMedicineId, setOfferMedicineId] = useState('');
  const [offerQuantity, setOfferQuantity] = useState('1');
  const [offerExpiryDate, setOfferExpiryDate] = useState('');
  const [offerNotes, setOfferNotes] = useState('');
  const [creatingOffer, setCreatingOffer] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState(null);

  const pharmacyId = myPharmacy?.id || null;

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: mine, error: mineErr } = await supabase
        .from('pharmacies')
        .select('id, owner_id, name')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle();
      if (mineErr) throw mineErr;
      setMyPharmacy(mine || null);

      if (!mine?.id) {
        setActiveOffers([]);
        setMyOffers([]);
        setIncomingRequests([]);
        setOutgoingRequests([]);
        setAllMedicines([]);
        return;
      }

      const [offersRes, myOffersRes, requestsRes, medsRes] = await Promise.all([
        supabase
          .from('exchange_offers')
          .select('id, pharmacy_id, medicine_id, quantity, expiry_date, notes, status, created_at')
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('exchange_offers')
          .select('id, pharmacy_id, medicine_id, quantity, expiry_date, notes, status, created_at')
          .eq('pharmacy_id', mine.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('exchange_requests')
          .select('id, offer_id, requesting_pharmacy_id, message, status, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('medicines')
          .select('id, name')
          .order('name', { ascending: true })
          .limit(200)
      ]);

      if (offersRes.error) throw offersRes.error;
      if (myOffersRes.error) throw myOffersRes.error;
      if (requestsRes.error) throw requestsRes.error;
      if (medsRes.error) throw medsRes.error;

      const offersRows = offersRes.data || [];
      const myOffersRows = myOffersRes.data || [];
      const reqRows = requestsRes.data || [];
      const medsRows = medsRes.data || [];

      const reqOfferIds = Array.from(new Set(reqRows.map((r) => r.offer_id).filter(Boolean)));
      const knownOfferIds = new Set([...offersRows, ...myOffersRows].map((o) => o.id));
      const missingOfferIds = reqOfferIds.filter((id) => !knownOfferIds.has(id));

      let extraOffers = [];
      if (missingOfferIds.length > 0) {
        const { data, error } = await supabase
          .from('exchange_offers')
          .select('id, pharmacy_id, medicine_id, quantity, expiry_date, notes, status, created_at')
          .in('id', missingOfferIds);
        if (error) throw error;
        extraOffers = data || [];
      }

      const allOffers = [...offersRows, ...myOffersRows, ...extraOffers];
      const offersById = new Map(allOffers.map((o) => [o.id, o]));

      const pharmacyIds = Array.from(
        new Set(
          allOffers
            .map((o) => o.pharmacy_id)
            .concat(reqRows.map((r) => r.requesting_pharmacy_id))
            .filter(Boolean)
        )
      );
      const { data: pharmacyRows, error: pharmacyErr } = await supabase
        .from('pharmacies')
        .select('id, name')
        .in('id', pharmacyIds);
      if (pharmacyErr) throw pharmacyErr;

      const pharmacyById = new Map((pharmacyRows || []).map((p) => [p.id, p]));
      const medicineById = new Map(medsRows.map((m) => [m.id, m]));

      const enrichOffer = (offer) => ({
        ...offer,
        pharmacy: pharmacyById.get(offer.pharmacy_id) || null,
        medicine: medicineById.get(offer.medicine_id) || null
      });

      const enrichedActive = offersRows
        .map(enrichOffer)
        .filter((o) => o.pharmacy_id !== mine.id);

      const enrichedMine = myOffersRows.map(enrichOffer);

      const enrichedRequests = reqRows
        .map((r) => {
          const offer = offersById.get(r.offer_id) || null;
          return {
            ...r,
            offer,
            requestingPharmacy: pharmacyById.get(r.requesting_pharmacy_id) || null,
            offerPharmacy: offer ? (pharmacyById.get(offer.pharmacy_id) || null) : null
          };
        })
        .filter((r) => r.offer);

      setActiveOffers(enrichedActive);
      setMyOffers(enrichedMine);
      setIncomingRequests(enrichedRequests.filter((r) => r.offer.pharmacy_id === mine.id));
      setOutgoingRequests(enrichedRequests.filter((r) => r.requesting_pharmacy_id === mine.id));
      setAllMedicines(medsRows);
    } catch (error) {
      console.error('Exchange load failed:', error);
      toast.error(error?.message || 'Failed to load exchange data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isPharmacist()) {
      navigate('/patient');
      return;
    }
    loadData();
  }, [isPharmacist, loadData, navigate]);

  useEffect(() => {
    const channel = supabase
      .channel('exchange_scaffold_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_offers' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_requests' }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const medicineChoices = useMemo(() => allMedicines.slice(0, 200), [allMedicines]);

  const createOffer = async () => {
    if (!pharmacyId || !offerMedicineId) return;

    const qty = Number(offerQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    setCreatingOffer(true);
    try {
      const { error } = await supabase.from('exchange_offers').insert({
        pharmacy_id: pharmacyId,
        medicine_id: offerMedicineId,
        quantity: qty,
        expiry_date: safeText(offerExpiryDate) || null,
        notes: safeText(offerNotes) || null,
        status: 'active'
      });
      if (error) throw error;

      setOfferMedicineId('');
      setOfferQuantity('1');
      setOfferExpiryDate('');
      setOfferNotes('');
      await loadData();
    } catch (error) {
      toast.error(error?.message || 'Failed to create offer');
    } finally {
      setCreatingOffer(false);
    }
  };

  const updateOfferStatus = async (offerId, status) => {
    if (!offerId || !status || !pharmacyId) return;
    try {
      const { error } = await supabase
        .from('exchange_offers')
        .update({ status })
        .eq('id', offerId)
        .eq('pharmacy_id', pharmacyId);
      if (error) throw error;
      await loadData();
    } catch (error) {
      toast.error(error?.message || 'Failed to update offer');
    }
  };

  const requestExchange = async (offerId) => {
    if (!pharmacyId) return;

    const message = window.prompt('Optional message') || '';
    try {
      const { error } = await supabase.from('exchange_requests').insert({
        offer_id: offerId,
        requesting_pharmacy_id: pharmacyId,
        message: safeText(message) || null,
        status: 'pending'
      });
      if (error) throw error;
      await loadData();
    } catch (error) {
      toast.error(error?.message || 'Failed to send request');
    }
  };

  const respondIncoming = async (requestId, status) => {
    setBusyRequestId(requestId);
    try {
      const { error } = await supabase
        .from('exchange_requests')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) throw error;

      if (status === 'accepted') {
        const { data, error: rpcError } = await supabase.rpc('get_or_create_exchange_conversation', {
          p_exchange_request_id: requestId
        });
        if (rpcError) throw rpcError;
        if (data) navigate(`/pharmacist/chats/${data}`);
      }

      await loadData();
    } catch (error) {
      toast.error(error?.message || 'Failed to update request');
    } finally {
      setBusyRequestId(null);
    }
  };

  const openExchangeChat = async (requestId) => {
    try {
      const { data, error } = await supabase.rpc('get_or_create_exchange_conversation', {
        p_exchange_request_id: requestId
      });
      if (error) throw error;
      if (data) navigate(`/pharmacist/chats/${data}`);
    } catch (error) {
      toast.error(error?.message || 'Failed to open chat');
    }
  };

  if (!isPharmacist()) return null;

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="inter-pharmacy-page">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link to="/pharmacist">
            <Button variant="ghost" size="sm" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-heading font-semibold text-pharma-dark-slate">Exchange Hub</h1>
          <p className="text-xs text-pharma-slate-grey">Matching only. Transfer and settlement happen outside platform.</p>
          <div className="ml-auto">
            <Link to="/pharmacist/chats">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                <MessageCircle className="w-4 h-4" />
                Chats
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <SkeletonList count={3} CardComponent={SkeletonPharmacyCard} />
        ) : !myPharmacy ? (
          <EmptyState icon={MessageCircle} title="No pharmacy profile found" description="Create your pharmacy first to use exchange." />
        ) : (
          <>
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-4 space-y-3">
                <h2 className="font-heading font-semibold text-pharma-dark-slate">Create Offer</h2>
                <div className="grid md:grid-cols-4 gap-3">
                  <select
                    className="h-10 rounded-xl border border-pharma-grey-pale px-3"
                    value={offerMedicineId}
                    onChange={(e) => setOfferMedicineId(e.target.value)}
                    data-testid="exchange-offer-medicine-select"
                  >
                    <option value="">Select medicine</option>
                    {medicineChoices.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="1"
                    value={offerQuantity}
                    onChange={(e) => setOfferQuantity(e.target.value)}
                    placeholder="Quantity"
                    data-testid="exchange-offer-quantity-input"
                  />
                  <Input
                    type="date"
                    value={offerExpiryDate}
                    onChange={(e) => setOfferExpiryDate(e.target.value)}
                    data-testid="exchange-offer-expiry-input"
                  />
                  <Button
                    className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90"
                    onClick={createOffer}
                    disabled={creatingOffer}
                    data-testid="exchange-offer-create-submit"
                  >
                    {creatingOffer ? 'Saving...' : 'Create offer'}
                  </Button>
                </div>
                <Input
                  value={offerNotes}
                  onChange={(e) => setOfferNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  data-testid="exchange-offer-notes-input"
                />
              </CardContent>
            </Card>

            <section className="space-y-2">
              <h2 className="font-heading font-semibold text-pharma-dark-slate">Active Offers</h2>
              {activeOffers.length === 0 ? (
                <EmptyState icon={MessageCircle} title="No active offers" />
              ) : (
                <div className="space-y-2">
                  {activeOffers.map((offer) => (
                    <Card key={offer.id} className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-pharma-dark-slate">{offer.medicine?.name || 'Medicine'}</p>
                          <p className="text-sm text-pharma-slate-grey">{offer.pharmacy?.name || '-'} - qty {offer.quantity} - exp {offer.expiry_date || '-'}</p>
                        </div>
                        <Button
                          className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90"
                          onClick={() => requestExchange(offer.id)}
                          data-testid={`exchange-request-offer-${offer.id}`}
                        >
                          Request exchange
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="font-heading font-semibold text-pharma-dark-slate">My Offers</h2>
              {myOffers.length === 0 ? (
                <EmptyState icon={MessageCircle} title="No offers yet" />
              ) : (
                <div className="space-y-2">
                  {myOffers.map((offer) => (
                    <Card key={offer.id} className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-pharma-dark-slate">{offer.medicine?.name || 'Medicine'}</p>
                          <p className="text-sm text-pharma-slate-grey">qty {offer.quantity} - {statusLabel(offer.status)}</p>
                        </div>
                        {offer.status === 'active' && (
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => updateOfferStatus(offer.id, 'withdrawn')}
                            data-testid={`exchange-withdraw-offer-${offer.id}`}
                          >
                            Withdraw
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="font-heading font-semibold text-pharma-dark-slate">Incoming Requests</h2>
              {incomingRequests.length === 0 ? (
                <EmptyState icon={MessageCircle} title="No incoming requests" />
              ) : (
                <div className="space-y-2">
                  {incomingRequests.map((req) => (
                    <Card key={req.id} className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                      <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-pharma-dark-slate">{req.offer?.medicine_id ? (allMedicines.find((m) => m.id === req.offer.medicine_id)?.name || 'Medicine') : 'Medicine'}</p>
                          <p className="text-sm text-pharma-slate-grey">{req.requestingPharmacy?.name || '-'} - {statusLabel(req.status)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {req.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                className="rounded-full bg-pharma-sea-green hover:bg-pharma-sea-green/90"
                                onClick={() => respondIncoming(req.id, 'accepted')}
                                disabled={busyRequestId === req.id}
                                data-testid={`exchange-accept-${req.id}`}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                onClick={() => respondIncoming(req.id, 'rejected')}
                                disabled={busyRequestId === req.id}
                                data-testid={`exchange-reject-${req.id}`}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {req.status === 'accepted' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full gap-1"
                              onClick={() => openExchangeChat(req.id)}
                              data-testid={`exchange-open-chat-${req.id}`}
                            >
                              <MessageCircle className="w-4 h-4" />
                              Open chat
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="font-heading font-semibold text-pharma-dark-slate">Outgoing Requests</h2>
              {outgoingRequests.length === 0 ? (
                <EmptyState icon={MessageCircle} title="No outgoing requests" />
              ) : (
                <div className="space-y-2">
                  {outgoingRequests.map((req) => (
                    <Card key={req.id} className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-pharma-dark-slate">{req.offer?.medicine_id ? (allMedicines.find((m) => m.id === req.offer.medicine_id)?.name || 'Medicine') : 'Medicine'}</p>
                          <p className="text-sm text-pharma-slate-grey">{req.offerPharmacy?.name || '-'} - {statusLabel(req.status)}</p>
                        </div>
                        {req.status === 'accepted' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full gap-1"
                            onClick={() => openExchangeChat(req.id)}
                            data-testid={`exchange-open-chat-outgoing-${req.id}`}
                          >
                            <MessageCircle className="w-4 h-4" />
                            Open chat
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
