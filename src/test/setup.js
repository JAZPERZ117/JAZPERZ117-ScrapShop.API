import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Every context under test persists to localStorage via usePersistentState — without
// clearing it between tests, state from one test's assertions would leak into the next.
afterEach(() => {
  localStorage.clear();
});
