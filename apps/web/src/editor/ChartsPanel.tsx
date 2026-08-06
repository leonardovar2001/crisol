import { useState } from 'react';
import { Chart as Preview } from '../components/Chart.js';
import {
  createChart,
  createChartEffect,
  readText,
  resizeSeries,
  slugify,
  sorted,
  writeText,
  type Chart,
  type Draft,
} from '../lib/draft.js';

const TIPOS: { value: Chart['kind']; label: string; hint: string }[] = [
  { value: 'stat', label: 'Valor único', hint: 'Un número grande que se mueve.' },
  { value: 'bar', label: 'Barras', hint: 'Comparar pocas categorías.' },
  { value: 'pie', label: 'Torta', hint: 'Cómo se reparte un total.' },
  { value: 'line', label: 'Línea', hint: 'Una tendencia a lo largo de varios puntos.' },
];

const OPERACIONES: { value: Chart['effects'][number]['operation']; label: string }[] = [
  { value: 'add', label: 'sumar' },
  { value: 'subtract', label: 'restar' },
  { value: 'set', label: 'poner en' },
  { value: 'percent_change', label: 'cambiar un %' },
];

/**
 * Los gráficos del escenario.
 *
 * Un ejercicio sin gráficos es perfectamente válido: esta solapa arranca vacía
 * y nada obliga a entrar acá.
 */
