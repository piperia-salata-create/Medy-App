import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-states';
import { ArrowLeft, Bell, Check, MessageCircle, Package, Pill } from 'lucide-react';
import { toast } from 'sonner';

const toSafeObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
};

const getNotificationKindMeta = (kind) => {
  const normalized = (kind || '').toLowerCase();
  if (normalized === 'chat_message') {
    return {
      label: 'Chat message',
      Icon: MessageCircle,
      iconClass: 'text-pharma-royal-blue',
      chipClass: 'bg-pharma-royal-blue/10 text-pharma-royal-blue'
    };
  }
  if (normalized === 'demand_match') {
    return {
      label: 'Demand match',
      Icon: Pill,
      iconClass: 'text-pharma-steel-blue',
      chipClass: 'bg-pharma-steel-blue/10 text-pharma-steel-blue'
    };
  }
  if (normalized === 'offer_match') {
    return {
      label: 'Offer match',
      Icon: Package,
      iconClass: 'text-pharma-teal',
      chipClass: 'bg-pharma-teal/10 text-pharma-teal'
    };
  }
  return {
    label: 'Update',
    Icon: Bell,
    iconClass: 'text-pharma-slate-grey',
    chipClass: 'bg-pharma-slate-grey/10 text-pharma-slate-grey'
  };
};

export default function PharmacistNotificationsPage() {
  const { user, isPharmacist } = useAuth();
  useLanguage();
  const navigate = useNavigate();
  const userId = user?.id || null;

  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [busyNotificationId, setBusyNotificationId] = useState(null);

  const unreadCount = useMemo(
    () => (notifications || []).filter((notification) => !notification.read_at).length,
    [notifications]
  );

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('exchange_notifications')
        .select('id, kind, title, body, data, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Failed to load exchange notifications:', error);
      toast.error(error?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isPharmacist()) {
      navigate('/patient');
      return;
    }
    loadNotifications();
  }, [isPharmacist, loadNotifications, navigate]);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`exchange_notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exchange_notifications',
          filter: `recipient_user_id=eq.${userId}`
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, userId]);

  const markNotificationRead = useCallback(async (notificationId) => {
    if (!notificationId) return;

    const timestamp = new Date().toISOString();
    const { error } = await supabase
      .from('exchange_notifications')
      .update({ read_at: timestamp })
      .eq('id', notificationId)
      .is('read_at', null);

    if (error) throw error;

    setNotifications((previous) =>
      previous.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read_at: notification.read_at || timestamp }
          : notification
      )
    );
  }, []);

  const markAllAsRead = async () => {
    setMarkingAll(true);
    try {
      const { error } = await supabase.rpc('mark_exchange_notifications_read', {
        p_before: null
      });
      if (error) throw error;
      const timestamp = new Date().toISOString();
      setNotifications((previous) =>
        previous.map((notification) =>
          notification.read_at ? notification : { ...notification, read_at: timestamp }
        )
      );
    } catch (error) {
      toast.error(error?.message || 'Failed to mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  const openNotification = async (notification) => {
    if (!notification) return;

    setBusyNotificationId(notification.id);
    try {
      if (!notification.read_at) {
        await markNotificationRead(notification.id);
      }

      const data = toSafeObject(notification.data);
      const conversationId = typeof data.conversation_id === 'string' ? data.conversation_id : null;
      const exchangeRequestId = typeof data.exchange_request_id === 'string' ? data.exchange_request_id : null;
      const medicineId = typeof data.medicine_id === 'string' ? data.medicine_id : null;

      if (conversationId) {
        navigate(`/pharmacist/chats/${conversationId}`);
        return;
      }

      if (exchangeRequestId) {
        const { data: resolvedConversationId, error } = await supabase.rpc('get_or_create_exchange_conversation', {
          p_exchange_request_id: exchangeRequestId
        });
        if (error) throw error;
        if (resolvedConversationId) {
          navigate(`/pharmacist/chats/${resolvedConversationId}`);
          return;
        }
      }

      if (medicineId) {
        navigate(`/pharmacist/inter-pharmacy?medicine_id=${encodeURIComponent(medicineId)}`);
        return;
      }

      navigate('/pharmacist/inter-pharmacy');
    } catch (error) {
      toast.error(error?.message || 'Unable to open notification target');
    } finally {
      setBusyNotificationId(null);
    }
  };

  if (!isPharmacist()) return null;

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="pharmacist-notifications-page">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link to="/pharmacist">
            <Button variant="ghost" size="sm" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Bell className="w-5 h-5 text-pharma-teal" />
          <h1 className="font-heading font-semibold text-pharma-dark-slate">Notifications</h1>
          <span className="text-xs rounded-full px-2 py-0.5 bg-pharma-teal/10 text-pharma-teal">
            Unread: {unreadCount}
          </span>
          <span className="hidden sm:inline-flex text-xs rounded-full px-2 py-0.5 bg-pharma-slate-grey/10 text-pharma-slate-grey">
            Total: {notifications.length}
          </span>
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              disabled={markingAll || unreadCount === 0}
              onClick={markAllAsRead}
              data-testid="exchange-mark-all-read-btn"
            >
              <Check className="w-4 h-4" />
              Mark all read
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
            <CardContent className="p-6 text-sm text-pharma-slate-grey">Loading notifications...</CardContent>
          </Card>
        ) : notifications.length === 0 ? (
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
            <CardContent className="p-6">
              <EmptyState icon={Bell} title="No notifications yet" description="Match alerts and conversation updates will appear here." />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const unread = !notification.read_at;
              const targetBusy = busyNotificationId === notification.id;
              const kindMeta = getNotificationKindMeta(notification.kind);
              const KindIcon = kindMeta.Icon;
              return (
                <Card
                  key={notification.id}
                  className={`bg-white rounded-2xl shadow-card border-pharma-grey-pale ${unread ? 'border-l-4 border-l-pharma-teal' : ''}`}
                  data-testid={`exchange-notification-${notification.id}`}
                >
                  <CardContent className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-pharma-ice-blue flex items-center justify-center">
                        <KindIcon className={`w-4 h-4 ${kindMeta.iconClass}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`text-sm ${unread ? 'font-semibold text-pharma-dark-slate' : 'font-medium text-pharma-charcoal'}`}>
                            {notification.title}
                          </p>
                          <span className={`text-[11px] rounded-full px-2 py-0.5 ${kindMeta.chipClass}`}>
                            {kindMeta.label}
                          </span>
                          {unread && <span className="w-2 h-2 rounded-full bg-pharma-teal" aria-hidden />}
                        </div>
                        <p className="text-sm text-pharma-slate-grey mt-1">{notification.body}</p>
                        <p className="text-xs text-pharma-silver mt-2">{formatDateTime(notification.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {unread && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full gap-1"
                          onClick={() => markNotificationRead(notification.id).catch((error) => {
                            toast.error(error?.message || 'Failed to mark as read');
                          })}
                          data-testid={`exchange-mark-read-${notification.id}`}
                        >
                          <Check className="w-4 h-4" />
                          <span className="hidden sm:inline">Read</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="rounded-full gap-1 bg-pharma-teal hover:bg-pharma-teal/90"
                        onClick={() => openNotification(notification)}
                        disabled={targetBusy}
                        data-testid={`exchange-open-notification-${notification.id}`}
                      >
                        <MessageCircle className="w-4 h-4" />
                        {targetBusy ? 'Opening...' : 'Open'}
                      </Button>
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
