// Reads a real digital scale over USB/RS-232 via the browser's Web Serial API (Chrome/Edge,
// in a secure context: localhost or https). Most shop platform scales stream a line per reading
// in "continuous output" mode, e.g. CAS/Tiger style "ST,GS,+  0012.34kg" — the parser below is
// deliberately format-tolerant rather than tied to one brand.

export function isSerialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

const UNIT_TO_KG = { kg: 1, g: 0.001, lb: 0.45359237 };

// Returns { weight (kg), stable } or null for lines that carry no reading (status chatter,
// blank keep-alives). Prefers a number immediately followed by a unit, so a leading device id
// like "01 ST GS 7.25 kg" reads as 7.25, not 1.
export function parseScaleLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  const numberRe = /([-+])?\s*(\d+(?:[.,]\d+)?)\s*(kg|g|lb)?/gi;
  let withUnit = null;
  let last = null;
  for (const m of text.matchAll(numberRe)) {
    last = m;
    if (m[3]) withUnit = m;
  }
  const m = withUnit || last;
  if (!m) return null;
  const unit = (m[3] || 'kg').toLowerCase();
  let weight = parseFloat(m[2].replace(',', '.')) * UNIT_TO_KG[unit];
  if (m[1] === '-') weight = -weight;
  const stable = /\bUS\b|unstable|motion/i.test(text) ? false : true;
  return { weight: Math.round(weight * 1000) / 1000, stable };
}

// Opens `port`, streams parsed readings to onReading until close() is called or the device is
// unplugged. Optionally writes `pollCommand` every 500ms for scales that only answer on request.
export async function openScalePort(port, { baudRate, pollCommand, onReading, onClosed }) {
  await port.open({ baudRate: Number(baudRate) || 9600 });
  const decoder = new TextDecoderStream();
  const pipeDone = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();
  let pollTimer = null;
  if (pollCommand) {
    const encoded = new TextEncoder().encode(pollCommand.replace(/\\r/g, '\r').replace(/\\n/g, '\n'));
    pollTimer = setInterval(async () => {
      try {
        const writer = port.writable.getWriter();
        await writer.write(encoded);
        writer.releaseLock();
      } catch {
        // Port closing or busy — the next tick or the close path handles it.
      }
    }, 500);
  }

  let closed = false;
  (async () => {
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split(/\r\n|\r|\n/);
        buffer = lines.pop();
        for (const line of lines) {
          const reading = parseScaleLine(line);
          if (reading) onReading(reading);
        }
      }
    } catch {
      // Device unplugged or read aborted — fall through to cleanup.
    }
    if (!closed) {
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      onClosed?.();
    }
  })();

  return async function close() {
    if (closed) return;
    closed = true;
    if (pollTimer) clearInterval(pollTimer);
    try {
      await reader.cancel();
    } catch {
      // already cancelled
    }
    await pipeDone;
    try {
      await port.close();
    } catch {
      // already closed (e.g. unplugged)
    }
  };
}
