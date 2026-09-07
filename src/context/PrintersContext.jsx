import { createContext, useContext } from 'react';
import { usePersistentState } from '../lib/persist.js';

export const INITIAL_PRINTERS = {
  thermal: { name: 'เครื่องพิมพ์ใบเสร็จหน้าร้าน', model: 'Epson TM-T82 · กระดาษความร้อน 80mm', connected: true },
  a4: { name: 'เครื่องพิมพ์สำนักงาน A4', model: 'HP LaserJet M132 · กระดาษ A4', connected: true },
};

export const INITIAL_ORDER = ['thermal', 'a4'];

const PrintersContext = createContext(null);

export function PrintersProvider({ children }) {
  const [printers, setPrinters] = usePersistentState('scrapshop_printers', INITIAL_PRINTERS);
  const [order, setOrder] = usePersistentState('scrapshop_printers_order', INITIAL_ORDER);

  function toggleConnected(id) {
    setPrinters((prev) => ({ ...prev, [id]: { ...prev[id], connected: !prev[id].connected } }));
  }

  return (
    <PrintersContext.Provider value={{ printers, setPrinters, order, setOrder, toggleConnected }}>
      {children}
    </PrintersContext.Provider>
  );
}

export function usePrinters() {
  const ctx = useContext(PrintersContext);
  if (!ctx) throw new Error('usePrinters must be used within a PrintersProvider');
  return ctx;
}
