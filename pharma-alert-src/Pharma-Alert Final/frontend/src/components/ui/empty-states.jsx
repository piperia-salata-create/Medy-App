import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from './button';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

export const EmptyState = ({ 
  icon: Icon = AlertCircle,
  title,
  description,
  action,
  actionLabel,
  className = ''
}) => {
  const { t } = useLanguage();
  
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-pharma-ice-blue flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-pharma-slate-grey" />
      </div>
      <h3 className="font-heading text-lg font-semibold text-pharma-dark-slate mb-2">
        {title || t('noResults')}
      </h3>
      {description && (
        <p className="text-pharma-slate-grey max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && (
        <Button 
          onClick={action}
          variant="outline"
          className="rounded-full"
        >
          {actionLabel || t('tryAgain')}
        </Button>
      )}
    </div>
  );
};

export const ErrorState = ({ 
  error,
  onRetry,
  className = ''
}) => {
  const { t } = useLanguage();
  
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-pharma-slate-grey" />
      </div>
      <h3 className="font-heading text-lg font-semibold text-pharma-dark-slate mb-2">
        {t('errorOccurred')}
      </h3>
      <p className="text-pharma-slate-grey max-w-sm mb-6">
        {error?.message || t('networkError')}
      </p>
      {onRetry && (
        <Button 
          onClick={onRetry}
          variant="outline"
          className="rounded-full gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {t('tryAgain')}
        </Button>
      )}
    </div>
  );
};

export const OfflineState = ({ className = '' }) => {
  const { t } = useLanguage();
  
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-pharma-ice-blue flex items-center justify-center mb-4">
        <WifiOff className="w-8 h-8 text-pharma-slate-grey" />
      </div>
      <h3 className="font-heading text-lg font-semibold text-pharma-dark-slate mb-2">
        {t('networkError')}
      </h3>
      <p className="text-pharma-slate-grey max-w-sm">
        {t('language') === 'el' 
          ? 'Ελέγξτε τη σύνδεσή σας στο διαδίκτυο'
          : 'Check your internet connection'}
      </p>
    </div>
  );
};
