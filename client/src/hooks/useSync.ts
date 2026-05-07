import { useEffect, useCallback } from 'react';

export function useSync(refetch: () => void, intervalMs = 60000) {
  const handleVisibility = useCallback(() => {
    if (document.visibilityState === 'visible') refetch();
  }, [refetch]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibility);
    const id = setInterval(refetch, intervalMs);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(id);
    };
  }, [handleVisibility, refetch, intervalMs]);
}
