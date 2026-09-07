import { createContext, useContext } from 'react';
import { usePersistentState } from '../lib/persist.js';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Starts empty — this is a brand-new feature with no real history yet, unlike the other
// contexts' seed data which represents this shop's pre-existing business.
export const INITIAL_DELIVERIES = {};
export const INITIAL_ORDER = [];

const DeliveriesContext = createContext(null);

export function DeliveriesProvider({ children }) {
  const [deliveries, setDeliveries] = usePersistentState('scrapshop_deliveries', INITIAL_DELIVERIES);
  const [order, setOrder] = usePersistentState('scrapshop_deliveries_order', INITIAL_ORDER);

  function addDelivery(data) {
    const id = data.no;
    const date = todayISO();
    setDeliveries((prev) => ({ ...prev, [id]: { date, status: 'pending', ...data } }));
    setOrder((prev) => [id, ...prev]);
    return data;
  }

  function markDelivered(id) {
    setDeliveries((prev) => ({ ...prev, [id]: { ...prev[id], status: 'delivered' } }));
  }

  return (
    <DeliveriesContext.Provider value={{ deliveries, setDeliveries, order, setOrder, addDelivery, markDelivered }}>
      {children}
    </DeliveriesContext.Provider>
  );
}

export function useDeliveries() {
  const ctx = useContext(DeliveriesContext);
  if (!ctx) throw new Error('useDeliveries must be used within a DeliveriesProvider');
  return ctx;
}
