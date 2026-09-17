import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken } from '../lib/auth.js';
import { usePolling } from '../lib/polling.js';

// ID cards are flagged as "near expiry" inside this many days of idExpiry (including
// already-past dates) — renewing a customer's idExpiry date is what clears the warning.
const ID_WARN_WINDOW_DAYS = 30;

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

// Real deployment: no customers exist yet until the shop actually adds one. Kept exported —
// Dashboard.jsx's "new customers" count still diffs against this to mean "not present at
// install time", which is still every real customer since this has always been empty.
export const INITIAL_ORDER = [];

const CustomersContext = createContext(null);

export function CustomersProvider({ children }) {
  const [customersRaw, setCustomersRaw] = useState({});
  const [order, setOrder] = useState([]);

  // Customer records — including ID card numbers and photos — used to live only in this
  // browser's own localStorage: unencrypted, readable by anyone with DevTools access to the
  // browser profile, with no login required at all. Now fetched from the real database behind
  // requireAuth instead, same as PIN accounts already were.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/customers', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      const ord = [];
      for (const c of data.customers) {
        map[c.id] = c;
        ord.push(c.id);
      }
      setCustomersRaw(map);
      setOrder(ord);
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  usePolling(refresh, 5000);

  // idWarn/idDaysLeft are derived live from idExpiry vs today, not stored — so renewing
  // a customer's ID (editing idExpiry to a future date) immediately clears the warning
  // instead of leaving a stale flag that nothing can ever turn off.
  const customers = useMemo(() => {
    const out = {};
    for (const id in customersRaw) {
      const c = customersRaw[id];
      const idDaysLeft = daysUntil(c.idExpiry);
      // "since" is derived from the real createdAt instead of trusting BLANK_CUSTOMER's
      // hardcoded seed value — otherwise every newly added customer would forever show
      // the same frozen "พ.ค. 2567" regardless of when they were actually added. Customers
      // created before createdAt existed have no way to know their real join date, so they
      // keep whatever "since" value they already have.
      const since = c.createdAt
        ? new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'short', year: 'numeric' }).format(new Date(c.createdAt))
        : c.since;
      out[id] = { ...c, idDaysLeft, idWarn: idDaysLeft <= ID_WARN_WINDOW_DAYS, since };
    }
    return out;
  }, [customersRaw]);

  async function addCustomer({ name, phone, idNumber, idExpiry, idPhoto }) {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, phone, idNumber, idExpiry, idPhoto }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'เพิ่มลูกค้าไม่สำเร็จ');
    setCustomersRaw((prev) => ({ ...prev, [data.customer.id]: data.customer }));
    setOrder((prev) => [data.customer.id, ...prev]);
    return data.customer;
  }

  async function updateCustomer(id, patch) {
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกข้อมูลลูกค้าไม่สำเร็จ');
    setCustomersRaw((prev) => ({ ...prev, [id]: data.customer }));
    return data.customer;
  }

  async function deleteCustomer(id) {
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'ลบลูกค้าไม่สำเร็จ');
    }
    setCustomersRaw((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((oid) => oid !== id));
  }

  // Called once per completed purchase (see ScrapPurchase.jsx). Best-effort: the receipt itself
  // is already saved by the time this runs, so a failure here (e.g. a dropped LAN connection)
  // shouldn't be surfaced as if the sale itself failed — it only means this customer's
  // cumulative stats will look stale until the next successful sync.
  async function recordPurchase(id, { weightKg, amount, receiptNo, timeStr }) {
    if (!id) return;
    try {
      const res = await fetch(`/api/customers/${id}/record-purchase`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ weightKg, amount, receiptNo, timeStr }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setCustomersRaw((prev) => ({ ...prev, [id]: data.customer }));
    } catch {
      // best-effort, see above
    }
  }

  // Inverse of recordPurchase — called when a receipt is voided (see Receipts.jsx).
  async function reversePurchase(id, { weightKg, amount, receiptNo }) {
    if (!id) return;
    try {
      const res = await fetch(`/api/customers/${id}/reverse-purchase`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ weightKg, amount, receiptNo }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setCustomersRaw((prev) => ({ ...prev, [id]: data.customer }));
    } catch {
      // best-effort, see recordPurchase
    }
  }

  return (
    <CustomersContext.Provider
      value={{ customers, order, addCustomer, updateCustomer, deleteCustomer, recordPurchase, reversePurchase, refresh }}
    >
      {children}
    </CustomersContext.Provider>
  );
}

export function useCustomers() {
  const ctx = useContext(CustomersContext);
  if (!ctx) throw new Error('useCustomers must be used within a CustomersProvider');
  return ctx;
}
