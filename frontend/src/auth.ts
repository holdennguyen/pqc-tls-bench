/** Fake session — DEMO ONLY, frontend-only. Any credentials are accepted and a
 * flag lands in sessionStorage; real auth is deliberately out of scope for the
 * measurement testbed (CLAUDE.md). Transitions are sensor-scoped "auth". */
import { sense } from './sensors';

const KEY = 'clinic_session';

export function currentUser(): string | null {
  return sessionStorage.getItem(KEY);
}

export const login = sense(
  'auth',
  [{ name: 'session_stored', check: () => sessionStorage.getItem(KEY) != null }],
  async function login(username: string): Promise<string> {
    sessionStorage.setItem(KEY, username || 'demo');
    return username;
  },
);

export const logout = sense(
  'auth',
  [{ name: 'session_cleared', check: () => sessionStorage.getItem(KEY) == null }],
  async function logout(): Promise<void> {
    sessionStorage.removeItem(KEY);
  },
);
