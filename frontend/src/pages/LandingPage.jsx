import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import useInstallHandler from '../hooks/useInstallHandler';
import { 
  Pill, 
  MapPin, 
  Bell, 
  Smartphone,
  Globe,
  ArrowRight,
  CheckCircle2,
  Zap,
  Heart,
  UserRound,
  LayoutDashboard
} from 'lucide-react';

export default function LandingPage() {
  const { t, language, setLanguage } = useLanguage();
  const { user, isPharmacist } = useAuth();
  const { isInstalled, handleInstallClick } = useInstallHandler();

  const installLabel = isInstalled ? t('installInstalledLabel') : t('installCta');
  const authCtaPath = !user ? '/signin' : (isPharmacist() ? '/pharmacist' : '/patient');
  const authCtaLabel = !user ? t('signIn') : t('dashboard');

  const features = [
    {
      icon: Zap,
      title: t('featureRealtime'),
      description: t('featureRealtimeDesc'),
      gradient: 'from-pharma-teal to-pharma-steel-blue'
    },
    {
      icon: Bell,
      title: t('featureAlerts'),
      description: t('featureAlertsDesc'),
      gradient: 'from-pharma-royal-blue to-pharma-dark-slate'
    },
    {
      icon: Heart,
      title: t('featureSenior'),
      description: t('featureSeniorDesc'),
      gradient: 'from-pharma-sea-green to-pharma-teal'
    }
  ];

  const stats = [
    { value: '500+', label: language === 'el' ? 'Φαρμακεία' : 'Pharmacies' },
    { value: '10K+', label: language === 'el' ? 'Φάρμακα' : 'Medicines' },
    { value: '24/7', label: language === 'el' ? 'Διαθεσιμότητα' : 'Availability' },
  ];

  const benefits = language === 'el' 
    ? [
        'Αναζήτηση σε πραγματικό χρόνο',
        'Ειδοποιήσεις διαθεσιμότητας',
        'Κλήση με ένα πάτημα',
        'Αποθήκευση αγαπημένων'
      ]
    : [
        'Real-time availability search',
        'Availability notifications',
        'One-tap calling',
        'Save favorite pharmacies'
      ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass border-b border-pharma-grey-pale/50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
          <Link to="/" className="inline-flex max-w-full items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl gradient-teal flex items-center justify-center shadow-sm flex-shrink-0">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-base sm:text-lg text-pharma-dark-slate tracking-tight truncate">
              {t('appName')}
            </span>
          </Link>

          <div className="justify-self-center">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-[84px] sm:w-[100px] h-10 rounded-full bg-pharma-ice-blue/50 border-0 text-sm px-2.5 sm:px-3" data-testid="language-select-landing">
                <Globe className="w-3.5 h-3.5 mr-1 text-pharma-slate-grey flex-shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="el">{t('greek')}</SelectItem>
                <SelectItem value="en">{t('english')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="justify-self-end flex items-center gap-2">
            <Link to={authCtaPath}>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-10 w-10 sm:w-auto px-0 sm:px-4 text-pharma-dark-slate bg-white/80 border-pharma-grey-pale hover:bg-pharma-ice-blue gap-1.5 inline-flex items-center justify-center focus:ring-2 focus:ring-primary/30"
                data-testid={!user ? 'landing-signin-btn' : 'landing-dashboard-btn'}
              >
                {user ? (
                  <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <UserRound className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="hidden sm:inline">{authCtaLabel}</span>
                <span className="sm:hidden sr-only">{authCtaLabel}</span>
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full h-10 w-10 sm:w-auto px-0 sm:px-4 text-pharma-dark-slate bg-white/80 border-pharma-grey-pale hover:bg-pharma-ice-blue inline-flex items-center justify-center gap-1.5 focus:ring-2 focus:ring-primary/30"
              data-testid="landing-signup-btn"
              onClick={handleInstallClick}
              disabled={isInstalled}
            >
              <Smartphone className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">{installLabel}</span>
              <span className="sm:hidden sr-only">{installLabel}</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 gradient-hero" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-pharma-pale-blue/30 to-transparent" />
        
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="page-enter">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-sm border border-pharma-grey-pale/50 mb-6">
                <span className="w-2 h-2 rounded-full bg-pharma-sea-green animate-pulse" />
                <span className="text-xs font-medium text-pharma-charcoal">
                  {language === 'el' ? 'Διαθέσιμο τώρα' : 'Available now'}
                </span>
              </div>

              <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold text-pharma-dark-slate leading-[1.1] mb-5 tracking-tight">
                {t('heroTitle')}
              </h1>
              <p className="text-lg sm:text-xl text-pharma-slate-grey mb-8 leading-relaxed max-w-lg">
                {t('heroSubtitle')}
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Button 
                  size="lg" 
                  className="rounded-full gradient-teal text-white px-8 h-13 text-base font-semibold shadow-lg hover:shadow-xl transition-all gap-2 group"
                  data-testid="hero-getstarted-btn"
                  onClick={handleInstallClick}
                  disabled={isInstalled}
                >
                  {installLabel}
                  {!isInstalled && (
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  )}
                </Button>
                <Link to="/learn-more">
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="rounded-full border-2 border-pharma-dark-slate/20 text-pharma-dark-slate hover:bg-pharma-dark-slate/5 px-8 h-13 text-base font-semibold"
                  >
                    {t('learnMore')}
                  </Button>
                </Link>
              </div>

              {/* Benefits List */}
              <div className="grid grid-cols-2 gap-3">
                {benefits.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-pharma-sea-green flex-shrink-0" />
                    <span className="text-sm text-pharma-charcoal">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero Image */}
            <div className="relative page-enter stagger-2 lg:pl-8">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                <img 
                  src="https://images.unsplash.com/photo-1681418290255-a5355089dc6d?w=600&h=450&fit=crop"
                  alt="Modern pharmacy"
                  className="w-full h-[350px] sm:h-[420px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-pharma-dark-slate/70 via-transparent to-transparent" />
                
                {/* Floating Card */}
                <div className="absolute bottom-5 left-5 right-5 glass rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-pharma-sea-green/20 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-pharma-sea-green" />
                    </div>
                    <div>
                      <p className="font-semibold text-pharma-dark-slate text-sm">
                        {language === 'el' ? '12 φαρμακεία κοντά σας' : '12 pharmacies near you'}
                      </p>
                      <p className="text-xs text-pharma-slate-grey">
                        {language === 'el' ? '8 με διαθέσιμο απόθεμα' : '8 with available stock'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stats Badge */}
                <div className="absolute top-5 right-5 glass-dark rounded-xl px-4 py-2.5 shadow-lg">
                  <div className="flex items-center gap-3">
                    <Zap className="w-4 h-4 text-pharma-teal" />
                    <span className="text-white text-sm font-medium">
                      {language === 'el' ? 'Live ενημερώσεις' : 'Live updates'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-pharma-grey-pale/50 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <p className="font-heading text-3xl sm:text-4xl font-bold text-gradient mb-1">
                  {stat.value}
                </p>
                <p className="text-sm text-pharma-slate-grey font-medium">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 sm:py-28 bg-pharma-ice-blue/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="inline-block px-4 py-1.5 rounded-full bg-pharma-teal/10 text-pharma-teal text-sm font-semibold mb-4">
              {language === 'el' ? 'Χαρακτηριστικά' : 'Features'}
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-pharma-dark-slate mb-4">
              {t('features')}
            </h2>
            <p className="text-pharma-slate-grey max-w-2xl mx-auto">
              {language === 'el' 
                ? 'Όλα όσα χρειάζεστε για να βρείτε φάρμακα γρήγορα και εύκολα'
                : 'Everything you need to find medicines quickly and easily'}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div 
                key={i}
                className="group gradient-card rounded-2xl p-7 shadow-sm hover:shadow-lg border border-pharma-grey-pale/50 transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5 shadow-md group-hover:scale-105 transition-transform`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-pharma-dark-slate mb-2">
                  {feature.title}
                </h3>
                <p className="text-pharma-slate-grey text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PWA Install Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="gradient-accent rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
                <Smartphone className="w-8 h-8 text-white" />
              </div>
              <h2 className="font-heading text-2xl sm:text-3xl font-bold text-white mb-3">
                {t('installApp')}
              </h2>
              <p className="text-white/80 mb-8 max-w-md mx-auto">
                {t('installAppDesc')}
              </p>
              <Button 
                size="lg"
                className="rounded-full bg-white text-pharma-royal-blue hover:bg-white/90 px-8 h-12 font-semibold shadow-lg"
                onClick={handleInstallClick}
                disabled={isInstalled}
              >
                {installLabel}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Notification Disclosure */}
      <section className="py-6 bg-pharma-ice-blue/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-center gap-3 text-center">
            <Bell className="w-4 h-4 text-pharma-steel-blue flex-shrink-0" />
            <p className="text-sm text-pharma-slate-grey">
              {language === 'el' 
                ? 'Οι ειδοποιήσεις λειτουργούν όταν η εφαρμογή είναι ανοιχτή ή εγκατεστημένη στη συσκευή σου.'
                : 'Notifications work when the app is open or installed on your device.'}
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-pharma-dark-slate text-white py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                <Pill className="w-5 h-5 text-white" />
              </div>
              <span className="font-heading font-bold text-lg">{t('appName')}</span>
            </div>
            <div className="flex items-center gap-6">
              <Link to="/terms" className="text-white/70 hover:text-white text-sm transition-colors">
                {language === 'el' ? 'Όροι Χρήσης' : 'Terms'}
              </Link>
              <Link to="/privacy" className="text-white/70 hover:text-white text-sm transition-colors">
                {language === 'el' ? 'Απόρρητο' : 'Privacy'}
              </Link>
              <Link to="/report-bug" className="text-white/70 hover:text-white text-sm transition-colors">
                {language === 'el' ? 'Αναφορά Σφάλματος' : 'Report a Bug'}
              </Link>
            </div>
            <p className="text-white/50 text-sm">
              © 2026 Medy App
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
