import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getToken } from '../lib/auth.js';
import { usePolling } from '../lib/polling.js';

export const BLANK_DEVICE = { name: '', model: 'ไม่ระบุรุ่น', bg: 'var(--bg)', fg: 'var(--ink-500)', port: '—', conn: 'สาย USB / RS-232', max: '—', res: '—', cal: 'ยังไม่เคยสอบเทียบ', due: '—', status: 'off', active: false };

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const ScalesContext = createContext(null);

export function ScalesProvider({ children }) {
  const [devices, setDevices] = useState({});
  const [order, setOrder] = useState([]);
  const [activity, setActivity] = useState([]);

  // Scale devices used to live only in this browser's own localStorage. Fetched from the real
  // database behind requireAuth, same as every other resource, so ScrapPurchase.jsx's "main
  // scale" flag is the same device on every till instead of a per-browser guess.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/scales', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      const ord = [];
      for (const d of data.scales) {
        map[d.id] = d;
        ord.push(d.id);
      }
      setDevices(map);
      setOrder(ord);
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  const refreshActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/scales-activity', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setActivity(data.activity);
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshActivity();
  }, [refresh, refreshActivity]);
  usePolling(refresh, 5000);
  usePolling(refreshActivity, 5000);

  async function logActivity(entry) {
    try {
      const res = await fetch('/api/scales-activity', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(entry),
      });
      if (!res.ok) return;
      const data = await res.json();
      setActivity(data.activity);
    } catch {
      // Best-effort log — a failed write here shouldn't block the action that triggered it.
    }
  }

  async function createDevice(data) {
    const res = await fetch('/api/scales', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'เพิ่มเครื่องชั่งไม่สำเร็จ');
    setDevices((prev) => ({ ...prev, [result.scale.id]: result.scale }));
    setOrder((prev) => (data.atEnd ? [...prev, result.scale.id] : [result.scale.id, ...prev]));
    return result.scale;
  }

  async function updateDevice(id, patch) {
    const res = await fetch(`/api/scales/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกการตั้งค่าไม่สำเร็จ');
    setDevices((prev) => ({ ...prev, [id]: data.scale }));
    return data.scale;
  }

  async function setActiveDevice(id, active) {
    const res = await fetch(`/api/scales/${id}/set-active`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ active }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (active) {
      setDevices((prev) => {
        const next = {};
        for (const did in prev) next[did] = { ...prev[did], active: did === id };
        return next;
      });
    } else {
      setDevices((prev) => ({ ...prev, [id]: data.scale }));
    }
  }

  async function toggleConnected(id) {
    const next = devices[id]?.status === 'on' ? 'off' : 'on';
    try {
      await updateDevice(id, { status: next });
    } catch {
      // Best-effort toggle — the table already reflects the last known-good state on failure.
    }
  }

  async function deleteDevice(id) {
    const res = await fetch(`/api/scales/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'นำเครื่องชั่งออกไม่สำเร็จ');
    }
    setDevices((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((oid) => oid !== id));
  }

  return (
    <ScalesContext.Provider
      value={{ devices, order, activity, logActivity, createDevice, updateDevice, setActiveDevice, toggleConnected, deleteDevice, refresh }}
    >
      {children}
    </ScalesContext.Provider>
  );
}

export function useScales() {
  const ctx = useContext(ScalesContext);
  if (!ctx) throw new Error('useScales must be used within a ScalesProvider');
  return ctx;
}
