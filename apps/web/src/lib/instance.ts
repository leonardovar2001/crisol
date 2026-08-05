import { useEffect, useState } from 'react';

export interface Instance {
  name: string;
  defaultLocale: string;
  publicUrl: string;
}

let cached: Instance | null = null;

/** Datos de la instancia. Se piden una vez y se comparten entre pantallas. */
export function useInstance(): Instance | null {
  const [instance, setInstance] = useState<Instance | null>(cached);

  useEffect(() => {
    if (cached) return;
    void fetch('/api/instance')
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: Instance | null) => {
        if (!payload) return;
        cached = payload;
        setInstance(payload);
      })
      .catch(() => {});
  }, []);

  return instance;
}

/**
 * El enlace que va adentro del QR.
 *
 * Sale de `PUBLIC_URL`, no de la barra de direcciones: quien conduce suele
 * estar en `localhost` y ese enlace no le sirve a ningún teléfono de la sala.
 */
export function joinUrl(instance: Instance | null, joinCode: string, roleCode?: string | null): string {
  const base = (instance?.publicUrl ?? window.location.origin).replace(/\/+$/, '');
  const params = new URLSearchParams({ codigo: joinCode });
  if (roleCode) params.set('rol', roleCode);
  return `${base}/join?${params.toString()}`;
}
