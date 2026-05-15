// Demo mode — client-side, sessionStorage-backed toggle.
// When ON, every call inside services/supabase.ts apiRequest() is intercepted and
// served from an in-memory store cloned from a frozen seed. Changes are local
// to the tab. Toggling OFF discards everything and the real backend resumes.

const FLAG_KEY = 'grc_demo_mode';
const STORE_KEY = 'grc_demo_store';

export const DEMO_ORG_NAME = 'ABC News';

export const isDemoEnabled = (): boolean => {
  try {
    return sessionStorage.getItem(FLAG_KEY) === 'true';
  } catch {
    return false;
  }
};

export const enableDemoMode = (): void => {
  try {
    sessionStorage.setItem(FLAG_KEY, 'true');
    // Clear any stale store so the next call hydrates fresh from seed
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* sessionStorage may be unavailable in some embeds — ignore */
  }
  // Hard reload so every mounted tab refetches via the interceptor
  window.location.reload();
};

export const disableDemoMode = (): void => {
  try {
    sessionStorage.removeItem(FLAG_KEY);
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
};

// Storage hooks used by the store layer. Kept here so the persistence keys live in one place.
export const readPersistedStore = (): string | null => {
  try {
    return sessionStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
};

export const writePersistedStore = (json: string): void => {
  try {
    sessionStorage.setItem(STORE_KEY, json);
  } catch {
    /* if storage is full or unavailable, demo state just won't survive reload */
  }
};
