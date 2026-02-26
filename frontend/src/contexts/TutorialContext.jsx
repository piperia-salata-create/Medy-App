import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import TutorialCoachDialog from '../components/tutorial/TutorialCoachDialog';
import {
  getTutorialLocalStorageKey,
  getTutorialProfileField,
  getTutorialSteps,
  getTutorialVersion,
  isTutorialEntryRoute,
  isTutorialRole
} from '../lib/tutorial';

const TutorialContext = createContext(null);

const STEP_RESOLVE_RETRIES = 8;
const STEP_RESOLVE_DELAY_MS = 180;
const SCROLL_SETTLE_ATTEMPTS = 5;
const SCROLL_SETTLE_DELAY_MS = 120;
const AUTO_START_RETRIES = 12;
const AUTO_START_DELAY_MS = 280;
const AUTO_STARTED_CACHE = new Set();

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isMatchingRoute = (pathname, route) => {
  if (!route) return true;
  return pathname === route || pathname.startsWith(`${route}/`);
};

const isElementVisible = (element) => {
  if (!element || !(element instanceof Element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const findVisibleElement = (selector) => {
  if (!selector) return null;
  const candidates = Array.from(document.querySelectorAll(selector));
  return candidates.find((element) => isElementVisible(element)) || null;
};

const hasBlockingDialogOpen = () => {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"][data-state="open"]'));
  return dialogs.some((dialog) => dialog.getAttribute('data-tutorial-card') !== 'true');
};

const normalizeRect = (rect) => ({
  top: rect.top,
  left: rect.left,
  width: rect.width,
  height: rect.height,
  bottom: rect.bottom,
  right: rect.right
});

const isRectOutOfView = (rect) => {
  const viewportWidth = window.innerWidth || 0;
  const viewportHeight = window.innerHeight || 0;
  const margin = 24;
  if (!rect) return true;
  return (
    rect.top < margin
    || rect.bottom > viewportHeight - margin
    || rect.left < margin
    || rect.right > viewportWidth - margin
  );
};

const parseLocalVersion = (role) => {
  const key = getTutorialLocalStorageKey(role);
  if (!key) return 0;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch (error) {
    return 0;
  }
};

const setLocalVersion = (role, version) => {
  const key = getTutorialLocalStorageKey(role);
  if (!key) return;
  try {
    window.localStorage.setItem(key, String(version));
  } catch (error) {
    // Ignore localStorage write failures.
  }
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

export const TutorialProvider = ({ children }) => {
  const { user, profile, profileStatus, updateProfile } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [activeRole, setActiveRole] = useState(null);
  const [activeSteps, setActiveSteps] = useState([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const activeElementRef = useRef(null);
  const resolveRunRef = useRef(0);

  const activeStep = activeSteps[activeStepIndex] || null;

  const getSeenVersionFromProfile = useCallback((role) => {
    const field = getTutorialProfileField(role);
    if (!field) return 0;
    const parsed = Number(profile?.[field] ?? 0);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [profile]);

  const shouldShowForRole = useCallback((role) => {
    if (!isTutorialRole(role)) return false;
    const seenVersion = getSeenVersionFromProfile(role);
    return seenVersion < getTutorialVersion(role);
  }, [getSeenVersionFromProfile]);

  const closeWithoutPersist = useCallback(() => {
    setIsOpen(false);
    setTargetRect(null);
    setActiveRole(null);
    setActiveSteps([]);
    setActiveStepIndex(0);
    activeElementRef.current = null;
    resolveRunRef.current += 1;
  }, []);

  const persistSeenVersion = useCallback(async (role, version) => {
    const field = getTutorialProfileField(role);
    if (!field) return;
    const { error } = await updateProfile({ [field]: version });
    if (!error) {
      setLocalVersion(role, version);
      return;
    }
    console.error('Failed to persist tutorial version:', error);
  }, [updateProfile]);

  const finishTutorial = useCallback((role) => {
    if (!role) {
      closeWithoutPersist();
      return;
    }
    const version = getTutorialVersion(role);
    closeWithoutPersist();
    void persistSeenVersion(role, version);
  }, [closeWithoutPersist, persistSeenVersion]);

  const nextStep = useCallback(() => {
    if (!isOpen) return;
    const isLastStep = activeStepIndex >= activeSteps.length - 1;
    if (isLastStep) {
      finishTutorial(activeRole);
      return;
    }
    setActiveStepIndex((prev) => prev + 1);
  }, [activeRole, activeStepIndex, activeSteps.length, finishTutorial, isOpen]);

  const skipTutorial = useCallback(() => {
    if (!isOpen) return;
    finishTutorial(activeRole);
  }, [activeRole, finishTutorial, isOpen]);

  const skipCurrentStepIfMissing = useCallback(() => {
    if (!isOpen) return;
    const isLastStep = activeStepIndex >= activeSteps.length - 1;
    if (isLastStep) {
      finishTutorial(activeRole);
      return;
    }
    setActiveStepIndex((prev) => prev + 1);
  }, [activeRole, activeStepIndex, activeSteps.length, finishTutorial, isOpen]);

  const startTutorial = useCallback((role, options = {}) => {
    if (!isTutorialRole(role)) return false;
    if (hasBlockingDialogOpen()) return false;

    const steps = getTutorialSteps(role);
    if (!Array.isArray(steps) || steps.length === 0) return false;

    if (!options?.force && !shouldShowForRole(role)) return false;

    setActiveRole(role);
    setActiveSteps(steps);
    setActiveStepIndex(0);
    setTargetRect(null);
    activeElementRef.current = null;
    setIsOpen(true);
    return true;
  }, [shouldShowForRole]);

  const replayTutorial = useCallback(async (role) => {
    if (!isTutorialRole(role)) return false;
    if (!user?.id || profileStatus !== 'ready') return false;

    const field = getTutorialProfileField(role);
    if (!field) return false;
    const { error } = await updateProfile({ [field]: 0 });
    if (!error) {
      setLocalVersion(role, 0);
    } else {
      console.error('Failed to reset tutorial version for replay:', error);
    }

    return startTutorial(role, { force: true });
  }, [profileStatus, startTutorial, updateProfile, user?.id]);

  useEffect(() => {
    if (!isOpen) return undefined;
    if (!activeStep) return undefined;

    let cancelled = false;
    const runId = resolveRunRef.current + 1;
    resolveRunRef.current = runId;

    const resolveStepTarget = async () => {
      if (activeStep.route && !isMatchingRoute(location.pathname, activeStep.route)) {
        navigate(activeStep.route);
        await wait(260);
        if (cancelled || resolveRunRef.current !== runId) return;
      }

      let element = null;
      for (let attempt = 0; attempt < STEP_RESOLVE_RETRIES; attempt += 1) {
        element = findVisibleElement(activeStep.selector);
        if (element) break;
        await wait(STEP_RESOLVE_DELAY_MS);
        if (cancelled || resolveRunRef.current !== runId) return;
      }

      if (!element) {
        skipCurrentStepIfMissing();
        return;
      }

      let rect = element.getBoundingClientRect();
      if (isRectOutOfView(rect)) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        for (let attempt = 0; attempt < SCROLL_SETTLE_ATTEMPTS; attempt += 1) {
          await wait(SCROLL_SETTLE_DELAY_MS);
          if (cancelled || resolveRunRef.current !== runId) return;
          rect = element.getBoundingClientRect();
          if (!isRectOutOfView(rect)) break;
          if (attempt === 2) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
        }
      }

      activeElementRef.current = element;
      setTargetRect(normalizeRect(rect));
    };

    resolveStepTarget();

    return () => {
      cancelled = true;
    };
  }, [activeStep, isOpen, location.pathname, navigate, skipCurrentStepIfMissing]);

  useEffect(() => {
    if (!isOpen) return undefined;

    let rafId = null;
    const updateRect = () => {
      rafId = null;
      const currentStep = activeSteps[activeStepIndex];
      if (!currentStep) return;

      let element = activeElementRef.current;
      if (!element || !document.contains(element) || !isElementVisible(element)) {
        element = findVisibleElement(currentStep.selector);
        activeElementRef.current = element;
      }

      if (!element) return;
      setTargetRect(normalizeRect(element.getBoundingClientRect()));
    };

    const requestUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(updateRect);
    };

    requestUpdate();
    window.addEventListener('resize', requestUpdate);
    window.addEventListener('orientationchange', requestUpdate);
    window.addEventListener('scroll', requestUpdate, true);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', requestUpdate);
      window.removeEventListener('orientationchange', requestUpdate);
      window.removeEventListener('scroll', requestUpdate, true);
    };
  }, [activeStepIndex, activeSteps, isOpen]);

  useEffect(() => {
    if (!user?.id || profileStatus !== 'ready') return;
    const role = profile?.role;
    if (!isTutorialRole(role)) return;

    const seenVersion = getSeenVersionFromProfile(role);
    const localSeenVersion = parseLocalVersion(role);
    if (seenVersion > localSeenVersion) {
      setLocalVersion(role, seenVersion);
    }
  }, [getSeenVersionFromProfile, profile?.role, profileStatus, user?.id]);

  useEffect(() => {
    if (!user?.id || profileStatus !== 'ready') return undefined;
    if (isOpen) return undefined;

    const role = profile?.role;
    if (!isTutorialRole(role)) return undefined;
    if (!isTutorialEntryRoute(role, location.pathname)) return undefined;
    if (!shouldShowForRole(role)) return undefined;

    const version = getTutorialVersion(role);
    const key = `${user.id}:${role}:${version}`;
    if (AUTO_STARTED_CACHE.has(key)) return undefined;

    let attempts = 0;
    let timerId = null;

    const tryStart = () => {
      if (AUTO_STARTED_CACHE.has(key)) return;
      if (hasBlockingDialogOpen()) {
        attempts += 1;
      } else {
        const firstStep = getTutorialSteps(role)[0];
        const firstTargetReady = firstStep?.selector
          ? Boolean(findVisibleElement(firstStep.selector))
          : false;
        if (!firstTargetReady) {
          attempts += 1;
          if (attempts < AUTO_START_RETRIES) {
            timerId = window.setTimeout(tryStart, AUTO_START_DELAY_MS);
          }
          return;
        }

        const started = startTutorial(role, { force: true });
        if (started) {
          AUTO_STARTED_CACHE.add(key);
          return;
        }
        attempts += 1;
      }

      if (attempts < AUTO_START_RETRIES) {
        timerId = window.setTimeout(tryStart, AUTO_START_DELAY_MS);
      }
    };

    timerId = window.setTimeout(tryStart, AUTO_START_DELAY_MS);

    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [isOpen, location.pathname, profile?.role, profileStatus, shouldShowForRole, startTutorial, user?.id]);

  const value = useMemo(() => ({
    isTutorialOpen: isOpen,
    activeTutorialRole: activeRole,
    startTutorial,
    replayTutorial,
    skipTutorial
  }), [activeRole, isOpen, replayTutorial, skipTutorial, startTutorial]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <TutorialCoachDialog
        open={isOpen}
        step={activeStep ? {
          title: t(activeStep.title_i18n_key),
          body: t(activeStep.body_i18n_key),
          placement: activeStep.placement
        } : null}
        stepIndex={activeStepIndex}
        totalSteps={activeSteps.length || 1}
        targetRect={targetRect}
        onSkip={skipTutorial}
        onNext={nextStep}
        t={t}
      />
    </TutorialContext.Provider>
  );
};
