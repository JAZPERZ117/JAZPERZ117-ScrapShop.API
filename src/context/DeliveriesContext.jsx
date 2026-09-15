import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getToken } from '../lib/auth.js';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const DeliveriesContext = createContext(null);

export function DeliveriesProvider({ children }) {
  const [deliveries, setDeliveries] = useState({});
  const [order, setOrder] = useState([]);

  // Deliveries (outbound shipments to buyers) used to live only in this browser's own
  // localStorage — a delivery dispatched from one device needs to show up (and its stock
  // commitment be accounted for) on every other device immediately, not stay invisible.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/deliveries', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      const ord = [];
      for (const d of data.deliveries) {
        map[d.no] = d;
        ord.push(d.no);
      }
      setDeliveries(map);
      setOrder(ord);
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addDelivery(data) {
    const res = await fetch('/api/deliveries', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'บันทึกใบส่งของไม่สำเร็จ');
    setDeliveries((prev) => ({ ...prev, [result.delivery.no]: result.delivery }));
    setOrder((prev) => [result.delivery.no, ...prev]);
    return result.delivery;
  }

  async function updateDelivery(no, patch) {
    const res = await fetch(`/api/deliveries/${no}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกการแก้ไขใบส่งของไม่สำเร็จ');
    setDeliveries((prev) => ({ ...prev, [no]: data.delivery }));
    return data.delivery;
  }

  async function deleteDelivery(no) {
    const res = await fetch(`/api/deliveries/${no}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'ลบใบส่งของไม่สำเร็จ');
    }
    setDeliveries((prev) => {
      const next = { ...prev };
      delete next[no];
      return next;
    });
    setOrder((prev) => prev.filter((oid) => oid !== no));
  }

  async function markDelivered(no) {
    const res = await fetch(`/api/deliveries/${no}/deliver`, { method: 'PUT', headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setDeliveries((prev) => ({ ...prev, [no]: data.delivery }));
  }

  return (
    <DeliveriesContext.Provider
      value={{ deliveries, order, addDelivery, updateDelivery, deleteDelivery, markDelivered, refresh }}
    >
      {children}
    </DeliveriesContext.Provider>
  );
}

export function useDeliveries() {
  const ctx = useContext(DeliveriesContext);
  if (!ctx) throw new Error('useDeliveries must be used within a DeliveriesProvider');
  return ctx;
}
