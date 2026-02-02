import React, { Suspense, lazy, useEffect, useState } from 'react';

const LazyToaster = lazy(() => import('sonner').then((mod) => ({ default: mod.Toaster })));

const ToastHost = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <LazyToaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#FFFFFF',
            border: '1px solid #E0E0E0',
            borderRadius: '1rem',
            boxShadow: '0 4px 12px rgba(44, 62, 80, 0.1)'
          }
        }}
      />
    </Suspense>
  );
};

export default ToastHost;
