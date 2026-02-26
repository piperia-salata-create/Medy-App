import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '../ui/button';

const clamp = (value, min, max) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const getViewport = () => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 390,
  height: typeof window !== 'undefined' ? window.innerHeight : 844
});

const getCardStyle = (targetRect, placement, viewport) => {
  const gutter = 12;
  const isMobile = viewport.width < 640;

  if (isMobile) {
    const centerY = targetRect
      ? targetRect.top + (targetRect.height / 2)
      : viewport.height / 2;
    const shouldPlaceTop = centerY > viewport.height * 0.6;

    return {
      left: `${gutter}px`,
      right: `${gutter}px`,
      maxWidth: 'none',
      width: 'auto',
      top: shouldPlaceTop ? 'calc(12px + env(safe-area-inset-top))' : 'auto',
      bottom: shouldPlaceTop ? 'auto' : 'calc(12px + env(safe-area-inset-bottom))',
      maxHeight: 'calc(100vh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))'
    };
  }

  const width = Math.min(360, viewport.width - (gutter * 2));
  const estimatedHeight = 220;
  const offset = 14;

  if (!targetRect) {
    return {
      width: `${width}px`,
      left: `${Math.round((viewport.width - width) / 2)}px`,
      top: `${Math.max(gutter, Math.round((viewport.height - estimatedHeight) / 2))}px`
    };
  }

  const centerX = targetRect.left + (targetRect.width / 2);
  const left = clamp(centerX - (width / 2), gutter, viewport.width - width - gutter);

  let actualPlacement = placement;
  if (!actualPlacement || actualPlacement === 'auto') {
    const canPlaceBelow = targetRect.bottom + offset + estimatedHeight <= viewport.height - gutter;
    actualPlacement = canPlaceBelow ? 'bottom' : 'top';
  }

  const desiredTop = actualPlacement === 'top'
    ? targetRect.top - estimatedHeight - offset
    : targetRect.bottom + offset;
  const top = clamp(desiredTop, gutter, viewport.height - estimatedHeight - gutter);

  return {
    width: `${width}px`,
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`
  };
};

const getSpotlightStyle = (targetRect, viewport) => {
  if (!targetRect) return null;
  const padding = viewport.width < 640 ? 8 : 10;
  const inset = 8;
  const minSize = 24;
  const maxRight = Math.max(inset + minSize, viewport.width - inset);
  const maxBottom = Math.max(inset + minSize, viewport.height - inset);

  const rawLeft = targetRect.left - padding;
  const rawTop = targetRect.top - padding;
  const rawRight = targetRect.right + padding;
  const rawBottom = targetRect.bottom + padding;

  const left = clamp(rawLeft, inset, Math.max(inset, maxRight - minSize));
  const top = clamp(rawTop, inset, Math.max(inset, maxBottom - minSize));
  const right = clamp(rawRight, left + minSize, maxRight);
  const bottom = clamp(rawBottom, top + minSize, maxBottom);
  const width = Math.max(minSize, right - left);
  const height = Math.max(minSize, bottom - top);

  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    height: `${Math.round(height)}px`
  };
};

export default function TutorialCoachDialog({
  open,
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onSkip,
  onNext,
  t
}) {
  const nextButtonRef = useRef(null);
  const [viewport, setViewport] = useState(() => getViewport());

  useEffect(() => {
    let rafId = null;
    const handleResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setViewport(getViewport());
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      nextButtonRef.current?.focus();
    }, 0);
  }, [open, stepIndex]);

  const spotlightStyle = useMemo(
    () => getSpotlightStyle(targetRect, viewport),
    [targetRect, viewport]
  );
  const cardStyle = useMemo(
    () => getCardStyle(targetRect, step?.placement, viewport),
    [targetRect, step?.placement, viewport]
  );

  const progressText = `${stepIndex + 1}/${totalSteps}`;
  const isLastStep = stepIndex >= totalSteps - 1;
  const title = step?.title || '';
  const body = step?.body || '';

  return (
    <DialogPrimitive.Root modal open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onSkip();
    }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[140] bg-transparent touch-none overscroll-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        />

        {spotlightStyle ? (
          <div
            className="pointer-events-none fixed z-[141] rounded-2xl border border-white/75 shadow-[0_0_0_9999px_rgba(15,23,42,0.56)] transition-[top,left,width,height] duration-300 ease-out"
            style={spotlightStyle}
          />
        ) : (
          <div className="pointer-events-none fixed inset-0 z-[141] bg-slate-900/56 transition-opacity duration-300" />
        )}

        <DialogPrimitive.Content
          data-tutorial-card="true"
          className="fixed z-[142] rounded-2xl border border-pharma-grey-pale bg-white p-4 shadow-2xl outline-none overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
          style={cardStyle}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nextButtonRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            onSkip();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{body}</DialogPrimitive.Description>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-pharma-slate-grey">
                {progressText}
              </p>
              <h3 className="font-heading text-base sm:text-lg font-semibold text-pharma-dark-slate leading-tight mt-1">
                {title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onSkip}
              className="w-11 h-11 inline-flex items-center justify-center rounded-full text-pharma-slate-grey hover:bg-pharma-ice-blue hover:text-pharma-charcoal transition-colors"
              aria-label={t('close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p
            className="mt-3 text-sm leading-relaxed text-pharma-charcoal overflow-hidden"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}
          >
            {body}
          </p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              className="rounded-full min-h-[44px] px-4"
              onClick={onSkip}
            >
              {t('tutorialSkip')}
            </Button>
            <Button
              ref={nextButtonRef}
              className="rounded-full min-h-[44px] px-4 bg-pharma-teal hover:bg-pharma-teal/90"
              onClick={onNext}
            >
              {isLastStep ? t('tutorialDone') : t('next')}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
