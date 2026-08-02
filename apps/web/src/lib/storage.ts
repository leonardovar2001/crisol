import type { Draft } from './draft.js';

/**
 * Drafts live in the browser for now.
 *
 * This is deliberately a thin, swappable layer: when the server lands, the same
 * calls go to the API and nothing in the editor changes. Until then, exporting
 * to a file is the only durable copy — the editor says so out loud.
 */

const KEY = 'crisol.drafts.v1';

type Store = Record<string, { draft: Draft; updatedAt: string }>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    // Corrupt or unavailable storage must not take the editor down with it.
    return {};
  }
}

function write(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export interface DraftSummary {
  id: string;
  title: string;
  slug: string;
  phases: number;
  updatedAt: string;
}

export function listDrafts(): DraftSummary[] {
  return Object.entries(read())
    .map(([id, { draft, updatedAt }]) => ({
      id,
      title: draft.title[draft.defaultLocale] ?? draft.slug,
      slug: draft.slug,
      phases: draft.phases.length,
      updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadDraft(id: string): Draft | null {
  return read()[id]?.draft ?? null;
}

export function saveDraft(id: string, draft: Draft): void {
  const store = read();
  store[id] = { draft, updatedAt: new Date().toISOString() };
  write(store);
}

export function deleteDraft(id: string): void {
  const store = read();
  delete store[id];
  write(store);
}
