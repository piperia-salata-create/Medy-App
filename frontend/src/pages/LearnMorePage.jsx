import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import useInstallHandler from '../hooks/useInstallHandler';
import {
  Pill,
  Globe,
  UserPlus,
  FileText,
  Bell,
  CheckCircle2,
  MapPin,
  Zap,
  Shield,
  Heart,
  ArrowLeft
} from 'lucide-react';

export default function LearnMorePage() {
  const { t, language, setLanguage } = useLanguage();
  const { isInstalled, handleInstallClick } = useInstallHandler();

  const installLabel = isInstalled ? t('installInstalledLabel') : t('installCta');

  const steps = [
    {
      icon: UserPlus,
      title: t('learnMoreStep1Title'),
      description: t('learnMoreStep1Desc')
    },
    {
      icon: FileText,
      title: t('learnMoreStep2Title'),
      description: t('learnMoreStep2Desc')
    },
    {
      icon: Bell,
      title: t('learnMoreStep3Title'),
      description: t('learnMoreStep3Desc')
    },
    {
      icon: CheckCircle2,
      title: t('learnMoreStep4Title'),
      description: t('learnMoreStep4Desc')
    },
    {
      icon: MapPin,
      title: t('learnMoreStep5Title'),
      description: t('learnMoreStep5Desc')
    }
  ];

  const benefits = [
    {
      icon: Zap,
      title: t('learnMoreBenefitRealtimeTitle'),
      description: t('learnMoreBenefitRealtimeDesc')
    },
    {
      icon: CheckCircle2,
      title: t('learnMoreBenefitFastTitle'),
      description: t('learnMoreBenefitFastDesc')
    },
    {
      icon: Heart,
      title: t('learnMoreBenefitFavoritesTitle'),
      description: t('learnMoreBenefitFavoritesDesc')
    },
    {
      icon: Shield,
      title: t('learnMoreBenefitPrivacyTitle'),
      description: t('learnMoreBenefitPrivacyDesc')
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <nav className="sticky top-0 z-40 glass border-b border-pharma-grey-pale/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl gradient-teal flex items-center justify-center shadow-sm">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-lg text-pharma-dark-slate tracking-tight">
              {t('appName')}
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-[100px] h-9 rounded-full bg-pharma-ice-blue/50 border-0 text-sm" data-testid="language-select-learn-more">
                <Globe className="w-3.5 h-3.5 mr-1.5 text-pharma-slate-grey" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="el">Ελληνικά</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
            <Link to="/signin">
              <Button variant="ghost" size="sm" className="rounded-full h-9 px-4 text-pharma-dark-slate hover:bg-pharma-ice-blue">
                {t('signIn')}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <header className="relative overflow-hidden bg-pharma-ice-blue/40">
        <div className="absolute inset-0 gradient-hero opacity-70" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-pharma-slate-grey hover:text-pharma-dark-slate">
            <ArrowLeft className="w-4 h-4" />
            {t('back')}
          </Link>
          <div className="mt-6 max-w-3xl">
            <h1 className="font-heading text-3xl sm:text-4xl font-bold text-pharma-dark-slate mb-3">
              {t('learnMoreTitle')}
            </h1>
            <p className="text-pharma-slate-grey text-base sm:text-lg">
              {t('learnMoreSubtitle')}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-14">
        <section>
          <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
            <div>
              <h2 className="font-heading text-2xl font-semibold text-pharma-dark-slate">
                {t('learnMoreStepsTitle')}
              </h2>
              <p className="text-sm text-pharma-slate-grey mt-1">
                {t('learnMoreStepsSubtitle')}
              </p>
            </div>
            <Button
              variant="outline"
              className="rounded-full border-pharma-grey-pale/80"
              onClick={handleInstallClick}
              disabled={isInstalled}
            >
              {installLabel}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {steps.map((step, index) => (
              <Card key={step.title} className="border-pharma-grey-pale/70 shadow-sm">
                <CardContent className="p-5 flex gap-4">
                  <div className="w-11 h-11 rounded-xl bg-pharma-ice-blue flex items-center justify-center flex-shrink-0">
                    <step.icon className="w-5 h-5 text-pharma-teal" />
                  </div>
                  <div>
                    <p className="text-xs text-pharma-slate-grey mb-1">
                      {`${t('learnMoreStepPrefix')} ${index + 1}`}
                    </p>
                    <p className="font-semibold text-pharma-dark-slate">{step.title}</p>
                    <p className="text-sm text-pharma-slate-grey mt-1">{step.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-heading text-2xl font-semibold text-pharma-dark-slate mb-6">
            {t('learnMoreBenefitsTitle')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="border-pharma-grey-pale/70 shadow-sm">
                <CardContent className="p-5 flex gap-4">
                  <div className="w-11 h-11 rounded-xl bg-pharma-ice-blue flex items-center justify-center flex-shrink-0">
                    <benefit.icon className="w-5 h-5 text-pharma-royal-blue" />
                  </div>
                  <div>
                    <p className="font-semibold text-pharma-dark-slate">{benefit.title}</p>
                    <p className="text-sm text-pharma-slate-grey mt-1">{benefit.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div className="gradient-accent rounded-3xl p-8 sm:p-10 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative z-10">
              <h3 className="font-heading text-2xl font-semibold text-white mb-2">
                {t('learnMoreCtaTitle')}
              </h3>
              <p className="text-white/80 mb-6 max-w-xl mx-auto">
                {t('learnMoreCtaSubtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  size="lg"
                  className="rounded-full bg-white text-pharma-royal-blue hover:bg-white/90 px-8 h-12 font-semibold shadow-lg"
                  onClick={handleInstallClick}
                  disabled={isInstalled}
                >
                  {installLabel}
                </Button>
                <Link to="/signin">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full border-white/70 text-white hover:bg-white/10 px-8 h-12 font-semibold"
                  >
                    {t('signIn')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
