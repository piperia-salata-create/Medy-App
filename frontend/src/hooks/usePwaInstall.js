import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

const getStandaloneStatus = () => {
  if (typeof window === 'undefined') return false;
  const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const isIosStandalone = window.navigator?.standalone === true;
  return Boolean(isStandalone || isIosStandalone);
};

const getIsMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData?.mobile !== undefined) {
    return navigator.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini/i.test(navigator.userAgent || '');
};

const PwaInstallContext = createContext(null);

export const PwaInstallProvider = ({ children }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(getStandaloneStatus);
  const isMobile = useMemo(() => getIsMobileDevice(), []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleDisplayModeChange = () => {
      setIsInstalled(getStandaloneStatus());
    };

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else if (mediaQuery?.addListener) {
      mediaQuery.addListener(handleDisplayModeChange);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } else if (mediaQuery?.removeListener) {
        mediaQuery.removeListener(handleDisplayModeChange);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt || typeof deferredPrompt.prompt !== 'function') {
      return false;
    }

    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setIsInstalled(true);
      }
      return true;
    } catch (error) {
      return false;
    } finally {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const value = useMemo(() => ({
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isMobile,
    promptInstall
  }), [deferredPrompt, isInstalled, isMobile, promptInstall]);

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  );
};

const usePwaInstall = () => {
  const context = useContext(PwaInstallContext);
  if (!context) {
    throw new Error('usePwaInstall must be used within a PwaInstallProvider');
  }
  return context;
};

export default usePwaInstall;
