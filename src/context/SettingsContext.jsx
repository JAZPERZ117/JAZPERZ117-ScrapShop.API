import { createContext, useContext, useEffect } from 'react';
import { usePersistentState } from '../lib/persist.js';

export const INITIAL_SETTINGS = {
  shopName: 'ร้าน อ.อนงค์ค้าของเก่า',
  taxId: '3-1009-XXXXX-XX-X',
  address: '99/4 หมู่ 3 ต.เกาะเต่า อ.เกาะพะงัน จ.สุราษฎร์ธานี',
  phone: '077-456-789',
  hours: '08:00 – 17:30 น.',
  receiptFooter: 'ขอบคุณที่ใช้บริการ · โปรดเก็บใบเสร็จไว้เป็นหลักฐาน',
  remember30: true,
  pinLogin: true,
  theme: 'light',
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = usePersistentState('scrapshop_settings', INITIAL_SETTINGS);

  // Applied at the provider level (not inside the Settings page) so the theme is in
  // effect on every page, not just while the settings page happens to be open.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme === 'dark' ? 'dark' : 'light');
  }, [settings.theme]);

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <SettingsContext.Provider value={{ settings, setSettings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
