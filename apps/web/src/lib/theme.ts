import { useCallback, useEffect, useState } from 'react';

/**
 * Two independent things, on purpose:
 *
 * - The instance colours (`--base`, `--accent-seed`) belong to whoever runs the
 *   instance. Everyone sees them.
 * - Light or dark belongs to whoever is looking. The same session can be run
 *   with the projector in light mode and every phone in dark.
 */

export type Mode = 'system' | 'light' | 'dark';

const KEY = 'crisol.theme';

export function readMode(): Mode {
  const stored = localStorage.getItem(KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function systemPrefers(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyMode(mode: Mode): void {
  const resolved = mode === 'system' ? systemPrefers() : mode;
  document.documentElement.dataset.theme = resolved;
}

export function useThemeMode() {
  const [mode, setMode] = useState<Mode>(() => readMode());

  useEffect(() => {
    applyMode(mode);
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  }, [mode]);

  // Following the system means following it as it changes, not only at load.
  useEffect(() => {
    if (mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const update = () => applyMode('system');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [mode]);

  return { mode, setMode };
}

export interface InstanceTheme {
  baseColor: string;
  accentColor: string;
}

export function applyInstanceTheme(theme: InstanceTheme): void {
  document.documentElement.style.setProperty('--base', theme.baseColor);
  document.documentElement.style.setProperty('--accent-seed', theme.accentColor);
}

export function useInstanceTheme() {
  const [theme, setTheme] = useState<InstanceTheme | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/instance');
      if (!response.ok) return;
      const payload = (await response.json()) as { theme?: InstanceTheme };
      if (payload.theme) {
        applyInstanceTheme(payload.theme);
        setTheme(payload.theme);
      }
    } catch {
      // Falls back to the defaults already in the stylesheet.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { theme, reload: load, setLocal: applyInstanceTheme };
}

// ── Contraste ────────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

export function isDarkEnoughForBase(hex: string): boolean {
  return luminance(hex) <= 0.35;
}
