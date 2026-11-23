import type { JarvisSettings } from '../types';

export const STORAGE_KEYS = {
  settings: 'jarvis_pocket_settings_v1',
  messages: 'jarvis_pocket_messages_v1',
  jobs: 'jarvis_pocket_jobs_v1',
  notes: 'jarvis_pocket_notes_v1',
} as const;

export const DEFAULT_SETTINGS: JarvisSettings = {
  agentUrl: 'http://localhost:8787',
  agentToken: '',
  aiProvider: 'offline',
  aiApiKey: '',
  aiModel: 'gemini-2.5-flash',
  localLlmUrl: 'http://localhost:1234/v1/chat/completions',
  cobaltUrl: '',
};

export function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  maxItems = 5000,
): T[] {
  const safeExisting = Array.isArray(existing) ? existing : [];
  const safeIncoming = Array.isArray(incoming) ? incoming : [];
  const map = new Map<string, T>();

  for (const item of safeExisting) {
    if (item && typeof item.id === 'string' && item.id.length > 0) {
      map.set(item.id, item);
    }
  }
  for (const item of safeIncoming) {
    if (item && typeof item.id === 'string' && item.id.length > 0) {
      map.set(item.id, item);
    }
  }

  const merged = Array.from(map.values());
  const cap = Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : 5000;
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

export function safeLoadJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeSaveJson<T>(key: string, value: T): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
