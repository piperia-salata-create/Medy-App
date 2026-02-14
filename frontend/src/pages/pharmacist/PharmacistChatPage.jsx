import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-states';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';

const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
};

export default function PharmacistChatPage() {
  const { user, isPharmacist } = useAuth();
  useLanguage();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const userId = user?.id || null;

  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(conversationId || null);
  const [messages, setMessages] = useState([]);
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const loadMessages = useCallback(async (targetConversationId) => {
    if (!targetConversationId) {
      setMessages([]);
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .eq('conversation_id', targetConversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    setMessages(data || []);
  }, []);

  const loadConversations = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: membershipRows, error: membershipError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);
      if (membershipError) throw membershipError;

      const conversationIds = Array.from(
        new Set((membershipRows || []).map((row) => row.conversation_id).filter(Boolean))
      );

      if (conversationIds.length === 0) {
        setConversations([]);
        setActiveConversationId(null);
        setMessages([]);
        return;
      }

      const [convRes, membersRes] = await Promise.all([
        supabase
          .from('conversations')
          .select('id, type, exchange_request_id, created_at')
          .in('id', conversationIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('conversation_members')
          .select('conversation_id, user_id')
          .in('conversation_id', conversationIds)
      ]);

      if (convRes.error) throw convRes.error;
      if (membersRes.error) throw membersRes.error;

      const convRows = convRes.data || [];
      const membersRows = membersRes.data || [];

      const exchangeRequestIds = Array.from(
        new Set(convRows.map((row) => row.exchange_request_id).filter(Boolean))
      );
      const allMemberIds = Array.from(new Set(membersRows.map((row) => row.user_id).filter(Boolean)));

      let profilesById = new Map();
      if (allMemberIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email, pharmacy_name')
          .in('id', allMemberIds);
        if (profileError) throw profileError;
        profilesById = new Map((profileRows || []).map((row) => [row.id, row]));
      }

      let requestsById = new Map();
      let offersById = new Map();
      let pharmaciesById = new Map();
      let medicinesById = new Map();

      if (exchangeRequestIds.length > 0) {
        const { data: requestRows, error: requestError } = await supabase
          .from('exchange_requests')
          .select('id, offer_id, requesting_pharmacy_id, status')
          .in('id', exchangeRequestIds);
        if (requestError) throw requestError;
        requestsById = new Map((requestRows || []).map((row) => [row.id, row]));

        const offerIds = Array.from(new Set((requestRows || []).map((row) => row.offer_id).filter(Boolean)));
        if (offerIds.length > 0) {
          const { data: offerRows, error: offerError } = await supabase
            .from('exchange_offers')
            .select('id, pharmacy_id, medicine_id')
            .in('id', offerIds);
          if (offerError) throw offerError;
          offersById = new Map((offerRows || []).map((row) => [row.id, row]));

          const pharmacyIds = Array.from(
            new Set(
              (offerRows || [])
                .map((row) => row.pharmacy_id)
                .concat((requestRows || []).map((row) => row.requesting_pharmacy_id))
                .filter(Boolean)
            )
          );
          if (pharmacyIds.length > 0) {
            const { data: pharmacyRows, error: pharmacyError } = await supabase
              .from('pharmacies')
              .select('id, name')
              .in('id', pharmacyIds);
            if (pharmacyError) throw pharmacyError;
            pharmaciesById = new Map((pharmacyRows || []).map((row) => [row.id, row]));
          }

          const medicineIds = Array.from(new Set((offerRows || []).map((row) => row.medicine_id).filter(Boolean)));
          if (medicineIds.length > 0) {
            const { data: medicineRows, error: medicineError } = await supabase
              .from('medicines')
              .select('id, name')
              .in('id', medicineIds);
            if (medicineError) throw medicineError;
            medicinesById = new Map((medicineRows || []).map((row) => [row.id, row]));
          }
        }
      }

      const membersByConversation = membersRows.reduce((acc, row) => {
        if (!acc[row.conversation_id]) acc[row.conversation_id] = [];
        acc[row.conversation_id].push(row.user_id);
        return acc;
      }, {});

      const summaryRows = convRows.map((conv) => {
        if (conv.type === 'exchange') {
          const req = requestsById.get(conv.exchange_request_id);
          const offer = offersById.get(req?.offer_id);
          const medicine = medicinesById.get(offer?.medicine_id);
          const offerPharmacy = pharmaciesById.get(offer?.pharmacy_id);
          const reqPharmacy = pharmaciesById.get(req?.requesting_pharmacy_id);
          return {
            ...conv,
            title: `${medicine?.name || 'Exchange'} - ${offerPharmacy?.name || '-'} -> ${reqPharmacy?.name || '-'}`,
            subtitle: req?.status ? `Status: ${req.status}` : 'Exchange conversation'
          };
        }

        const memberIds = membersByConversation[conv.id] || [];
        const otherUserId = memberIds.find((id) => id !== userId) || memberIds[0] || null;
        const otherProfile = profilesById.get(otherUserId);
        return {
          ...conv,
          title: otherProfile?.full_name || otherProfile?.pharmacy_name || otherProfile?.email || 'Direct message',
          subtitle: otherProfile?.pharmacy_name || 'Direct conversation'
        };
      });

      setConversations(summaryRows);
      if (conversationId && summaryRows.some((row) => row.id === conversationId)) {
        setActiveConversationId(conversationId);
      } else if (!activeConversationId || !summaryRows.some((row) => row.id === activeConversationId)) {
        setActiveConversationId(summaryRows[0]?.id || null);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast.error(error?.message || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [activeConversationId, conversationId, userId]);

  useEffect(() => {
    if (!isPharmacist()) {
      navigate('/patient');
      return;
    }
    loadConversations();
  }, [isPharmacist, loadConversations, navigate]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    loadMessages(activeConversationId).catch((error) => {
      console.error('Error loading messages:', error);
      toast.error(error?.message || 'Failed to load messages');
    });
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    if (!activeConversationId) return undefined;

    const channel = supabase
      .channel(`conversation_messages:${activeConversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversationId}` },
        () => loadMessages(activeConversationId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, loadMessages]);

  const sendMessage = async () => {
    const body = messageBody.trim();
    if (!body || !activeConversationId || !userId) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: activeConversationId,
          sender_id: userId,
          body
        });
      if (error) throw error;
      setMessageBody('');
      await loadMessages(activeConversationId);
    } catch (error) {
      toast.error(error?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (!isPharmacist()) return null;

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="pharmacist-chat-page">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link to="/pharmacist">
            <Button variant="ghost" size="sm" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-heading font-semibold text-pharma-dark-slate">Chats</h1>
          <p className="text-xs text-pharma-slate-grey">Exchange coordination only. Completion is outside platform.</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-sm text-pharma-slate-grey">Loading...</div>
        ) : conversations.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No conversations yet" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[300px,1fr]">
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-3 space-y-2">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    className={`w-full text-left rounded-xl px-3 py-2 border ${activeConversationId === conv.id ? 'border-pharma-teal bg-pharma-ice-blue' : 'border-pharma-grey-pale bg-white'}`}
                    onClick={() => {
                      setActiveConversationId(conv.id);
                      navigate(`/pharmacist/chats/${conv.id}`);
                    }}
                    data-testid={`chat-conversation-${conv.id}`}
                  >
                    <p className="text-sm font-medium text-pharma-dark-slate truncate">{conv.title}</p>
                    <p className="text-xs text-pharma-slate-grey truncate">{conv.subtitle}</p>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-4 flex flex-col min-h-[60vh]">
                <div className="mb-3">
                  <p className="font-medium text-pharma-dark-slate">{activeConversation?.title || 'Conversation'}</p>
                  <p className="text-xs text-pharma-slate-grey">{activeConversation?.subtitle || ''}</p>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {messages.length === 0 ? (
                    <p className="text-sm text-pharma-slate-grey">No messages yet.</p>
                  ) : (
                    messages.map((msg) => {
                      const mine = msg.sender_id === userId;
                      return (
                        <div key={msg.id} className={`max-w-[85%] rounded-xl px-3 py-2 ${mine ? 'ml-auto bg-pharma-teal text-white' : 'bg-pharma-ice-blue text-pharma-charcoal'}`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                          <p className={`text-[11px] mt-1 ${mine ? 'text-white/80' : 'text-pharma-slate-grey'}`}>{formatDateTime(msg.created_at)}</p>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Write a message..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    data-testid="chat-message-input"
                  />
                  <Button
                    className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90 text-white gap-1.5"
                    onClick={sendMessage}
                    disabled={sending || !activeConversationId}
                    data-testid="chat-send-btn"
                  >
                    <Send className="w-4 h-4" />
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
