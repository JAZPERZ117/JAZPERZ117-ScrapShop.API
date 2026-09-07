import { createContext, useContext, useMemo } from 'react';
import { usePersistentState } from '../lib/persist.js';
import { IconMagnet, IconCardboard, IconBottle, IconGlass, IconDevice, IconCategory } from '../icons.jsx';

// Icon components can't survive JSON persistence, so raw data stores an iconKey
// and the provider re-attaches the real component on every read (same pattern as DeductionsContext).
const ICON_MAP = {
  metal: IconMagnet,
  paper: IconCardboard,
  plastic: IconBottle,
  glass: IconGlass,
  electronics: IconDevice,
  other: IconCategory,
};

export const SWATCHES = ['amber', 'rose', 'blue', 'plum', 'teal', 'green', 'slate'];
export const SWATCH_COLOR = {
  amber: '#B8720A',
  rose: '#D8477A',
  blue: '#2D6FE0',
  plum: '#8B4FD8',
  teal: '#0E8E82',
  green: '#1F9D5C',
  slate: '#5B6B77',
};
const SWATCH_BG = {
  amber: 'var(--amber-bg)',
  rose: 'var(--rose-bg)',
  blue: 'var(--blue-bg)',
  plum: 'var(--plum-bg)',
  teal: 'var(--teal-bg, #E4F6F4)',
  green: 'var(--green-100)',
  slate: 'var(--bg)',
};

export const INITIAL_CATEGORIES_RAW = {
  metal: { name: 'โลหะ', iconKey: 'metal', color: 'amber', desc: 'เศษโลหะทุกชนิด เช่น เหล็ก ทองแดง อลูมิเนียม สแตนเลส และทองเหลือง', isActive: true },
  paper: { name: 'กระดาษ', iconKey: 'paper', color: 'blue', desc: 'กระดาษลัง กระดาษหนังสือพิมพ์ กระดาษขาว-ดำ และกระดาษรวม', isActive: true },
  plastic: { name: 'พลาสติก', iconKey: 'plastic', color: 'plum', desc: 'ขวดพลาสติก ถุงพลาสติก และพลาสติกแข็งทุกชนิด', isActive: true },
  glass: { name: 'แก้ว', iconKey: 'glass', color: 'teal', desc: 'ขวดแก้วใส ขวดแก้วสี และเศษแก้วทุกชนิด', isActive: true },
  electronics: { name: 'อิเล็กทรอนิกส์', iconKey: 'electronics', color: 'rose', desc: 'อุปกรณ์อิเล็กทรอนิกส์เก่า แผงวงจร และสายไฟ (ปิดใช้งานชั่วคราว)', isActive: false },
  other: { name: 'อื่นๆ', iconKey: 'other', color: 'slate', desc: 'สินค้าเบ็ดเตล็ดที่ไม่เข้าหมวดหมู่หลัก', isActive: true },
};

export const INITIAL_ORDER = ['metal', 'paper', 'plastic', 'glass', 'electronics', 'other'];

export const BLANK_CATEGORY_RAW = { name: '', iconKey: 'other', color: 'slate', desc: '', isActive: true };

const CategoriesContext = createContext(null);

export function CategoriesProvider({ children }) {
  const [categoriesRaw, setCategoriesRaw] = usePersistentState('scrapshop_categories', INITIAL_CATEGORIES_RAW);
  const [order, setOrder] = usePersistentState('scrapshop_categories_order', INITIAL_ORDER);

  const categories = useMemo(() => {
    const out = {};
    for (const id in categoriesRaw) {
      const c = categoriesRaw[id];
      out[id] = {
        ...c,
        Icon: ICON_MAP[c.iconKey] || IconCategory,
        bg: SWATCH_BG[c.color] || 'var(--bg)',
        fg: SWATCH_COLOR[c.color] || 'var(--ink-500)',
      };
    }
    return out;
  }, [categoriesRaw]);

  return (
    <CategoriesContext.Provider value={{ categories, setCategoriesRaw, order, setOrder }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within a CategoriesProvider');
  return ctx;
}
