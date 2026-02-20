import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeniorMode } from '../../contexts/SeniorModeContext';
import EntityAvatar from '../../components/common/EntityAvatar';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { 
  ArrowLeft, 
  Globe, 
  Accessibility,
  Bell,
  User,
  LogOut,
  ChevronRight,
  Info
} from 'lucide-react';

export default function SettingsPage() {
  const { user, profile, signOut, isPharmacist } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { seniorMode, setSeniorMode } = useSeniorMode();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const basePath = isPharmacist() ? '/pharmacist' : '/patient';

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="settings-page">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-pharma-grey-pale/50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to={basePath}>
            <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-heading font-semibold text-pharma-dark-slate">
            {t('settings')}
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Profile Section */}
        <section className="page-enter">
          <Card className="gradient-card rounded-xl shadow-sm border border-pharma-grey-pale/50 overflow-hidden">
            <CardContent className="p-0">
              <div className="p-5 border-b border-pharma-grey-pale/50">
                <div className="flex items-center gap-4">
                  <EntityAvatar
                    avatarPath={profile?.avatar_path}
                    alt={language === 'el' ? 'Εικόνα προφίλ' : 'Profile avatar'}
                    className="w-14 h-14 rounded-xl bg-pharma-teal/10 flex items-center justify-center overflow-hidden"
                    imageClassName="h-full w-full object-cover"
                    fallback={<User className="w-7 h-7 text-pharma-teal" />}
                    dataTestId="settings-avatar-preview"
                  />
                  <div>
                    <h2 className="font-heading font-semibold text-pharma-dark-slate">
                      {profile?.full_name || user?.email}
                    </h2>
                    <p className="text-pharma-slate-grey text-sm">{user?.email}</p>
                    <p className="text-pharma-teal text-xs font-medium capitalize mt-0.5">
                      {profile?.role?.replace('_', ' ')}
                    </p>
                  </div>
                </div>
              </div>

              <Link 
                to={`${basePath}/settings/profile`}
                className="flex items-center justify-between p-4 hover:bg-pharma-ice-blue/50 transition-colors"
                data-testid="edit-profile-link"
              >
                <span className="text-sm text-pharma-charcoal">{t('profile')}</span>
                <ChevronRight className="w-5 h-5 text-pharma-slate-grey" />
              </Link>
            </CardContent>
          </Card>
        </section>

        {/* Preferences Section */}
        <section className="page-enter stagger-1">
          <h2 className="font-heading text-sm font-semibold text-pharma-slate-grey mb-2 px-1 uppercase tracking-wide">
            {language === 'el' ? 'Προτιμήσεις' : 'Preferences'}
          </h2>
          
          <Card className="gradient-card rounded-xl shadow-sm border border-pharma-grey-pale/50 overflow-hidden">
            <CardContent className="p-0">
              {/* Language */}
              <div className="flex items-center justify-between p-4 border-b border-pharma-grey-pale/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-pharma-steel-blue/10 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-pharma-steel-blue" />
                  </div>
                  <span className="text-sm text-pharma-charcoal">{t('language')}</span>
                </div>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-[120px] rounded-lg h-9 text-sm" data-testid="language-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="el">{t('greek')}</SelectItem>
                    <SelectItem value="en">{t('english')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reading Accessibility Mode */}
              <div className="flex items-center justify-between p-4 border-b border-pharma-grey-pale/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-pharma-sea-green/10 flex items-center justify-center">
                    <Accessibility className="w-5 h-5 text-pharma-sea-green" />
                  </div>
                  <div>
                    <span className="text-sm text-pharma-charcoal block">{t('seniorMode')}</span>
                    <span className="text-xs text-pharma-slate-grey">{t('seniorModeDesc')}</span>
                  </div>
                </div>
                <Switch
                  checked={seniorMode}
                  onCheckedChange={setSeniorMode}
                  data-testid="senior-mode-switch"
                />
              </div>

              {/* Notifications Info */}
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-pharma-royal-blue/10 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-pharma-royal-blue" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm text-pharma-charcoal block mb-2">{t('pushNotifications')}</span>
                    <div className="flex items-start gap-2 p-3 bg-pharma-ice-blue/50 rounded-lg">
                      <Info className="w-4 h-4 text-pharma-steel-blue flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-pharma-slate-grey leading-relaxed">
                        {language === 'el' 
                          ? 'Οι ειδοποιήσεις λειτουργούν όταν η εφαρμογή είναι ανοιχτή ή εγκατεστημένη στη συσκευή σου.'
                          : 'Notifications work when the app is open or installed on your device.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Sign Out */}
        <section className="page-enter stagger-2">
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl border-pharma-grey-pale text-pharma-slate-grey hover:text-pharma-charcoal hover:bg-pharma-grey-pale/30 gap-2"
            onClick={handleSignOut}
            data-testid="signout-btn"
          >
            <LogOut className="w-5 h-5" />
            {t('signOut')}
          </Button>
        </section>

        {/* App Version */}
        <p className="text-center text-xs text-pharma-silver pt-2">
          Medy App v1.0.0 - By PixelPro.Solutions
        </p>
      </main>
    </div>
  );
}
