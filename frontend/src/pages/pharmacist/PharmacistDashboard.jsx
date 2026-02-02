import React, { Suspense, useEffect, useState, lazy } from 'react';
import CriticalPharmacistShell from './CriticalPharmacistShell';

const PharmacistDashboardLazy = lazy(() => import('./PharmacistDashboardLazy'));

const PharmacistDashboard = () => {
  const [showLazy, setShowLazy] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShowLazy(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!showLazy) {
    return <CriticalPharmacistShell />;
  }

  return (
    <Suspense fallback={<CriticalPharmacistShell />}>
      <PharmacistDashboardLazy />
    </Suspense>
  );
};

export default PharmacistDashboard;
