import { useCallback } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../contexts/LanguageContext';
import usePwaInstall from './usePwaInstall';

const useInstallHandler = () => {
  const { t } = useLanguage();
  const {
    isInstallable,
    isInstalled,
    isMobile,
    promptInstall
  } = usePwaInstall();

  const handleInstallClick = useCallback(async () => {
    if (isInstalled) return;
    if (isMobile) {
      toast(t('installDesktopOnly'));
      return;
    }
    if (!isInstallable) {
      toast(t('installUnavailable'));
      return;
    }

    const didPrompt = await promptInstall();
    if (!didPrompt) {
      toast(t('installUnavailable'));
    }
  }, [isInstalled, isMobile, isInstallable, promptInstall, t]);

  return {
    handleInstallClick,
    isInstalled,
    isInstallable
  };
};

export default useInstallHandler;
