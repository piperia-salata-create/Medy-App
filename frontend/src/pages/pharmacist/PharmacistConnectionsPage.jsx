import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { VerifiedBadge } from '../../components/ui/status-badge';
import { SkeletonList, SkeletonPharmacyCard } from '../../components/ui/skeleton-loaders';
import { EmptyState } from '../../components/ui/empty-states';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  UserPlus,
  Users,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Pill,
  Search,
  MessageCircle
} from 'lucide-react';

export default function PharmacistConnectionsPage() {
  const { user, profile, isPharmacist } = useAuth();
  const userId = user?.id || null;
  const profileId = profile?.id || null;
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [connections, setConnections] = useState([]);
  const [pendingIncoming, setPendingIncoming] = useState([]);
  const [pendingOutgoing, setPendingOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [openingDmUserId, setOpeningDmUserId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const loadedRef = useRef(false);

  // Redirect if not pharmacist
  useEffect(() => {
    if (profileId && !isPharmacist()) {
      navigate('/patient');
    }
  }, [profileId, isPharmacist, navigate]);

  // Fetch all connections for current user
  const fetchConnections = useCallback(async () => {
    if (!userId) {
      setConnections((prev) => (prev.length === 0 ? prev : []));
      setPendingIncoming((prev) => (prev.length === 0 ? prev : []));
      setPendingOutgoing((prev) => (prev.length === 0 ? prev : []));
      setLoading(false);
      return;
    }
    const isInitialLoad = !loadedRef.current;
    if (isInitialLoad) {
      setLoading(true);
    }
    
    try {
      const { data, error } = await supabase
        .from('pharmacist_connections')
        .select(`
          *,
          requester:profiles!pharmacist_connections_requester_pharmacist_id_fkey (
            id, full_name, email, pharmacy_name
          ),
          target:profiles!pharmacist_connections_target_pharmacist_id_fkey (
            id, full_name, email, pharmacy_name
          )
        `)
        .or(`requester_pharmacist_id.eq.${userId},target_pharmacist_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const allConnections = data || [];
      
      // Categorize connections
      const accepted = allConnections.filter(c => c.status === 'accepted');
      const pendingIn = allConnections.filter(
        c => c.status === 'pending' && c.target_pharmacist_id === userId
      );
      const pendingOut = allConnections.filter(
        c => c.status === 'pending' && c.requester_pharmacist_id === userId
      );

      setConnections(accepted);
      setPendingIncoming(pendingIn);
      setPendingOutgoing(pendingOut);
      loadedRef.current = true;
    } catch (error) {
      console.error('Error fetching connections:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Send invite by email
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
        toast.error(
          language === 'el' 
            ? 'Δεν βρέθηκε φαρμακοποιός με αυτό το email' 
            : 'No pharmacist found with this email'
        );
        return;
      }

      if (targetProfile.id === userId) {
        toast.error(
          language === 'el' 
            ? 'Δεν μπορείτε να στείλετε πρόσκληση στον εαυτό σας' 
            : 'Cannot send invite to yourself'
        );
        return;
      }

      // Check for existing connection
      const { data: existing, error: existingError } = await supabase
        .from('pharmacist_connections')
        .select('id, status')
        .or(
          `and(requester_pharmacist_id.eq.${userId},target_pharmacist_id.eq.${targetProfile.id}),` +
          `and(requester_pharmacist_id.eq.${targetProfile.id},target_pharmacist_id.eq.${userId})`
        )
        .maybeSingle();

      if (existingError) {
        console.error('Error checking existing connection:', existingError);
      }

      if (existing) {
        const statusMsg = {
          pending: language === 'el' ? 'Υπάρχει ήδη εκκρεμής πρόσκληση' : 'Invite already pending',
          accepted: language === 'el' ? 'Είστε ήδη συνδεδεμένοι' : 'Already connected',
          rejected: language === 'el' ? 'Η πρόσκληση απορρίφθηκε προηγουμένως' : 'Invite was previously rejected',
          blocked: language === 'el' ? 'Η σύνδεση έχει αποκλειστεί' : 'Connection is blocked'
        };
        toast.error(statusMsg[existing.status] || 'Connection exists');
        return;
      }

      // Create connection invite
      const { error: insertError } = await supabase
        .from('pharmacist_connections')
        .insert({
          requester_pharmacist_id: userId,
          target_pharmacist_id: targetProfile.id,
          status: 'pending'
        });

      if (insertError) throw insertError;

      toast.success(
        language === 'el' 
          ? 'Πρόσκληση εστάλη επιτυχώς!' 
          : 'Invite sent successfully!'
      );
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

  // Accept invite
  const acceptInvite = async (connectionId) => {
    try {
      const { error } = await supabase
        .from('pharmacist_connections')
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', connectionId);

      if (error) throw error;

      toast.success(language === 'el' ? 'Πρόσκληση αποδεκτή!' : 'Invite accepted!');
      fetchConnections();
    } catch (error) {
      toast.error(language === 'el' ? 'Σφάλμα' : 'Error');
    }
  };

  // Reject invite
  const rejectInvite = async (connectionId) => {
    try {
      const { error } = await supabase
        .from('pharmacist_connections')
        .update({ status: 'rejected' })
        .eq('id', connectionId);

      if (error) throw error;

      toast.success(language === 'el' ? 'Πρόσκληση απορρίφθηκε' : 'Invite rejected');
      fetchConnections();
    } catch (error) {
      toast.error(language === 'el' ? 'Σφάλμα' : 'Error');
    }
  };

  // Cancel outgoing invite
  const cancelInvite = async (connectionId) => {
    try {
      const { error } = await supabase
        .from('pharmacist_connections')
        .delete()
        .eq('id', connectionId);

      if (error) throw error;

      toast.success(language === 'el' ? 'Πρόσκληση ακυρώθηκε' : 'Invite cancelled');
      fetchConnections();
    } catch (error) {
      toast.error(language === 'el' ? 'Σφάλμα' : 'Error');
    }
  };

  const openDirectConversation = async (targetUserId) => {
    if (!targetUserId) return;
    setOpeningDmUserId(targetUserId);
    try {
      const { data, error } = await supabase.rpc('get_or_create_dm_conversation', {
        target_user_id: targetUserId
      });
      if (error) throw error;
      if (!data) throw new Error('Conversation not available');
      navigate(`/pharmacist/chats/${data}`);
    } catch (error) {
      toast.error(error?.message || (language === 'el' ? 'Αποτυχία ανοίγματος συνομιλίας' : 'Failed to open conversation'));
    } finally {
      setOpeningDmUserId(null);
    }
  };

  // Initial fetch
  useEffect(() => {
    loadedRef.current = false;
    setLoading(true);
    fetchConnections();
  }, [userId, fetchConnections]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('pharmacist_connections_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pharmacist_connections' },
        () => fetchConnections()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConnections]);

  // Filter connections
  const filteredConnections = connections.filter(c => {
    const otherUser = c.requester_pharmacist_id === userId ? c.target : c.requester;
    return (
      otherUser?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      otherUser?.pharmacy_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      otherUser?.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (!isPharmacist()) {
    return null;
  }

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="pharmacist-connections-page">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/pharmacist">
            <Button variant="ghost" size="sm" className="rounded-full" data-testid="back-btn">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-pharma-teal" />
            <h1 className="font-heading font-semibold text-pharma-dark-slate">
              {language === 'el' ? 'Συνδέσεις' : 'Connections'}
            </h1>
          </div>
          <Button
            className="ml-auto rounded-full bg-pharma-teal hover:bg-pharma-teal/90 text-white gap-2"
            onClick={() => setInviteDialogOpen(true)}
            data-testid="invite-btn"
          >
            <UserPlus className="w-4 h-4" />
            {language === 'el' ? 'Πρόσκληση' : 'Invite'}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Pending Incoming Invites */}
        {pendingIncoming.length > 0 && (
          <section className="page-enter">
            <h2 className="font-heading text-lg font-semibold text-pharma-dark-slate mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-pharma-steel-blue" />
              {language === 'el' ? 'Εισερχόμενες Προσκλήσεις' : 'Incoming Invites'}
              <span className="bg-pharma-teal text-white text-xs px-2 py-0.5 rounded-full">
                {pendingIncoming.length}
              </span>
            </h2>
            <div className="space-y-3">
              {pendingIncoming.map((conn) => (
                <Card 
                  key={conn.id}
                  className="bg-white rounded-2xl shadow-card border-pharma-grey-pale border-l-4 border-l-pharma-steel-blue"
                  data-testid={`incoming-invite-${conn.id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-pharma-steel-blue/10 flex items-center justify-center">
                          <Pill className="w-6 h-6 text-pharma-steel-blue" />
                        </div>
                        <div>
                          <p className="font-medium text-pharma-dark-slate">
                            {conn.requester?.full_name || 'Unknown'}
                          </p>
                          <p className="text-sm text-pharma-slate-grey">
                            {conn.requester?.pharmacy_name || conn.requester?.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="rounded-full bg-pharma-sea-green hover:bg-pharma-sea-green/90 gap-1"
                          onClick={() => acceptInvite(conn.id)}
                          data-testid={`accept-btn-${conn.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {language === 'el' ? 'Αποδοχή' : 'Accept'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full gap-1"
                          onClick={() => rejectInvite(conn.id)}
                          data-testid={`reject-btn-${conn.id}`}
                        >
                          <XCircle className="w-4 h-4" />
                          {language === 'el' ? 'Απόρριψη' : 'Reject'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Pending Outgoing Invites */}
        {pendingOutgoing.length > 0 && (
          <section className="page-enter" style={{ animationDelay: '0.05s' }}>
            <h2 className="font-heading text-lg font-semibold text-pharma-dark-slate mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-pharma-royal-blue" />
              {language === 'el' ? 'Απεσταλμένες Προσκλήσεις' : 'Sent Invites'}
            </h2>
            <div className="space-y-3">
              {pendingOutgoing.map((conn) => (
                <Card 
                  key={conn.id}
                  className="bg-white rounded-2xl shadow-card border-pharma-grey-pale"
                  data-testid={`outgoing-invite-${conn.id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-pharma-royal-blue/10 flex items-center justify-center">
                          <Clock className="w-6 h-6 text-pharma-royal-blue" />
                        </div>
                        <div>
                          <p className="font-medium text-pharma-dark-slate">
                            {conn.target?.full_name || 'Unknown'}
                          </p>
                          <p className="text-sm text-pharma-slate-grey">
                            {conn.target?.pharmacy_name || conn.target?.email}
                          </p>
                          <p className="text-xs text-pharma-slate-grey mt-1">
                            {language === 'el' ? 'Αναμονή απάντησης...' : 'Awaiting response...'}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full text-pharma-slate-grey"
                        onClick={() => cancelInvite(conn.id)}
                        data-testid={`cancel-btn-${conn.id}`}
                      >
                        {language === 'el' ? 'Ακύρωση' : 'Cancel'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Accepted Connections */}
        <section className="page-enter" style={{ animationDelay: '0.1s' }}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <h2 className="font-heading text-lg font-semibold text-pharma-dark-slate flex items-center gap-2">
              <Shield className="w-5 h-5 text-pharma-sea-green" />
              {language === 'el' ? 'Οι Συνδέσεις Μου' : 'My Connections'}
              {connections.length > 0 && (
                <span className="text-sm font-normal text-pharma-slate-grey">
                  ({connections.length})
                </span>
              )}
            </h2>
            {connections.length > 0 && (
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pharma-slate-grey" />
                <Input
                  placeholder={language === 'el' ? 'Αναζήτηση...' : 'Search...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 rounded-xl border-pharma-grey-pale"
                  data-testid="connections-search"
                />
              </div>
            )}
          </div>

          {loading ? (
            <SkeletonList count={3} CardComponent={SkeletonPharmacyCard} />
          ) : filteredConnections.length === 0 ? (
            <EmptyState 
              icon={Users}
              title={
                connections.length === 0
                  ? (language === 'el' ? 'Δεν έχετε συνδέσεις ακόμα' : 'No connections yet')
                  : (language === 'el' ? 'Δεν βρέθηκαν αποτελέσματα' : 'No results found')
              }
              description={
                connections.length === 0
                  ? (language === 'el' 
                      ? 'Προσκαλέστε άλλους φαρμακοποιούς για να ξεκινήσετε' 
                      : 'Invite other pharmacists to get started')
                  : undefined
              }
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredConnections.map((conn) => {
                const otherUser = conn.requester_pharmacist_id === userId ? conn.target : conn.requester;
                return (
                  <Card 
                    key={conn.id}
                    className="bg-white rounded-2xl shadow-card border-pharma-grey-pale hover:shadow-card-hover transition-all"
                    data-testid={`connection-${conn.id}`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-pharma-sea-green/10 flex items-center justify-center flex-shrink-0">
                          <Pill className="w-6 h-6 text-pharma-sea-green" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-heading font-semibold text-pharma-dark-slate truncate">
                              {otherUser?.full_name || 'Unknown'}
                            </h3>
                            <VerifiedBadge />
                          </div>
                          {otherUser?.pharmacy_name && (
                            <p className="text-sm text-pharma-charcoal truncate">
                              {otherUser.pharmacy_name}
                            </p>
                          )}
                          <p className="text-sm text-pharma-slate-grey truncate">
                            {otherUser?.email}
                          </p>
                          <div className="mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full gap-1.5"
                              onClick={() => openDirectConversation(otherUser?.id)}
                              disabled={openingDmUserId === otherUser?.id}
                              data-testid={`open-dm-${conn.id}`}
                            >
                              <MessageCircle className="w-4 h-4" />
                              {openingDmUserId === otherUser?.id
                                ? (language === 'el' ? 'Opening...' : 'Opening...')
                                : (language === 'el' ? 'Message' : 'Message')}
                            </Button>
                          </div>
                          {conn.accepted_at && (
                            <p className="text-xs text-pharma-slate-grey mt-2">
                              {language === 'el' ? 'Συνδέθηκε:' : 'Connected:'}{' '}
                              {new Date(conn.accepted_at).toLocaleDateString(
                                language === 'el' ? 'el-GR' : 'en-US'
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
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
                ? 'Εισάγετε το email του φαρμακοποιού που θέλετε να συνδεθείτε.'
                : 'Enter the email of the pharmacist you want to connect with.'}
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                Email
              </label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="pharmacist@example.com"
                className="rounded-xl"
                data-testid="invite-email-input"
              />
            </div>
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
              className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90"
              onClick={sendInvite}
              disabled={sendingInvite}
              data-testid="send-invite-btn"
            >
              {sendingInvite 
                ? (language === 'el' ? 'Αποστολή...' : 'Sending...')
                : (language === 'el' ? 'Αποστολή' : 'Send Invite')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
