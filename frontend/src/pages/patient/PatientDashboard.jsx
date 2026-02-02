import React, { Suspense, useEffect, useState, lazy } from 'react';
import CriticalPatientShell from './CriticalPatientShell';

const PatientDashboardLazy = lazy(() => import('./PatientDashboardLazy'));

const PatientDashboard = () => {
  const [showLazy, setShowLazy] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShowLazy(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!showLazy) {
    return <CriticalPatientShell />;
  }

  return (
    <Suspense fallback={<CriticalPatientShell />}>
      <PatientDashboardLazy />
    </Suspense>
  );
};

export default PatientDashboard;
