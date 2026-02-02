import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';

const PatientRequestsHistoryTab = ({
  requests,
  historyRequestsCount,
  historyVisibleCount,
  setHistoryVisibleCount,
  renderRequestCard
}) => {
  const { language } = useLanguage();

  return (
    <>
      <div className="space-y-3">
        {requests.map((request) => renderRequestCard(request, true))}
      </div>
      {historyRequestsCount > 5 && (
        <div className="flex justify-center gap-2 pt-2">
          {historyVisibleCount > 5 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setHistoryVisibleCount(5)}
            >
              {language === 'el' ? 'Εμφάνιση λιγότερων' : 'Show less'}
            </Button>
          )}
          {historyRequestsCount > historyVisibleCount && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setHistoryVisibleCount((count) => count + 5)}
            >
              {language === 'el' ? 'Εμφάνιση περισσότερων' : 'Show more'}
            </Button>
          )}
        </div>
      )}
    </>
  );
};

export default PatientRequestsHistoryTab;
