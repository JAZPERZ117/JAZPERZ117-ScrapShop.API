import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getToken } from '../lib/auth.js';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const ReceiptsContext = createContext(null);

export function ReceiptsProvider({ children }) {
  const [receipts, setReceipts] = useState({});
  const [order, setOrder] = useState([]);

  // Receipts — the core transaction record every report page reads from — used to live only
  // in this browser's own localStorage. A sale rung up on one device needs to show up in every
  // other device's "today's receipts" and totals immediately, not stay invisible until someone
  // happens to look at that one browser. Fetched from the real database behind requireAuth,
  // same as users/customers/products.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/receipts', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      const ord = [];
      for (const r of data.receipts) {
        map[r.no] = r;
        ord.push(r.no);
      }
      setReceipts(map);
      setOrder(ord);
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addReceipt(data) {
    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'บันทึกใบเสร็จไม่สำเร็จ');
    setReceipts((prev) => ({ ...prev, [result.receipt.no]: result.receipt }));
    setOrder((prev) => [result.receipt.no, ...prev]);
    return result.receipt;
  }

  async function voidReceipt(no) {
    const res = await fetch(`/api/receipts/${no}/void`, { method: 'PUT', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ยกเลิกใบเสร็จไม่สำเร็จ');
    setReceipts((prev) => ({ ...prev, [no]: data.receipt }));
    return data.receipt;
  }

  async function updateReceipt(no, patch) {
    const res = await fetch(`/api/receipts/${no}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกการแก้ไขใบเสร็จไม่สำเร็จ');
    setReceipts((prev) => ({ ...prev, [no]: data.receipt }));
    return data.receipt;
  }

  return (
    <ReceiptsContext.Provider value={{ receipts, order, addReceipt, voidReceipt, updateReceipt, refresh }}>
      {children}
    </ReceiptsContext.Provider>
  );
}

export function useReceipts() {
  const ctx = useContext(ReceiptsContext);
  if (!ctx) throw new Error('useReceipts must be used within a ReceiptsProvider');
  return ctx;
}
