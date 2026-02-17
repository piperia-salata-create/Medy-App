import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { compressChatImage } from '../../lib/chatImageCompression';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-states';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { ArrowLeft, Ban, CheckCheck, Flag, Image as ImageIcon, MessageCircle, Paperclip, Send } from 'lucide-react';
import { toast } from 'sonner';

const CHAT_ATTACHMENT_BUCKET = 'chat-attachments';

const formatDateTime = (value, locale = 'en-US') => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString(locale);
};

const normalizeAttachmentPath = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (raw.startsWith('conversations/')) {
    return raw;
  }
  try {
    const url = new URL(raw);
    const marker = '/storage/v1/object/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const suffix = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    if (!suffix.startsWith(`${CHAT_ATTACHMENT_BUCKET}/`)) return null;
    return suffix.slice(CHAT_ATTACHMENT_BUCKET.length + 1);
  } catch {
    return null;
  }
};

const ConversationList = React.memo(function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  ui
}) {
  return (
    <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
      <CardContent className="p-3 space-y-3">
        <div className="px-1 pb-1 border-b border-pharma-grey-pale">
          <p className="text-sm font-medium text-pharma-dark-slate">{ui.conversationsTitle}</p>
          <p className="text-xs text-pharma-slate-grey">{conversations.length} {ui.activeSuffix}</p>
        </div>
        {conversations.map((conv) => (
          <button
            key={conv.id}
            type="button"
            className={`w-full text-left rounded-xl px-3 py-2 border transition-colors ${activeConversationId === conv.id ? 'border-pharma-teal bg-pharma-ice-blue' : 'border-pharma-grey-pale bg-white hover:bg-pharma-ice-blue/50'}`}
            onClick={() => onSelectConversation(conv.id)}
            data-testid={`chat-conversation-${conv.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-pharma-dark-slate truncate">{conv.title}</p>
              <span className={`text-[11px] rounded-full px-2 py-0.5 ${
                conv.type === 'exchange'
                  ? 'bg-pharma-teal/10 text-pharma-teal'
                  : 'bg-pharma-steel-blue/10 text-pharma-steel-blue'
              }`}>
                {conv.type === 'exchange' ? ui.exchangeTag : ui.directTag}
              </span>
            </div>
            <p className="text-xs text-pharma-slate-grey truncate mt-0.5">{conv.subtitle}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
});

const ChatHeader = React.memo(function ChatHeader({
  activeConversation,
  activeConversationId,
  requestedByMe,
  requestedByOther,
  requestingCompletion,
  confirmingCompletion,
  reportingConversation,
  blockingUser,
  onCompleteConversation,
  onReportConversation,
  onBlockParticipant,
  ui
}) {
  return (
    <div className="px-4 py-3 border-b border-pharma-grey-pale">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-pharma-dark-slate">{activeConversation?.title || ui.conversationFallback}</p>
          <p className="text-xs text-pharma-slate-grey">{activeConversation?.subtitle || ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className={`rounded-full gap-1 ${
              requestedByOther
                ? '!border-pharma-teal !bg-pharma-teal !text-white hover:!bg-pharma-teal/90 hover:!text-white'
                : requestedByMe
                  ? 'border-pharma-teal/45 bg-pharma-teal/10 text-pharma-teal hover:border-pharma-teal/45 hover:bg-pharma-teal/10 hover:text-pharma-teal disabled:opacity-100'
                  : 'border-pharma-grey-pale text-pharma-slate-grey hover:border-pharma-teal hover:bg-pharma-teal hover:text-white'
            }`}
            onClick={onCompleteConversation}
            disabled={!activeConversationId || requestingCompletion || confirmingCompletion || requestedByMe}
            data-testid="chat-complete-btn"
          >
            <CheckCheck className="w-4 h-4" />
            <span className="hidden sm:inline">{ui.completeConversationShort}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full gap-1 text-pharma-slate-grey hover:bg-pharma-teal hover:text-white"
            onClick={onReportConversation}
            disabled={reportingConversation || !activeConversationId}
            data-testid="chat-report-btn"
          >
            <Flag className="w-4 h-4" />
            <span className="hidden sm:inline">{ui.report}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full gap-1 text-pharma-slate-grey hover:bg-pharma-teal hover:text-white"
            onClick={onBlockParticipant}
            disabled={blockingUser || !activeConversation?.otherUserId}
            data-testid="chat-block-btn"
          >
            <Ban className="w-4 h-4" />
            <span className="hidden sm:inline">{ui.block}</span>
          </Button>
        </div>
      </div>
      {requestedByOther && (
        <div className="mt-2 rounded-xl border border-pharma-coral/20 bg-pharma-coral/5 px-3 py-2 text-xs text-pharma-coral">
          {ui.completionBanner}
        </div>
      )}
    </div>
  );
});

const MessageList = React.memo(function MessageList({
  messages,
  userId,
  isGreek,
  activeContactLabel,
  ui,
  loadingMessages,
  onPreviewImage,
  messagesEndRef
}) {
  return (
    <div className="relative flex-1 overflow-y-auto px-4 py-3 bg-pharma-ice-blue/30">
      {messages.length === 0 ? (
        <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center">
          <MessageCircle className="w-8 h-8 text-pharma-slate-grey/60 mb-2" />
          <p className="text-sm font-medium text-pharma-dark-slate">{ui.noMessagesTitle}</p>
          <p className="text-xs text-pharma-slate-grey">{ui.noMessagesDesc}</p>
        </div>
      ) : (
        messages.map((msg, index) => {
          const mine = msg.sender_id === userId;
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const groupedWithPrevious = previous?.sender_id === msg.sender_id;
          const groupedWithNext = next?.sender_id === msg.sender_id;

          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} ${groupedWithPrevious ? 'mt-1' : 'mt-3'}`}>
              <div className="max-w-[86%]">
                {!groupedWithPrevious && (
                  <p className={`text-[11px] mb-1 ${mine ? 'text-right text-pharma-teal' : 'text-pharma-slate-grey'}`}>
                    {mine ? ui.you : activeContactLabel}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 ${
                    mine
                      ? 'bg-pharma-teal text-white rounded-br-md'
                      : 'bg-white border border-pharma-grey-pale text-pharma-charcoal rounded-bl-md'
                  }`}
                >
                  {msg.message_type === 'image' ? (
                    <div className="space-y-2">
                      {msg.attachment_signed_url ? (
                        <button
                          type="button"
                          className="block rounded-xl overflow-hidden border border-white/20 focus:outline-none focus:ring-2 focus:ring-pharma-teal/40"
                          onClick={() => onPreviewImage(msg.attachment_signed_url)}
                          data-testid={`chat-image-${msg.id}`}
                        >
                          <img
                            src={msg.attachment_signed_url}
                            alt={ui.imagePreview}
                            className="max-w-[220px] max-h-[220px] object-cover"
                          />
                        </button>
                      ) : (
                        <p className="text-sm">{ui.imageUnavailable}</p>
                      )}
                      {msg.body && (
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                  )}
                </div>
                {!groupedWithNext && (
                  <p className={`text-[11px] mt-1 ${mine ? 'text-right text-pharma-teal/80' : 'text-pharma-slate-grey'}`}>
                    {formatDateTime(msg.created_at, isGreek ? 'el-GR' : 'en-US')}
                  </p>
                )}
              </div>
            </div>
          );
        })
      )}
      {loadingMessages && (
        <div className="pointer-events-none absolute inset-x-4 top-3 rounded-xl border border-pharma-grey-pale bg-pharma-ice-blue/80 backdrop-blur-sm p-3 space-y-2">
          <Skeleton className="h-3 w-20 bg-pharma-grey-pale/80" />
          <Skeleton className="h-10 w-3/4 bg-pharma-grey-pale/80" />
          <Skeleton className="h-10 w-2/3 ml-auto bg-pharma-grey-pale/80" />
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
});

export default function PharmacistChatPage() {
  const { user, isPharmacist } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const userId = user?.id || null;
  const isGreek = language === 'el';
  const isPharmacistUser = isPharmacist();

  const ui = useMemo(() => ({
    headerTitle: isGreek ? 'Συνομιλίες' : 'Chats',
    headerHint: isGreek
      ? 'Μόνο συντονισμός ανταλλαγής. Η ολοκλήρωση γίνεται εκτός πλατφόρμας.'
      : 'Exchange coordination only. Completion is outside platform.',
    loadingConversations: isGreek ? 'Φόρτωση συνομιλιών...' : 'Loading conversations...',
    emptyConversationsTitle: isGreek ? 'Δεν υπάρχουν συνομιλίες ακόμη' : 'No conversations yet',
    emptyConversationsDesc: isGreek
      ? 'Εγκεκριμένα αιτήματα ανταλλαγής και άμεσα μηνύματα θα εμφανίζονται εδώ.'
      : 'Accepted exchange requests and direct messages will appear here.',
    conversationsTitle: isGreek ? 'Συνομιλίες' : 'Conversations',
    activeSuffix: isGreek ? 'ενεργές' : 'active',
    exchangeTag: isGreek ? 'Ανταλλαγή' : 'Exchange',
    directTag: isGreek ? 'Άμεσο' : 'DM',
    conversationFallback: isGreek ? 'Συνομιλία' : 'Conversation',
    report: isGreek ? 'Αναφορά' : 'Report',
    block: isGreek ? 'Αποκλεισμός' : 'Block',
    noMessagesTitle: isGreek ? 'Δεν υπάρχουν μηνύματα ακόμη' : 'No messages yet',
    noMessagesDesc: isGreek
      ? 'Ξεκινήστε τον συντονισμό αυτής της ανταλλαγής.'
      : 'Start coordinating this exchange thread.',
    you: isGreek ? 'Εσείς' : 'You',
    contact: isGreek ? 'Επαφή' : 'Contact',
    writeMessage: isGreek ? 'Γράψτε μήνυμα...' : 'Write a message...',
    send: isGreek ? 'Αποστολή' : 'Send',
    exchangeFallback: isGreek ? 'Ανταλλαγή' : 'Exchange',
    statusPrefix: isGreek ? 'Κατάσταση' : 'Status',
    exchangeConversation: isGreek ? 'Συνομιλία ανταλλαγής' : 'Exchange conversation',
    directMessage: isGreek ? 'Άμεσο μήνυμα' : 'Direct message',
    directConversation: isGreek ? 'Άμεση συνομιλία' : 'Direct conversation',
    loadConversationsError: isGreek ? 'Αποτυχία φόρτωσης συνομιλιών' : 'Failed to load conversations',
    loadMessagesError: isGreek ? 'Αποτυχία φόρτωσης μηνυμάτων' : 'Failed to load messages',
    sendMessageError: isGreek ? 'Αποτυχία αποστολής μηνύματος' : 'Failed to send message',
    blockConfirm: isGreek
      ? 'Να αποκλειστεί αυτή η επαφή φαρμακείου; Η ανταλλαγή μηνυμάτων θα απενεργοποιηθεί σε αυτή τη συνομιλία.'
      : 'Block this pharmacy contact? Messaging in this conversation will be disabled.',
    blockSuccess: isGreek ? 'Η επαφή αποκλείστηκε' : 'Contact blocked',
    blockError: isGreek ? 'Αποτυχία αποκλεισμού επαφής' : 'Failed to block contact',
    reportPrompt: isGreek ? 'Λόγος αναφοράς' : 'Report reason',
    reportSuccess: isGreek ? 'Η αναφορά καταχωρήθηκε' : 'Report submitted',
    reportError: isGreek ? 'Αποτυχία καταχώρησης αναφοράς' : 'Failed to submit report',
    attachImage: isGreek ? 'Επισύναψη εικόνας' : 'Attach image',
    uploadingImage: isGreek ? 'Ανέβασμα...' : 'Uploading...',
    imageUploadError: isGreek ? 'Αποτυχία ανεβάσματος εικόνας' : 'Failed to upload image',
    imageTooLarge: isGreek ? 'Η εικόνα παραμένει πολύ μεγάλη μετά τη συμπίεση' : 'Image is still too large after compression',
    imageUnsupported: isGreek ? 'Μη υποστηριζόμενο αρχείο εικόνας' : 'Unsupported image format',
    imagePreview: isGreek ? 'Προεπισκόπηση εικόνας' : 'Image preview',
    imageUnavailable: isGreek ? 'Η εικόνα δεν είναι διαθέσιμη' : 'Image unavailable',
    completeConversationShort: isGreek ? 'Ολοκλήρωση' : 'Complete',
    completionRequestedToast: isGreek ? 'Ζητήθηκε ολοκλήρωση συνομιλίας' : 'Conversation completion requested',
    completionRequestError: isGreek ? 'Αποτυχία αιτήματος ολοκλήρωσης' : 'Failed to request completion',
    completionBanner: isGreek ? 'Ζητήθηκε ολοκλήρωση από τον άλλο χρήστη.' : 'The other user requested completion.',
    completionConfirmTitle: isGreek ? 'Ολοκλήρωση συνομιλίας' : 'Complete conversation',
    completionConfirmDesc: isGreek ? 'Κλείσιμο & διαγραφή συνομιλίας;' : 'Close & delete conversation?',
    completionConfirmLong: isGreek
      ? 'Ο άλλος φαρμακοποιός ζήτησε ολοκλήρωση. Θέλεις να κλείσει και να διαγραφεί η συνομιλία;'
      : 'The other pharmacist requested completion. Do you want to close and delete this conversation?',
    completionDeleteAction: isGreek ? 'Κλείσιμο & διαγραφή' : 'Close & delete',
    completionCancelled: isGreek ? 'Άκυρο' : 'Cancel',
    completionDeleteError: isGreek ? 'Αποτυχία ολοκλήρωσης και διαγραφής' : 'Failed to close and delete conversation',
    completionDeletedToast: isGreek ? 'Η συνομιλία διαγράφηκε' : 'Conversation deleted'
  }), [isGreek]);

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(conversationId || null);
  const [messages, setMessages] = useState([]);
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [reportingConversation, setReportingConversation] = useState(false);
  const [requestingCompletion, setRequestingCompletion] = useState(false);
  const [confirmingCompletion, setConfirmingCompletion] = useState(false);
  const [completionConfirmOpen, setCompletionConfirmOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const initialConversationIdRef = useRef(conversationId || null);
  const hasLoadedConversationsRef = useRef(false);
  const activeConversationIdRef = useRef(conversationId || null);
  const messagesCacheRef = useRef(new Map());
  const messageLoadMetricCounterRef = useRef(0);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/pharmacist/inter-pharmacy');
  }, [navigate]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );
  const activeContactLabel = activeConversation?.contactLabel || ui.contact;

  const requestedByMe = Boolean(activeConversation?.close_requested_by && activeConversation.close_requested_by === userId);
  const requestedByOther = Boolean(activeConversation?.close_requested_by && activeConversation.close_requested_by !== userId);

  const handleConversationSelect = useCallback((nextConversationId) => {
    setActiveConversationId((currentId) => (currentId === nextConversationId ? currentId : nextConversationId));
    navigate(`/pharmacist/chats/${nextConversationId}`);
  }, [navigate]);

  const handlePreviewImage = useCallback((signedUrl) => {
    setPreviewImageUrl(signedUrl);
  }, []);

  const loadMessages = useCallback(async (targetConversationId, { showLoader = true } = {}) => {
    if (!targetConversationId) {
      setMessages([]);
      setLoadingMessages(false);
      return [];
    }

    const metricLabel = `CHAT_LOAD:${targetConversationId}:${++messageLoadMetricCounterRef.current}`;
    if (process.env.NODE_ENV !== 'production') {
      console.time(metricLabel);
    }
    if (showLoader && activeConversationIdRef.current === targetConversationId) {
      setLoadingMessages(true);
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, created_at, message_type, attachment_url, attachment_mime, attachment_size, attachment_width, attachment_height')
        .eq('conversation_id', targetConversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = data || [];
      const withSignedUrls = await Promise.all(
        rows.map(async (row) => {
          if (row?.message_type !== 'image') {
            return row;
          }
          const attachmentPath = normalizeAttachmentPath(row?.attachment_url);
          if (!attachmentPath) {
            return { ...row, attachment_signed_url: null };
          }
          const { data: signedData, error: signedError } = await supabase
            .storage
            .from(CHAT_ATTACHMENT_BUCKET)
            .createSignedUrl(attachmentPath, 60 * 60);
          if (signedError) {
            return { ...row, attachment_signed_url: null };
          }
          return { ...row, attachment_signed_url: signedData?.signedUrl || null };
        })
      );

      messagesCacheRef.current.set(targetConversationId, withSignedUrls);
      if (activeConversationIdRef.current === targetConversationId) {
        setMessages(withSignedUrls);
      }
      return withSignedUrls;
    } finally {
      if (showLoader && activeConversationIdRef.current === targetConversationId) {
        setLoadingMessages(false);
      }
      if (process.env.NODE_ENV !== 'production') {
        console.timeEnd(metricLabel);
      }
    }
  }, []);

  const loadConversations = useCallback(async ({ background = false, preferredConversationId = null } = {}) => {
    if (!userId) {
      setLoadingConversations(false);
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      setLoadingMessages(false);
      messagesCacheRef.current.clear();
      hasLoadedConversationsRef.current = false;
      return;
    }

    const showBlockingLoader = !background && !hasLoadedConversationsRef.current;
    if (showBlockingLoader) {
      setLoadingConversations(true);
    }

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
        setLoadingMessages(false);
        messagesCacheRef.current.clear();
        return;
      }

      const [convRes, membersRes] = await Promise.all([
        supabase
          .from('conversations')
          .select('id, type, exchange_request_id, created_at, close_requested_by, close_requested_at')
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

      const profilePromise = allMemberIds.length > 0
        ? supabase
          .from('profiles')
          .select('id, full_name, email, pharmacy_name')
          .in('id', allMemberIds)
        : Promise.resolve({ data: [], error: null });
      const ownerPharmacyPromise = allMemberIds.length > 0
        ? supabase
          .from('pharmacies')
          .select('id, owner_id, name')
          .in('owner_id', allMemberIds)
        : Promise.resolve({ data: [], error: null });

      const [
        { data: profileRows, error: profileError },
        { data: connectionProfileRows, error: connectionProfileError },
        { data: ownerPharmacyRows, error: ownerPharmacyError }
      ] = await Promise.all([
        profilePromise,
        supabase.rpc('get_my_pharmacist_connections'),
        ownerPharmacyPromise
      ]);

      if (profileError) throw profileError;

      const profilesById = new Map((profileRows || []).map((row) => [row.id, row]));
      let connectionProfilesByUserId = new Map();
      if (connectionProfileError) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Unable to load connected pharmacist labels for chats:', connectionProfileError);
        }
      } else {
        connectionProfilesByUserId = new Map(
          (connectionProfileRows || [])
            .filter((row) => row?.other_pharmacist_id)
            .map((row) => [row.other_pharmacist_id, row])
        );
      }

      let pharmaciesByOwnerId = new Map();
      if (!ownerPharmacyError) {
        pharmaciesByOwnerId = new Map(
          (ownerPharmacyRows || [])
            .filter((row) => row?.owner_id)
            .map((row) => [row.owner_id, row])
        );
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('Unable to load pharmacy-by-owner labels for chats:', ownerPharmacyError);
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
          const medicineIds = Array.from(new Set((offerRows || []).map((row) => row.medicine_id).filter(Boolean)));

          const pharmacyPromise = pharmacyIds.length > 0
            ? supabase
              .from('pharmacies')
              .select('id, name')
              .in('id', pharmacyIds)
            : Promise.resolve({ data: [], error: null });
          const medicinePromise = medicineIds.length > 0
            ? supabase
              .from('medicines')
              .select('id, name')
              .in('id', medicineIds)
            : Promise.resolve({ data: [], error: null });

          const [
            { data: pharmacyRows, error: pharmacyError },
            { data: medicineRows, error: medicineError }
          ] = await Promise.all([pharmacyPromise, medicinePromise]);

          if (pharmacyError) throw pharmacyError;
          if (medicineError) throw medicineError;

          pharmaciesById = new Map((pharmacyRows || []).map((row) => [row.id, row]));
          medicinesById = new Map((medicineRows || []).map((row) => [row.id, row]));
        }
      }

      const membersByConversation = membersRows.reduce((acc, row) => {
        if (!acc[row.conversation_id]) acc[row.conversation_id] = [];
        acc[row.conversation_id].push(row.user_id);
        return acc;
      }, {});

      const summaryRows = convRows.map((conv) => {
        const memberIds = membersByConversation[conv.id] || [];
        const otherUserId = memberIds.find((id) => id !== userId) || null;

        if (conv.type === 'exchange') {
          const req = requestsById.get(conv.exchange_request_id);
          const offer = offersById.get(req?.offer_id);
          const medicine = medicinesById.get(offer?.medicine_id);
          const offerPharmacy = pharmaciesById.get(offer?.pharmacy_id);
          const reqPharmacy = pharmaciesById.get(req?.requesting_pharmacy_id);
          return {
            ...conv,
            otherUserId,
            title: `${medicine?.name || ui.exchangeFallback} - ${offerPharmacy?.name || '-'} -> ${reqPharmacy?.name || '-'}`,
            subtitle: req?.status ? `${ui.statusPrefix}: ${req.status}` : ui.exchangeConversation,
            contactLabel: reqPharmacy?.name || offerPharmacy?.name || ui.contact
          };
        }

        const resolvedOtherUserId = otherUserId || memberIds[0] || null;
        const otherProfile = profilesById.get(resolvedOtherUserId);
        const connectedProfile = connectionProfilesByUserId.get(resolvedOtherUserId);
        const ownerPharmacy = pharmaciesByOwnerId.get(resolvedOtherUserId);
        const directTitle =
          connectedProfile?.other_pharmacy_name
          || otherProfile?.pharmacy_name
          || ownerPharmacy?.name
          || connectedProfile?.other_full_name
          || otherProfile?.full_name
          || otherProfile?.email
          || ui.directMessage;
        const directSubtitleCandidate =
          connectedProfile?.other_full_name
          || otherProfile?.full_name
          || ui.directConversation;
        return {
          ...conv,
          otherUserId: resolvedOtherUserId,
          title: directTitle,
          subtitle: directSubtitleCandidate === directTitle ? ui.directConversation : directSubtitleCandidate,
          contactLabel:
            connectedProfile?.other_full_name
            || connectedProfile?.other_pharmacy_name
            || otherProfile?.full_name
            || ownerPharmacy?.name
            || ui.contact
        };
      });

      const validConversationIds = new Set(summaryRows.map((row) => row.id));
      for (const cachedConversationId of messagesCacheRef.current.keys()) {
        if (!validConversationIds.has(cachedConversationId)) {
          messagesCacheRef.current.delete(cachedConversationId);
        }
      }

      setConversations(summaryRows);
      setActiveConversationId((currentId) => {
        if (preferredConversationId && summaryRows.some((row) => row.id === preferredConversationId)) {
          return preferredConversationId;
        }
        if (currentId && summaryRows.some((row) => row.id === currentId)) {
          return currentId;
        }
        return summaryRows[0]?.id || null;
      });
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast.error(error?.message || ui.loadConversationsError);
    } finally {
      hasLoadedConversationsRef.current = true;
      if (showBlockingLoader) {
        setLoadingConversations(false);
      }
    }
  }, [userId, ui]);

  useEffect(() => {
    if (!isPharmacistUser) {
      navigate('/patient');
      return;
    }
    loadConversations({ preferredConversationId: initialConversationIdRef.current });
  }, [isPharmacistUser, loadConversations, navigate]);

  useEffect(() => {
    if (!conversationId) return;
    setActiveConversationId((currentId) => {
      if (currentId === conversationId) return currentId;
      if (!conversations.some((row) => row.id === conversationId)) return currentId;
      return conversationId;
    });
  }, [conversationId, conversations]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    const cachedMessages = messagesCacheRef.current.get(activeConversationId);
    if (cachedMessages) {
      setMessages(cachedMessages);
      setLoadingMessages(false);
      loadMessages(activeConversationId, { showLoader: false }).catch((error) => {
        console.error('Error refreshing messages:', error);
      });
      return;
    }

    loadMessages(activeConversationId).catch((error) => {
      console.error('Error loading messages:', error);
      toast.error(error?.message || ui.loadMessagesError);
    });
  }, [activeConversationId, loadMessages, ui.loadMessagesError]);

  useEffect(() => {
    if (!activeConversationId) return undefined;

    const channel = supabase
      .channel(`conversation_messages:${activeConversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversationId}` },
        () => {
          loadMessages(activeConversationId, { showLoader: false }).catch((error) => {
            console.error('Error refreshing messages from realtime:', error);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    if (!activeConversationId) return undefined;

    const channel = supabase
      .channel(`conversation_state:${activeConversationId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${activeConversationId}` },
        (payload) => {
          if (payload?.new && typeof payload.new === 'object') {
            setConversations((previousRows) => previousRows.map((row) => (
              row.id === activeConversationId
                ? {
                  ...row,
                  close_requested_by: payload.new.close_requested_by ?? null,
                  close_requested_at: payload.new.close_requested_at ?? null
                }
                : row
            )));
            return;
          }
          loadConversations({ background: true, preferredConversationId: activeConversationId }).catch((error) => {
            console.error('Error refreshing conversations from realtime:', error);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, loadConversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    const frame = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeConversationId, messages.length]);

  const sendMessage = useCallback(async () => {
    const body = messageBody.trim();
    if (!body || !activeConversationId || !userId) return;

    setSending(true);
    try {
      const { error } = await supabase.rpc('send_message', {
        p_conversation_id: activeConversationId,
        p_body: body
      });
      if (error) throw error;
      setMessageBody('');
      await loadMessages(activeConversationId, { showLoader: false });
    } catch (error) {
      toast.error(error?.message || ui.sendMessageError);
    } finally {
      setSending(false);
    }
  }, [activeConversationId, loadMessages, messageBody, ui.sendMessageError, userId]);

  const openImagePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const uploadImageMessage = useCallback(async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';

    if (!file || !activeConversationId || !userId) return;
    if (!file.type || !file.type.startsWith('image/')) {
      toast.error(ui.imageUnsupported);
      return;
    }

    setUploadingImage(true);
    try {
      const compressed = await compressChatImage(file);
      if (compressed.size > 600 * 1024) {
        throw new Error(ui.imageTooLarge);
      }

      const attachmentId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const attachmentPath = `conversations/${activeConversationId}/${attachmentId}.jpg`;

      const { error: uploadError } = await supabase
        .storage
        .from(CHAT_ATTACHMENT_BUCKET)
        .upload(attachmentPath, compressed.blob, {
          contentType: compressed.mime,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: messageError } = await supabase.rpc('send_image_message', {
        p_conversation_id: activeConversationId,
        p_attachment_url: attachmentPath,
        p_attachment_mime: compressed.mime,
        p_attachment_size: compressed.size,
        p_attachment_width: compressed.width,
        p_attachment_height: compressed.height,
        p_body: null
      });

      if (messageError) {
        await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).remove([attachmentPath]);
        throw messageError;
      }

      await loadMessages(activeConversationId, { showLoader: false });
    } catch (error) {
      const fallback = error?.message === 'Unsupported image format'
        ? ui.imageUnsupported
        : (error?.message || ui.imageUploadError);
      toast.error(fallback);
    } finally {
      setUploadingImage(false);
    }
  }, [activeConversationId, loadMessages, ui.imageTooLarge, ui.imageUnsupported, ui.imageUploadError, userId]);

  const requestConversationCompletion = useCallback(async () => {
    if (!activeConversationId) return;
    setRequestingCompletion(true);
    try {
      const { error } = await supabase.rpc('request_conversation_completion', {
        p_conversation_id: activeConversationId
      });
      if (error) throw error;
      toast.success(ui.completionRequestedToast);
      await loadConversations({ background: true, preferredConversationId: activeConversationId });
    } catch (error) {
      toast.error(error?.message || ui.completionRequestError);
    } finally {
      setRequestingCompletion(false);
    }
  }, [activeConversationId, loadConversations, ui.completionRequestError, ui.completionRequestedToast]);

  const confirmConversationDelete = useCallback(async () => {
    if (!activeConversationId) return;
    setConfirmingCompletion(true);
    try {
      const { error } = await supabase.rpc('delete_conversation_if_both_confirm', {
        p_conversation_id: activeConversationId
      });
      if (error) throw error;

      setCompletionConfirmOpen(false);
      toast.success(ui.completionDeletedToast);
      await loadConversations({ background: true });
      navigate('/pharmacist/chats');
    } catch (error) {
      toast.error(error?.message || ui.completionDeleteError);
    } finally {
      setConfirmingCompletion(false);
    }
  }, [activeConversationId, loadConversations, navigate, ui.completionDeleteError, ui.completionDeletedToast]);

  const completeConversation = useCallback(() => {
    if (!activeConversationId) return;
    if (requestedByOther) {
      setCompletionConfirmOpen(true);
      return;
    }
    requestConversationCompletion();
  }, [activeConversationId, requestConversationCompletion, requestedByOther]);

  const blockParticipant = useCallback(async () => {
    const targetUserId = activeConversation?.otherUserId;
    if (!targetUserId || !userId) return;

    const confirmed = window.confirm(ui.blockConfirm);
    if (!confirmed) return;

    setBlockingUser(true);
    try {
      const { error } = await supabase
        .from('chat_blocks')
        .insert({
          blocker_user_id: userId,
          blocked_user_id: targetUserId
        });
      if (error && error.code !== '23505') throw error;
      toast.success(ui.blockSuccess);
    } catch (error) {
      toast.error(error?.message || ui.blockError);
    } finally {
      setBlockingUser(false);
    }
  }, [activeConversation?.otherUserId, ui.blockConfirm, ui.blockError, ui.blockSuccess, userId]);

  const reportConversation = useCallback(async () => {
    if (!activeConversationId || !userId) return;

    const reason = (window.prompt(ui.reportPrompt) || '').trim();
    if (!reason) return;

    setReportingConversation(true);
    try {
      const { error } = await supabase
        .from('chat_reports')
        .insert({
          reporter_user_id: userId,
          conversation_id: activeConversationId,
          reason
        });
      if (error) throw error;
      toast.success(ui.reportSuccess);
    } catch (error) {
      toast.error(error?.message || ui.reportError);
    } finally {
      setReportingConversation(false);
    }
  }, [activeConversationId, ui.reportError, ui.reportPrompt, ui.reportSuccess, userId]);

  if (!isPharmacistUser) return null;

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="pharmacist-chat-page">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={handleBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-heading font-semibold text-pharma-dark-slate">{ui.headerTitle}</h1>
          <p className="text-xs text-pharma-slate-grey">{ui.headerHint}</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loadingConversations ? (
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
            <CardContent className="p-6 text-sm text-pharma-slate-grey">{ui.loadingConversations}</CardContent>
          </Card>
        ) : conversations.length === 0 ? (
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
            <CardContent className="p-6">
              <EmptyState
                icon={MessageCircle}
                title={ui.emptyConversationsTitle}
                description={ui.emptyConversationsDesc}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
            <ConversationList
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={handleConversationSelect}
              ui={ui}
            />

            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-0 flex flex-col min-h-[60vh]">
                <ChatHeader
                  activeConversation={activeConversation}
                  activeConversationId={activeConversationId}
                  requestedByMe={requestedByMe}
                  requestedByOther={requestedByOther}
                  requestingCompletion={requestingCompletion}
                  confirmingCompletion={confirmingCompletion}
                  reportingConversation={reportingConversation}
                  blockingUser={blockingUser}
                  onCompleteConversation={completeConversation}
                  onReportConversation={reportConversation}
                  onBlockParticipant={blockParticipant}
                  ui={ui}
                />
                <MessageList
                  messages={messages}
                  userId={userId}
                  isGreek={isGreek}
                  activeContactLabel={activeContactLabel}
                  ui={ui}
                  loadingMessages={loadingMessages}
                  onPreviewImage={handlePreviewImage}
                  messagesEndRef={messagesEndRef}
                />
                <div className="px-4 py-3 border-t border-pharma-grey-pale bg-white">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={uploadImageMessage}
                      data-testid="chat-image-input"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full gap-1.5"
                      onClick={openImagePicker}
                      disabled={uploadingImage || !activeConversationId}
                      data-testid="chat-attach-image-btn"
                    >
                      {uploadingImage ? <ImageIcon className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                      <span className="hidden sm:inline">{uploadingImage ? ui.uploadingImage : ui.attachImage}</span>
                    </Button>
                    <Input
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      placeholder={ui.writeMessage}
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
                      disabled={sending || uploadingImage || !activeConversationId}
                      data-testid="chat-send-btn"
                    >
                      <Send className="w-4 h-4" />
                      {ui.send}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <Dialog open={Boolean(previewImageUrl)} onOpenChange={(open) => { if (!open) setPreviewImageUrl(null); }}>
        <DialogContent className="bg-white rounded-2xl max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-pharma-dark-slate">{ui.imagePreview}</DialogTitle>
            <DialogDescription className="sr-only">
              {isGreek ? 'Προβολή συνημμένης εικόνας σε πλήρες μέγεθος.' : 'View attached image in full size.'}
            </DialogDescription>
          </DialogHeader>
          {previewImageUrl ? (
            <img src={previewImageUrl} alt={ui.imagePreview} className="w-full max-h-[70vh] object-contain rounded-xl" />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={completionConfirmOpen} onOpenChange={setCompletionConfirmOpen}>
        <DialogContent className="bg-white rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-pharma-dark-slate">
              {ui.completionConfirmTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {ui.completionConfirmLong}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-pharma-slate-grey">
            <p className="font-medium text-pharma-dark-slate">{ui.completionConfirmDesc}</p>
            <p>{ui.completionConfirmLong}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setCompletionConfirmOpen(false)}
            >
              {ui.completionCancelled}
            </Button>
            <Button
              type="button"
              className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90 text-white"
              onClick={confirmConversationDelete}
              disabled={confirmingCompletion}
              data-testid="chat-confirm-complete-delete-btn"
            >
              {ui.completionDeleteAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
