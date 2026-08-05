import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, scenarioSchema } from './scenario.js';

/** Un escenario mínimo válido. */
const escenario = () => ({
  schemaVersion: SCHEMA_VERSION,
  slug: 'prueba',
  title: { es: 'Prueba' },
  defaultLocale: 'es',
  roles: [
    { id: 'rg', key: 'general', name: { es: 'General' }, isGeneral: true, sortOrder: 0 },
    { id: 'rl', key: 'legales', name: { es: 'Legales' }, isGeneral: false, capacity: 1, sortOrder: 1 },
  ],
  phases: [
    { id: 'p1', sortOrder: 0, title: { es: 'Apertura' }, kind: 'briefing', durationSeconds: 600 },
  ],
});

describe('cupo de un rol', () => {
  it('acepta un cupo en un rol protegido', () => {
    const parsed = scenarioSchema.safeParse(escenario());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.roles[1]?.capacity).toBe(1);
  });

  it('sin cupo queda en «sin límite»', () => {
    const doc = escenario();
    doc.roles[1] = { ...doc.roles[1]!, capacity: undefined } as unknown as (typeof doc.roles)[number];
    const parsed = scenarioSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.roles[1]?.capacity).toBeNull();
  });

  it('rechaza un cupo de cero: sería un rol al que nadie puede entrar', () => {
    const doc = escenario();
    doc.roles[1] = { ...doc.roles[1]!, capacity: 0 };
    expect(scenarioSchema.safeParse(doc).success).toBe(false);
  });

  it('rechaza un cupo negativo', () => {
    const doc = escenario();
    doc.roles[1] = { ...doc.roles[1]!, capacity: -3 };
    expect(scenarioSchema.safeParse(doc).success).toBe(false);
  });
});

describe('versión del formato', () => {
  it('rechaza un archivo de otra versión', () => {
    // Hasta el primer release hay una sola versión y es la actual: cualquier
    // otra cosa es un archivo de otra herramienta o corrupto.
    expect(scenarioSchema.safeParse({ ...escenario(), schemaVersion: 99 }).success).toBe(false);
  });
});
