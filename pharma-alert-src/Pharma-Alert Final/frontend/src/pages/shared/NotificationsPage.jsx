import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-states';
import { Skeleton } from '../../components/ui/skeleton-loaders';
import { 
  ArrowLeft, 
  Bell,
  Check,
  Trash2,
  Pill,
  Package,
  Clock
} from 'lucide-react';

export default function NotificationsPage() {
  const { isPharmacist } = useAuth();
  const { t, language } = useLanguage();
  const { 
    notifications, 
    loading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useNotifications();

  const basePath = isPharmacist() ? '/pharmacist' : '/patient';

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'stock_update':
        return <Package className="w-5 h-5 text-pharma-teal" />;
      case 'reminder':
        return <Clock className="w-5 h-5 text-pharma-royal-blue" />;
      default:
        return <Pill className="w-5 h-5 text-pharma-steel-blue" />;
    }
  };

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="notifications-page">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={basePath}>
              <Button variant="ghost" size="sm" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-pharma-teal" />
              <h1 className="font-heading font-semibold text-pharma-dark-slate">
                {t('notificationCenter')}
              </h1>
            </div>
          </div>
          
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-pharma-teal"
              onClick={markAllAsRead}
              data-testid="mark-all-read-btn"
            >
              <Check className="w-4 h-4 mr-1" />
              {t('markAllRead')}
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={t('noNotifications')}
            description={language === 'el' 
              ? 'Θα εμφανιστούν εδώ οι ειδοποιήσεις σας'
              : 'Your notifications will appear here'}
          />
        ) : (
          <div className="space-y-3 page-enter">
            {notifications.map((notification) => (
              <Card 
                key={notification.id}
                className={`bg-white rounded-2xl shadow-card border-pharma-grey-pale transition-all ${
                  !notification.read ? 'border-l-4 border-l-pharma-teal' : ''
                }`}
                data-testid={`notification-${notification.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      !notification.read ? 'bg-pharma-teal/10' : 'bg-pharma-ice-blue'
                    }`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className={`text-sm ${!notification.read ? 'font-semibold' : 'font-medium'} text-pharma-dark-slate`}>
                            {notification.title}
                          </h3>
                          <p className="text-sm text-pharma-slate-grey mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-pharma-silver mt-2">
                            {new Date(notification.created_at).toLocaleString(
                              language === 'el' ? 'el-GR' : 'en-US'
                            )}
                          </p>
                        </div>
                        
                        <div className="flex gap-1">
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full h-8 w-8 p-0"
                              onClick={() => markAsRead(notification.id)}
                              data-testid={`mark-read-${notification.id}`}
                            >
                              <Check className="w-4 h-4 text-pharma-teal" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full h-8 w-8 p-0 text-pharma-slate-grey hover:text-pharma-charcoal"
                            onClick={() => deleteNotification(notification.id)}
                            data-testid={`delete-notification-${notification.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
