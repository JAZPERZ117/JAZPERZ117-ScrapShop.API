import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken } from '../lib/auth.js';
import { usePolling } from '../lib/polling.js';
import { IconDroplet, IconCircleX, IconBox, IconMagnet, IconScale, IconCrop, IconEdit } from '../icons.jsx';

// Icon components can't survive JSON persistence, so they're re-attached from this
// map (by reason id) every time the data is read, instead of being stored.
const ICON_MAP = {
  wet: IconDroplet,
  dirty: IconCircleX,
  package: IconBox,
  rusty: IconMagnet,
  scale: IconScale,
  broken: IconCrop,
  other: IconEdit,
};

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const DeductionsContext = createContext(null);

export function DeductionsProvider({ children }) {
  const [reasonsRaw, setReasonsRaw] = useState({});
  const [order, setOrder] = useState([]);

  // Deduction reasons — including the "ใช้แล้ว N ครั้ง"/"ยอดหักรวม" usage counters — used to
  // live only in this browser's own localStorage. Fetched from the real database behind
  // requireAuth, same as users/customers/products/receipts/deliveries/staff.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/deduction-reasons', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      const ord = [];
      for (const r of data.reasons) {
        map[r.id] = r;
        ord.push(r.id);
      }
      setReasonsRaw(map);
      setOrder(ord);
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  usePolling(refresh, 5000);

  const reasons = useMemo(() => {
    const withIcons = {};
    for (const id in reasonsRaw) {
      withIcons[id] = { ...reasonsRaw[id], Icon: ICON_MAP[id] || IconEdit };
    }
    return withIcons;
  }, [reasonsRaw]);

  async function createReason(data) {
    const res = await fetch('/api/deduction-reasons', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'เพิ่มเหตุผลไม่สำเร็จ');
    setReasonsRaw((prev) => ({ ...prev, [result.reason.id]: result.reason }));
    setOrder((prev) => [result.reason.id, ...prev]);
    return result.reason;
  }

  async function updateReason(id, patch) {
    const res = await fetch(`/api/deduction-reasons/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกการเปลี่ยนแปลงไม่สำเร็จ');
    setReasonsRaw((prev) => ({ ...prev, [id]: data.reason }));
    return data.reason;
  }

  async function deleteReason(id) {
    const res = await fetch(`/api/deduction-reasons/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'ลบเหตุผลไม่สำเร็จ');
    }
    setReasonsRaw((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((oid) => oid !== id));
  }

  // Called once per reason actually applied on a submitted receipt (see ScrapPurchase.jsx),
  // so "ใช้แล้ว N ครั้ง" / "ยอดหักรวม" reflect real usage instead of frozen seed numbers.
  async function incrementUsage(id, moneyAmount) {
    if (!id) return;
    try {
      const res = await fetch(`/api/deduction-reasons/${id}/increment-usage`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ amount: moneyAmount }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.reason) setReasonsRaw((prev) => ({ ...prev, [id]: data.reason }));
    } catch {
      // best-effort, mirrors recordPurchase/addStock — the receipt itself is already saved.
    }
  }

  // Inverse of incrementUsage — called when a receipt that applied this reason gets voided
  // (see Receipts.jsx handleVoid), so the counters don't stay permanently inflated by a
  // purchase that was fully reversed everywhere else.
  async function decrementUsage(id, moneyAmount) {
    if (!id) return;
    try {
      const res = await fetch(`/api/deduction-reasons/${id}/decrement-usage`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ amount: moneyAmount }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.reason) setReasonsRaw((prev) => ({ ...prev, [id]: data.reason }));
    } catch {
      // best-effort, see incrementUsage
    }
  }

  return (
    <DeductionsContext.Provider
      value={{ reasons, order, createReason, updateReason, deleteReason, incrementUsage, decrementUsage, refresh }}
    >
      {children}
    </DeductionsContext.Provider>
  );
}

export function useDeductions() {
  const ctx = useContext(DeductionsContext);
  if (!ctx) throw new Error('useDeductions must be used within a DeductionsProvider');
  return ctx;
}
