import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePersistentState } from '../lib/persist.js';
import { usePolling } from '../lib/polling.js';
import { getToken } from '../lib/auth.js';

export const INITIAL_SETTINGS = {
  shopName: 'ร้าน อ.อนงค์ค้าของเก่า',
  taxId: '3-1009-XXXXX-XX-X',
  address: '99/4 หมู่ 3 ต.เกาะเต่า อ.เกาะพะงัน จ.สุราษฎร์ธานี',
  phone: '077-456-789',
  hours: '08:00 – 17:30 น.',
  receiptFooter: 'ขอบคุณที่ใช้บริการ · โปรดเก็บใบเสร็จไว้เป็นหลักฐาน',
  remember30: true,
  pinLogin: true,
};

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  // Theme is a per-device display preference (screen glare and lighting differ at each till),
  // not shop data — kept in this browser's own localStorage rather than synced from the server,
  // per an explicit product decision, unlike every field below.
  const [theme, setTheme] = usePersistentState('scrapshop_theme', 'light');
  const [shopSettings, setShopSettings] = useState(INITIAL_SETTINGS);
  // Settings.jsx keeps its own editable draft seeded from `settings` on mount — since that
  // fetch is now async, `loaded` tells it once to re-seed the draft from the real values
  // instead of staying stuck on the client-side defaults it started with.
  const [loaded, setLoaded] = useState(false);

  // Shop settings used to live only in this browser's own localStorage. GET /api/settings is
  // one of the only endpoints not behind requireAuth (see server/src/index.js) since Login.jsx
  // needs shop hours and whether PIN login is enabled before anyone has signed in.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = await res.json();
      setShopSettings(data.settings);
    } catch {
      // Offline, server down, or not logged in yet — keep the defaults already shown.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  usePolling(refresh, 5000);

  // Applied at the provider level (not inside the Settings page) so the theme is in
  // effect on every page, not just while the settings page happens to be open.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }, [theme]);

  const settings = { ...shopSettings, theme };

  async function updateSetting(key, value) {
    if (key === 'theme') {
      setTheme(value);
      return;
    }
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ [key]: value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกการตั้งค่าไม่สำเร็จ');
    setShopSettings(data.settings);
  }

  // Bulk save for Settings.jsx's "บันทึกการตั้งค่า" button — theme was already applied
  // instantly via updateSetting('theme', ...) when the user picked it, so it's just re-applied
  // here (harmless) and stripped before the rest goes to the server.
  async function saveSettings(patch) {
    const { theme: nextTheme, ...rest } = patch;
    if (nextTheme !== undefined) setTheme(nextTheme);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(rest),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกการตั้งค่าไม่สำเร็จ');
    setShopSettings(data.settings);
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, saveSettings, refresh, loaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
