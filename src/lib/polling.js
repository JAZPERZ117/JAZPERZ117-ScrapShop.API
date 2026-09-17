import { useEffect, useRef } from 'react';

// Re-runs `callback` on a fixed interval so shared data (customers, receipts, stock, etc.)
// picked up by another device shows up here without a manual refresh. The callback is kept in
// a ref and read fresh on every tick instead of being a useEffect dependency, so the interval
// doesn't get torn down and restarted every time the calling context re-renders with a new
// `refresh` function identity.
export function usePolling(callback, intervalMs) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const id = setInterval(() => callbackRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
