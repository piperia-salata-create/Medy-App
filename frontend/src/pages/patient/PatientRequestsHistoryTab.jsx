import React from 'react';

const PatientRequestsHistoryTab = ({
  requests,
  renderRequestCard
}) => {
  return (
    <div className="paint-stable">
      <div className="incoming-scroll max-h-[62vh] overflow-y-auto pr-1">
        <div className="space-y-3">
          {requests.map((request) => renderRequestCard(request, true))}
        </div>
      </div>
    </div>
  );
};

export default PatientRequestsHistoryTab;
