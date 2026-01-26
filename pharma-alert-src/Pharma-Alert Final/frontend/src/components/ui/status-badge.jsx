import React from 'react';
import { cn } from '../../lib/utils';

export const StatusBadge = ({ status, size = 'default', className }) => {
  const statusConfig = {
    available: {
      bg: 'bg-status-available/10',
      text: 'text-status-available',
      border: 'border-status-available/20',
      label: { el: 'Διαθέσιμο', en: 'Available' }
    },
    limited: {
      bg: 'bg-status-limited/10',
      text: 'text-status-limited',
      border: 'border-status-limited/20',
      label: { el: 'Περιορισμένο', en: 'Limited' }
    },
    unavailable: {
      bg: 'bg-status-unavailable/10',
      text: 'text-status-unavailable',
      border: 'border-status-unavailable/20',
      label: { el: 'Μη Διαθέσιμο', en: 'Unavailable' }
    }
  };

  const config = statusConfig[status] || statusConfig.unavailable;
  const language = localStorage.getItem('pharma-alert-language') || 'el';

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    default: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium border transition-base',
        config.bg,
        config.text,
        config.border,
        sizeClasses[size],
        className
      )}
    >
      <span className={cn(
        'w-2 h-2 rounded-full mr-2',
        status === 'available' && 'bg-status-available',
        status === 'limited' && 'bg-status-limited',
        status === 'unavailable' && 'bg-status-unavailable'
      )} />
      {config.label[language]}
    </span>
  );
};

export const NotificationBadge = ({ count, className }) => {
  if (!count || count <= 0) return null;
  
  return (
    <span
      className={cn(
        'absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center',
        'rounded-full bg-pharma-teal text-white text-xs font-semibold',
        'animate-scale-in',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};

export const VerifiedBadge = ({ className }) => {
  const language = localStorage.getItem('pharma-alert-language') || 'el';
  
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
        'bg-pharma-sea-green/10 text-pharma-sea-green border border-pharma-sea-green/20',
        className
      )}
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      {language === 'el' ? 'Επαληθευμένο' : 'Verified'}
    </span>
  );
};

export const OnCallBadge = ({ className }) => {
  const language = localStorage.getItem('pharma-alert-language') || 'el';
  
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
        'bg-pharma-royal-blue/10 text-pharma-royal-blue border border-pharma-royal-blue/20',
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-pharma-royal-blue animate-pulse-soft" />
      {language === 'el' ? 'Εφημερία' : 'On Call'}
    </span>
  );
};
