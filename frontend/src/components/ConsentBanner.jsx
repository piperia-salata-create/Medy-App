import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { useLanguage } from '../contexts/LanguageContext';
import {
  CONSENT_OPEN_EVENT,
  getConsent,
  hasStoredConsent,
  setConsent
} from '../lib/consent';

const toDraft = (consent) => ({
  analytics: Boolean(consent?.analytics),
  marketing: Boolean(consent?.marketing)
});

export default function ConsentBanner() {
  const { t } = useLanguage();
  const [hasChoice, setHasChoice] = useState(() => hasStoredConsent());
  const [isVisible, setIsVisible] = useState(() => !hasStoredConsent());
  const [showPreferences, setShowPreferences] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(getConsent()));
  const [snapshot, setSnapshot] = useState(() => toDraft(getConsent()));

  useEffect(() => {
    const stored = hasStoredConsent();
    const current = toDraft(getConsent());
    setHasChoice(stored);
    setDraft(current);
    setSnapshot(current);
    setIsVisible(!stored);
  }, []);

  const persistAndClose = useCallback((nextDraft) => {
    const saved = setConsent({
      necessary: true,
      analytics: Boolean(nextDraft?.analytics),
      marketing: Boolean(nextDraft?.marketing)
    });
    const nextSnapshot = toDraft(saved);
    setHasChoice(true);
    setDraft(nextSnapshot);
    setSnapshot(nextSnapshot);
    setShowPreferences(false);
    setIsVisible(false);
  }, []);

  const openPreferences = useCallback(() => {
    const stored = hasStoredConsent();
    const current = toDraft(getConsent());
    setHasChoice(stored);
    setDraft(current);
    setSnapshot(current);
    setShowPreferences(true);
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOpenEvent = () => openPreferences();
    window.addEventListener(CONSENT_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpenEvent);
    };
  }, [openPreferences]);

  const handleCancelPreferences = () => {
    setDraft(snapshot);
    setShowPreferences(false);
    if (hasChoice) {
      setIsVisible(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-40 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[430px]">
      <div className="mx-auto sm:mx-0">
        <Card className="rounded-xl border border-pharma-grey-pale bg-white shadow-xl">
          <CardContent className="p-3.5 sm:p-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <h2 className="font-heading text-base font-semibold text-pharma-dark-slate">
                  {t('privacySettingsTitle')}
                </h2>
                <p className="text-sm text-pharma-charcoal leading-relaxed">
                  {t('privacySettingsBannerLine1')}
                </p>
                <p className="text-sm text-pharma-charcoal leading-relaxed">
                  {t('privacySettingsBannerLine2')}
                </p>
                <p className="text-xs text-pharma-slate-grey">
                  <Link to="/terms" className="underline underline-offset-2 hover:text-pharma-dark-slate">
                    {t('privacySettingsTermsLink')}
                  </Link>
                  {' • '}
                  <Link to="/privacy" className="underline underline-offset-2 hover:text-pharma-dark-slate">
                    {t('privacySettingsPolicyLink')}
                  </Link>
                </p>
              </div>

              {showPreferences && (
                <div className="rounded-lg border border-pharma-grey-pale bg-pharma-ice-blue/35 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-pharma-dark-slate">
                        {t('privacySettingsNecessaryLabel')}
                      </p>
                      <p className="text-xs text-pharma-slate-grey">
                        {t('privacySettingsNecessaryHelp')}
                      </p>
                    </div>
                    <Switch checked disabled aria-label={t('privacySettingsNecessaryLabel')} />
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-pharma-dark-slate">
                        {t('privacySettingsAnalyticsLabel')}
                      </p>
                      <p className="text-xs text-pharma-slate-grey">
                        {t('privacySettingsAnalyticsHelp')}
                      </p>
                    </div>
                    <Switch
                      checked={draft.analytics}
                      onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, analytics: Boolean(checked) }))}
                      aria-label={t('privacySettingsAnalyticsLabel')}
                    />
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-pharma-dark-slate">
                        {t('privacySettingsMarketingLabel')}
                      </p>
                      <p className="text-xs text-pharma-slate-grey">
                        {t('privacySettingsMarketingHelp')}
                      </p>
                    </div>
                    <Switch
                      checked={draft.marketing}
                      onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, marketing: Boolean(checked) }))}
                      aria-label={t('privacySettingsMarketingLabel')}
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" className="rounded-full" onClick={handleCancelPreferences}>
                      {t('cancel')}
                    </Button>
                    <Button className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90" onClick={() => persistAndClose(draft)}>
                      {t('save')}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  variant="ghost"
                  className="rounded-full text-pharma-dark-slate hover:bg-pharma-grey-pale/30"
                  onClick={openPreferences}
                >
                  {t('privacySettingsConfigure')}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-pharma-grey-pale"
                  onClick={() => persistAndClose({ analytics: false, marketing: false })}
                >
                  {t('privacySettingsOnlyNecessary')}
                </Button>
                <Button
                  className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90"
                  onClick={() => persistAndClose({ analytics: true, marketing: true })}
                >
                  {t('privacySettingsAcceptAll')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
