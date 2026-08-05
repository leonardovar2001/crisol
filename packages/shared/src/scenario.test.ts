import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, parseScenarioFile, scenarioSchema } from './scenario.js';

/** Un escenario mínimo válido, en la versión que se le pase. */
const escenario = (version: number) => ({
  schemaVersion: version,
  slug: 'prueba',
  title: { es: 'Prueba' },
  defaultLocale: 'es',
  roles: [
    { id: 'rg', key: 'general', name: { es: 'General' }, isGeneral: true, sortOrder: 0 },
    { id: 'rl', key: 'legales', name: { es: 'Legales' }, isGeneral: false, sortOrder: 1 },
  ],
  phases: [
    {
      id: 'p1',
      sortOrder: 0,
      title: { es: 'Apertura' },
      kind: 'briefing',
      durationSeconds: 600,
    },
  ],
});

describe('formato portable', () => {
  it('lee un archivo de la versión actual', () => {
    const parsed = parseScenarioFile(escenario(SCHEMA_VERSION));
    expect(parsed.success).toBe(true);
  });

  it('sigue leyendo un archivo exportado con la versión 1', () => {
    // Compartir escenarios es el punto del proyecto: un archivo viejo tiene que
    // seguir importándose, no fallar con «versión no soportada».
    const parsed = parseScenarioFile(escenario(1));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('migra los roles viejos a «sin límite», que es como se comportaban', () => {
    const parsed = parseScenarioFile(escenario(1));
    if (!parsed.success) throw new Error('debería haber migrado');
    // Poner un cupo por defecto rompería ejercicios que ya funcionaban.
    expect(parsed.data.roles.every((r) => r.capacity === null)).toBe(true);
  });

  it('rechaza un archivo de una versión que no conoce', () => {
    expect(parseScenarioFile(escenario(99)).success).toBe(false);
  });

  it('no acepta una versión vieja por la puerta de atrás', () => {
    // El esquema en crudo sólo valida la versión actual; migrar es explícito.
    expect(scenarioSchema.safeParse(escenario(1)).success).toBe(false);
  });

  it('acepta un cupo en un rol protegido', () => {
    const doc = escenario(SCHEMA_VERSION);
    doc.roles[1] = { ...doc.roles[1]!, capacity: 1 } as (typeof doc.roles)[number];
    const parsed = parseScenarioFile(doc);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.roles[1]?.capacity).toBe(1);
  });

  it('rechaza un cupo de cero: sería un rol al que nadie puede entrar', () => {
    const doc = escenario(SCHEMA_VERSION);
    doc.roles[1] = { ...doc.roles[1]!, capacity: 0 } as (typeof doc.roles)[number];
    expect(parseScenarioFile(doc).success).toBe(false);
  });
});
