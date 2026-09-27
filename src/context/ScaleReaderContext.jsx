import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePersistentState } from '../lib/persist.js';
import { isSerialSupported, openScalePort } from '../lib/serialScale.js';

// The live connection to the physical scale plugged into THIS computer. Unlike ScalesContext
// (the shop-wide device list, synced through the server), a serial port is local hardware: it
// can only be opened once, by the browser on the machine the cable is plugged into — so the
// connection, its baud rate, and the tare offset are per-device state, not synced.
const ScaleReaderContext = createContext(null);

export function ScaleReaderProvider({ children }) {
  const supported = isSerialSupported();
  const [serialSettings, setSerialSettings] = usePersistentState('scrapshop_scale_serial', { baudRate: 9600, pollCommand: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(null);
  const [tareOffset, setTareOffset] = useState(0);
  const closeRef = useRef(null);

  const disconnect = useCallback(async () => {
    const close = closeRef.current;
    closeRef.current = null;
    if (close) await close();
    setStatus('idle');
    setReading(null);
  }, []);

  const openPort = useCallback(
    async (port) => {
      setStatus('connecting');
      setError('');
      try {
        closeRef.current = await openScalePort(port, {
          baudRate: serialSettings.baudRate,
          pollCommand: serialSettings.pollCommand,
          onReading: (r) => setReading({ ...r, at: Date.now() }),
          onClosed: () => {
            closeRef.current = null;
            setStatus('idle');
            setReading(null);
            setError('การเชื่อมต่อเครื่องชั่งหลุด — ตรวจสอบสายแล้วกดเชื่อมต่อใหม่');
          },
        });
        setStatus('connected');
      } catch (err) {
        setStatus('error');
        setError(
          err?.name === 'InvalidStateError'
            ? 'พอร์ตนี้ถูกเปิดใช้งานอยู่แล้ว (อาจเปิดอยู่ในอีกแท็บหรือโปรแกรมอื่น)'
            : `เชื่อมต่อเครื่องชั่งไม่สำเร็จ: ${err?.message || err}`
        );
      }
    },
    [serialSettings.baudRate, serialSettings.pollCommand]
  );

  // Asks the user to pick the scale's port (browser permission prompt, needs a click). After
  // that first grant the browser remembers it, so later visits reconnect on their own below.
  const connect = useCallback(async () => {
    if (!supported) return;
    let port;
    try {
      port = await navigator.serial.requestPort();
    } catch {
      return; // user cancelled the picker
    }
    await disconnect();
    await openPort(port);
  }, [supported, disconnect, openPort]);

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    (async () => {
      const ports = await navigator.serial.getPorts();
      if (!cancelled && ports[0] && !closeRef.current) await openPort(ports[0]);
    })();
    return () => {
      cancelled = true;
      disconnect();
    };
    // Reconnect only on mount (and after the baud/poll settings change, via openPort's deps).
  }, [supported, openPort, disconnect]);

  const netWeight = reading ? Math.round((reading.weight - tareOffset) * 1000) / 1000 : 0;

  return (
    <ScaleReaderContext.Provider
      value={{
        supported,
        status,
        error,
        reading,
        netWeight,
        tareOffset,
        tare: () => reading && setTareOffset(reading.weight),
        clearTare: () => setTareOffset(0),
        connect,
        disconnect,
        serialSettings,
        setSerialSettings,
      }}
    >
      {children}
    </ScaleReaderContext.Provider>
  );
}

export function useScaleReader() {
  const ctx = useContext(ScaleReaderContext);
  if (!ctx) throw new Error('useScaleReader must be used within a ScaleReaderProvider');
  return ctx;
}
