import { parseScaleLine } from '../serialScale.js';

describe('parseScaleLine', () => {
  it.each([
    ['ST,GS,+  0012.34kg', 12.34, true],
    ['US,GS,+  0003.10kg', 3.1, false],
    ['ST,NT,-0000.20kg', -0.2, true],
    ['   25.5 kg', 25.5, true],
    ['wn0012.345kg', 12.345, true],
    ['1500 g', 1.5, true],
    ['01 ST GS   7.25 kg', 7.25, true],
    ['  42.00', 42, true],
    ['12,50 kg', 12.5, true],
  ])('reads %j as %d kg (stable=%s)', (line, weight, stable) => {
    expect(parseScaleLine(line)).toEqual({ weight, stable });
  });

  it.each(['', '   ', 'ERR', 'OL', 'ST,GS,'])('ignores %j', (line) => {
    expect(parseScaleLine(line)).toBeNull();
  });
});