export function ChartsPanel({
  draft,
  locale,
  onChange,
}: {
  draft: Draft;
  locale: string;
  onChange: (draft: Draft) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(draft.charts[0]?.id ?? null);
  const chart = draft.charts.find((c) => c.id === selectedId) ?? draft.charts[0];

  const patch = (next: Partial<Chart>) => {
    if (!chart) return;
    onChange({
      ...draft,
      charts: draft.charts.map((c) => (c.id === chart.id ? { ...c, ...next } : c)),
    });
  };

  const series = chart ? Object.keys(chart.initialSeries) : [];
  const phases = sorted(draft.phases);

  /** Todo lo que puede disparar un efecto, en una sola lista. */
  const disparadores = [
    ...phases.map((p) => ({
      value: `fase:${p.id}`,
      label: `Al entrar a «${readText(p.title, locale) || 'sin título'}»`,
    })),
    ...phases.flatMap((p) =>
      (p.decision?.options ?? []).map((o) => ({
        value: `opcion:${o.id}`,
        label: `Si gana «${readText(o.label, locale) || 'sin título'}» en ${readText(p.title, locale)}`,
      })),
    ),
  ];

  return (
    <div className="split">
      <aside className="split-side">
        <ul className="phase-list">
          {draft.charts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`phase-item ${c.id === chart?.id ? 'is-active' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <span className="phase-body">
                  <strong>{readText(c.title, locale) || 'Sin título'}</strong>
                  <span>
                    {TIPOS.find((t) => t.value === c.kind)?.label} · {c.effects.length}{' '}
                    {c.effects.length === 1 ? 'efecto' : 'efectos'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const nuevo = createChart(`Gráfico ${draft.charts.length + 1}`, locale, draft.charts);
            onChange({ ...draft, charts: [...draft.charts, nuevo] });
            setSelectedId(nuevo.id);
          }}
        >
          Agregar gráfico
        </button>
      </aside>

      <div className="split-main">
        {!chart ? (
          <p className="note">
            Este escenario no tiene gráficos, y está bien: muchos ejercicios no los necesitan.
            Agregá uno sólo si querés mostrar valores que se muevan con las decisiones.
          </p>
        ) : (
          <section className="panel">
            <label className="field">
              <span>Título</span>
              <input
                value={readText(chart.title, locale)}
                onChange={(e) => patch({ title: writeText(chart.title, locale, e.target.value) })}
              />
            </label>

            <div className="row">
              <label className="field-inline">
                <span>Tipo</span>
                <select
                  value={chart.kind}
                  onChange={(e) => patch({ kind: e.target.value as Chart['kind'] })}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-inline">
                <span>Unidad</span>
                <input
                  className="unit-input"
                  placeholder="%, min, casos…"
                  value={chart.unit ?? ''}
                  onChange={(e) => patch({ unit: e.target.value || undefined })}
                />
              </label>
            </div>
            <p className="hint">{TIPOS.find((t) => t.value === chart.kind)?.hint}</p>

            <hr />
            <h2>Valores</h2>
            <p className="hint">
              Cada fila es una categoría con su nombre. Los números son el punto de partida: los
              efectos los mueven durante el ejercicio.
            </p>

            <table className="values-table">
              <thead>
                <tr>
                  <th>Etiqueta</th>
                  {series.map((nombre) => (
                    <th key={nombre}>
                      <input
                        aria-label="Nombre de la serie"
                        value={nombre}
                        onChange={(e) => {
                          const limpio = slugify(e.target.value).replace(/-/g, '_') || nombre;
                          const entradas = Object.entries(chart.initialSeries).map(([k, v]) =>
                            k === nombre ? [limpio, v] : [k, v],
                          );
                          patch({
                            initialSeries: Object.fromEntries(entradas),
                            effects: chart.effects.map((ef) =>
                              ef.targetSeries === nombre ? { ...ef, targetSeries: limpio } : ef,
                            ),
                          });
                        }}
                      />
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {chart.labels.map((label, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        aria-label={`Etiqueta ${i + 1}`}
                        value={readText(label, locale)}
                        onChange={(e) =>
                          patch({
                            labels: chart.labels.map((l, j) =>
                              j === i ? writeText(l, locale, e.target.value) : l,
                            ),
                          })
                        }
                      />
                    </td>
                    {series.map((nombre) => (
                      <td key={nombre}>
                        <input
                          type="number"
                          aria-label={`${nombre} en ${readText(label, locale)}`}
                          value={chart.initialSeries[nombre]?.[i] ?? 0}
                          onChange={(e) =>
                            patch({
                              initialSeries: {
                                ...chart.initialSeries,
                                [nombre]: (chart.initialSeries[nombre] ?? []).map((v, j) =>
                                  j === i ? Number(e.target.value) || 0 : v,
                                ),
                              },
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-tiny"
                        disabled={chart.labels.length === 1}
                        onClick={() => {
                          const labels = chart.labels.filter((_, j) => j !== i);
                          patch({
                            labels,
                            initialSeries: Object.fromEntries(
                              Object.entries(chart.initialSeries).map(([k, v]) => [
                                k,
                                v.filter((_, j) => j !== i),
                              ]),
                            ),
                          });
                        }}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="row">
              <button
                type="button"
                className="btn btn-tiny"
                onClick={() => {
                  const labels = [...chart.labels, { [locale]: `Valor ${chart.labels.length + 1}` }];
                  patch({ labels, initialSeries: resizeSeries(chart, labels.length) });
                }}
              >
                Agregar etiqueta
              </button>
              <button
                type="button"
                className="btn btn-tiny"
                onClick={() => {
                  let nombre = `serie_${series.length + 1}`;
                  while (series.includes(nombre)) nombre += '_';
                  patch({
                    initialSeries: {
                      ...chart.initialSeries,
                      [nombre]: chart.labels.map(() => 0),
                    },
                  });
                }}
              >
                Agregar serie
              </button>
              {series.length > 1 && (
                <button
                  type="button"
                  className="btn btn-danger btn-tiny"
                  onClick={() => {
                    const ultima = series[series.length - 1]!;
                    const { [ultima]: _, ...resto } = chart.initialSeries;
                    patch({
                      initialSeries: resto,
                      effects: chart.effects.filter((ef) => ef.targetSeries !== ultima),
                    });
                  }}
                >
                  Quitar la última serie
                </button>
              )}
            </div>

            <hr />
            <h2>Vista previa</h2>
            <p className="hint">Con los valores de arranque, antes de que se dispare ningún efecto.</p>
            <Preview
              data={{
                key: chart.key,
                title: readText(chart.title, locale) || 'Sin título',
                kind: chart.kind,
                unit: chart.unit ?? null,
                labels: chart.labels.map((l) => readText(l, locale)),
                series: chart.initialSeries,
              }}
            />

            <hr />
            <h2>Efectos</h2>
            <p className="hint">
              Qué mueve estos números. Cada efecto se dispara al entrar a una fase o cuando gana una
              opción.
            </p>

            {chart.effects.map((efecto) => (
              <div key={efecto.id} className="block effect-row">
                <label className="field">
                  <span>Cuándo</span>
                  <select
                    value={
                      efecto.trigger.kind === 'on_phase_enter'
                        ? `fase:${efecto.trigger.phaseId}`
                        : `opcion:${efecto.trigger.optionId}`
                    }
                    onChange={(e) => {
                      const [tipo, id] = e.target.value.split(':');
                      patch({
                        effects: chart.effects.map((ef) =>
                          ef.id === efecto.id
                            ? {
                                ...ef,
                                trigger:
                                  tipo === 'fase'
                                    ? { kind: 'on_phase_enter', phaseId: id! }
                                    : { kind: 'on_option_chosen', optionId: id! },
                              }
                            : ef,
                        ),
                      });
                    }}
                  >
                    {disparadores.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="row">
                  <select
                    aria-label="Serie"
                    value={efecto.targetSeries}
                    onChange={(e) =>
                      patch({
                        effects: chart.effects.map((ef) =>
                          ef.id === efecto.id ? { ...ef, targetSeries: e.target.value } : ef,
                        ),
                      })
                    }
                  >
                    {series.map((nombre) => (
                      <option key={nombre} value={nombre}>
                        {nombre}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Qué valor"
                    value={efecto.targetPoint === null ? 'todos' : String(efecto.targetPoint)}
                    onChange={(e) =>
                      patch({
                        effects: chart.effects.map((ef) =>
                          ef.id === efecto.id
                            ? {
                                ...ef,
                                targetPoint: e.target.value === 'todos' ? null : Number(e.target.value),
                              }
                            : ef,
                        ),
                      })
                    }
                  >
                    <option value="todos">todos los valores</option>
                    {chart.labels.map((l, i) => (
                      <option key={i} value={i}>
                        {readText(l, locale) || `valor ${i + 1}`}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Operación"
                    value={efecto.operation}
                    onChange={(e) =>
                      patch({
                        effects: chart.effects.map((ef) =>
                          ef.id === efecto.id
                            ? { ...ef, operation: e.target.value as typeof ef.operation }
                            : ef,
                        ),
                      })
                    }
                  >
                    {OPERACIONES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    aria-label="Cuánto"
                    value={efecto.value}
                    onChange={(e) =>
                      patch({
                        effects: chart.effects.map((ef) =>
                          ef.id === efecto.id ? { ...ef, value: Number(e.target.value) || 0 } : ef,
                        ),
                      })
                    }
                  />
                  {efecto.operation === 'percent_change' && <span className="muted">%</span>}

                  <button
                    type="button"
                    className="btn btn-danger btn-tiny"
                    onClick={() =>
                      patch({ effects: chart.effects.filter((ef) => ef.id !== efecto.id) })
                    }
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn"
              disabled={phases.length === 0 || series.length === 0}
              onClick={() =>
                patch({
                  effects: [
                    ...chart.effects,
                    createChartEffect(phases[0]!.id, series[0] ?? 'serie'),
                  ],
                })
              }
            >
              Agregar efecto
            </button>

            <hr />
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (!confirm(`¿Borrar «${readText(chart.title, locale)}»?`)) return;
                onChange({
                  ...draft,
                  charts: draft.charts.filter((c) => c.id !== chart.id),
                  // Sacarlo también de las fases que lo mostraban, o el escenario
                  // queda apuntando a un gráfico que ya no existe.
                  phases: draft.phases.map((p) => ({
                    ...p,
                    visibleCharts: p.visibleCharts.filter((r) => r.chartKey !== chart.key),
                  })),
                });
                setSelectedId(null);
              }}
            >
              Borrar este gráfico
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
