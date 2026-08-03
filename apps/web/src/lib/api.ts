import type { Scenario } from '@crisol/shared';

/**
 * Everything the browser knows about the server.
 *
 * State lives on the server, so the editor holds no durable copy of its own:
 * what you see here is a mirror of what is stored.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : {},
    ...init,
  });

  if (response.status === 204) return undefined as T;

  const payload = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? `Error ${response.status}`,
      payload?.issues,
    );
  }
  return payload as T;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'author' | 'facilitator';
  locale: string;
}

export interface ScenarioSummary {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  phases: number;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  url: string;
}

export const api = {
  me: () => request<User>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ ok: true }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  listScenarios: () => request<ScenarioSummary[]>('/api/scenarios'),
  getScenario: (id: string) =>
    request<{ id: string; slug: string; document: Scenario; updatedAt: string }>(
      `/api/scenarios/${id}`,
    ),
  createScenario: (document: Scenario) =>
    request<{ id: string; slug: string }>('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify(document),
    }),
  updateScenario: (id: string, document: Scenario) =>
    request<{ id: string; slug: string }>(`/api/scenarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(document),
    }),
  deleteScenario: (id: string) => request<void>(`/api/scenarios/${id}`, { method: 'DELETE' }),

  listMedia: (scenarioId: string) => request<MediaAsset[]>(`/api/scenarios/${scenarioId}/media`),
  mediaUsage: (scenarioId: string) =>
    request<{ usedBytes: number; budgetBytes: number; maxFileBytes: number }>(
      `/api/scenarios/${scenarioId}/media/usage`,
    ),
  uploadMedia: async (scenarioId: string, file: File): Promise<MediaAsset> => {
    const body = new FormData();
    body.append('file', file);
    // No content-type header on purpose: the browser has to set the multipart
    // boundary itself.
    const response = await fetch(`/api/scenarios/${scenarioId}/media`, {
      method: 'POST',
      credentials: 'same-origin',
      body,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, payload?.error ?? 'No se pudo subir');
    return payload as MediaAsset;
  },
  deleteMedia: (id: string) => request<void>(`/api/media/${id}`, { method: 'DELETE' }),
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
