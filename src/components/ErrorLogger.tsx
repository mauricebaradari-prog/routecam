'use client';
import { useEffect, useState } from 'react';

// Debug banner for development only – visitors of the live site never see it.
export default function ErrorLogger() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <DevErrorBanner />;
}

function DevErrorBanner() {
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      // "Script error." without a file = an error inside a script from another site
      // (YouTube player, Google sign-in). The browser hides its details, it isn't ours,
      // and it doesn't affect RouteCam – don't show it.
      if (!e.filename && /^Script error\.?$/.test(e.message)) return;
      setErrors(prev => [...prev, "Error: " + e.message + " at " + e.filename + ":" + e.lineno]);
    };
    const handleRejection = (e: PromiseRejectionEvent) => {
      setErrors(prev => [...prev, "Promise Rejection: " + String(e.reason)]);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  if (errors.length === 0) return null;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'rgba(255,0,0,0.8)', color: 'white', padding: 10, zIndex: 99999, fontSize: 12, maxHeight: '30vh', overflow: 'auto' }}>
      <strong>Errors:</strong>
      <ul>
        {errors.map((err, i) => <li key={i}>{err}</li>)}
      </ul>
      <button onClick={() => setErrors([])} style={{ background: 'black', padding: '4px 8px', marginTop: 8 }}>Clear</button>
    </div>
  );
}
