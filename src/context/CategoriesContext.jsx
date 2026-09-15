import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken } from '../lib/auth.js';
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

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const CategoriesContext = createContext(null);

export function CategoriesProvider({ children }) {
  const [categoriesRaw, setCategoriesRaw] = useState({});
  const [order, setOrder] = useState([]);

  // Categories used to live only in this browser's own localStorage. Fetched from the real
  // database behind requireAuth, same as every other resource.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/categories', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      const ord = [];
      for (const c of data.categories) {
        map[c.id] = c;
        ord.push(c.id);
      }
      setCategoriesRaw(map);
      setOrder(ord);
    } catch {
      // Offline or server down — leave whatever's already loaded rather than clearing it.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  async function createCategory(data) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'เพิ่มหมวดหมู่ไม่สำเร็จ');
    setCategoriesRaw((prev) => ({ ...prev, [result.category.id]: result.category }));
    setOrder((prev) => [result.category.id, ...prev]);
    return result.category;
  }

  async function updateCategory(id, patch) {
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'บันทึกการเปลี่ยนแปลงไม่สำเร็จ');
    setCategoriesRaw((prev) => ({ ...prev, [id]: data.category }));
    return data.category;
  }

  async function deleteCategory(id) {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'ลบหมวดหมู่ไม่สำเร็จ');
    }
    setCategoriesRaw((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((oid) => oid !== id));
  }

  // Persists a full manual reorder (see Categories.jsx's "เรียงลำดับ" sort-by-name action) so
  // the chosen order is the same on every device, not just each browser's own insertion order.
  async function reorderCategories(nextOrder) {
    const res = await fetch('/api/categories/reorder', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ order: nextOrder }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const map = {};
    const ord = [];
    for (const c of data.categories) {
      map[c.id] = c;
      ord.push(c.id);
    }
    setCategoriesRaw(map);
    setOrder(ord);
  }

  return (
    <CategoriesContext.Provider
      value={{ categories, order, createCategory, updateCategory, deleteCategory, reorderCategories, refresh }}
    >
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within a CategoriesProvider');
  return ctx;
}
