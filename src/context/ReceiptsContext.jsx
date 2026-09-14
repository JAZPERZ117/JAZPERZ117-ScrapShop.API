import { createContext, useContext, useEffect } from 'react';
import { usePersistentState } from '../lib/persist.js';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Real deployment: no receipts exist yet until the shop actually starts making sales.
export const INITIAL_RECEIPTS = {};

export const INITIAL_ORDER = [];

const ReceiptsContext = createContext(null);

export function ReceiptsProvider({ children }) {
  const [receipts, setReceipts] = usePersistentState('scrapshop_receipts', INITIAL_RECEIPTS);
  const [order, setOrder] = usePersistentState('scrapshop_receipts_order', INITIAL_ORDER);

  // One-time migration: receipts used to have no real calendar date (only a time-of-day
  // string), so the date filter on the Receipts page had nothing to filter by. Anything
  // saved before this gets backfilled with today's date so it doesn't just disappear.
  useEffect(() => {
    const today = todayISO();
    setReceipts((prev) => {
      let changed = false;
      const next = {};
      for (const id in prev) {
        if (!prev[id].date) {
          changed = true;
          next[id] = { ...prev[id], date: today };
        } else {
          next[id] = prev[id];
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addReceipt(data) {
    const id = data.no;
    const date = todayISO();
    setReceipts((prev) => ({ ...prev, [id]: { date, ...data } }));
    setOrder((prev) => [id, ...prev]);
    return data;
  }

  return (
    <ReceiptsContext.Provider value={{ receipts, setReceipts, order, setOrder, addReceipt }}>
      {children}
    </ReceiptsContext.Provider>
  );
}

export function useReceipts() {
  const ctx = useContext(ReceiptsContext);
  if (!ctx) throw new Error('useReceipts must be used within a ReceiptsProvider');
  return ctx;
}
