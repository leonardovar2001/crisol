import {
  createContent,
  createDecision,
  createOption,
  move,
  readText,
  sorted,
  writeText,
  type Draft,
  type Phase,
} from '../lib/draft.js';

interface Props {
  draft: Draft;
  phase: Phase;
  locale: string;
  onChange: (draft: Draft) => void;
  onDeleted: () => void;
}

const KINDS: { value: Phase['kind']; label: string; hint: string }[] = [
  { value: 'briefing', label: 'Apertura', hint: 'Presenta la situación y las reglas.' },
  { value: 'inject', label: 'Información nueva', hint: 'Aparece un dato que cambia el panorama.' },
  { value: 'dashboard', label: 'Tablero', hint: 'El foco está en los gráficos.' },
  { value: 'decision', label: 'Decisión', hint: 'El grupo tiene que elegir.' },
  { value: 'debrief', label: 'Cierre', hint: 'Se repasa lo que pasó.' },
];

export function PhaseEditor({ draft, phase, locale, onChange, onDeleted }: Props) {
  const phases = sorted(draft.phases);
  const index = phases.findIndex((p) => p.id === phase.id);
  const followsByOrder = phases[index + 1];

  const patch = (next: Partial<Phase>) =>
    onChange({
      ...draft,
      phases: draft.phases.map((p) => (p.id === phase.id ? { ...p, ...next } : p)),
    });

  const others = phases.filter((p) => p.id !== phase.id);
  // Bound to a const so TypeScript keeps the narrowing inside the callbacks below.
  const decision = phase.decision;

  return (
    <section className="panel">
      <label className="field">
        <span>Título de la fase</span>
        <input
          value={readText(phase.title, locale)}
          onChange={(e) => patch({ title: writeText(phase.title, locale, e.target.value) })}
        />
      </label>

      <label className="field">
        <span>Tipo</span>
        <select
          value={phase.kind}
          onChange={(e) => patch({ kind: e.target.value as Phase['kind'] })}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <small>{KINDS.find((k) => k.value === phase.kind)?.hint}</small>
      </label>

      <fieldset className="field">
        <span>Duración</span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={phase.durationSeconds === null}
            onChange={(e) => patch({ durationSeconds: e.target.checked ? null : 600 })}
          />
          Sin límite de tiempo
        </label>
        {phase.durationSeconds !== null && (
          <input
            type="number"
            min={1}
            max={1440}
            aria-label="Minutos"
            value={Math.round(phase.durationSeconds / 60)}
            onChange={(e) =>
              patch({ durationSeconds: Math.max(1, Number(e.target.value) || 1) * 60 })
            }
          />
        )}
        <small>
          Sin límite, la fase avanza cuando quien conduce lo decide. Útil cuando el ejercicio es
          para explorar, no para correr contrarreloj.
        </small>
      </fieldset>

      <label className="field">
        <span>Guion de quien conduce</span>
        <textarea
          rows={3}
          value={readText(phase.presenterCue, locale)}
          onChange={(e) => patch({ presenterCue: writeText(phase.presenterCue, locale, e.target.value) })}
        />
        <small>Sólo lo ve quien presenta. No aparece en la pantalla de sala ni en los móviles.</small>
      </label>

      <hr />

      <h2>Contenido</h2>
      <p className="hint">
        Lo que reciben los participantes. Dejá el rol en <em>Todos</em> o dirigí un bloque a un rol
        para que sólo ese lo vea.
      </p>

      {sorted(phase.contents).map((content, i) => (
        <div key={content.id} className="block">
          <div className="row row-between">
            <select
              aria-label="Quién lo ve"
              value={content.roleId ?? ''}
              onChange={(e) =>
                patch({
                  contents: phase.contents.map((c) =>
                    c.id === content.id ? { ...c, roleId: e.target.value || null } : c,
                  ),
                })
              }
            >
              <option value="">Todos los roles</option>
              {sorted(draft.roles).map((r) => (
                <option key={r.id} value={r.id}>
                  Sólo {readText(r.name, locale)}
                </option>
              ))}
            </select>
            <div className="row">
              <button
                type="button"
                className="btn btn-tiny"
                aria-label="Subir"
                disabled={i === 0}
                onClick={() => patch({ contents: move(sorted(phase.contents), i, i - 1) })}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-tiny"
                aria-label="Bajar"
                disabled={i === phase.contents.length - 1}
                onClick={() => patch({ contents: move(sorted(phase.contents), i, i + 1) })}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-danger btn-tiny"
                onClick={() =>
                  patch({ contents: phase.contents.filter((c) => c.id !== content.id) })
                }
              >
                Quitar
              </button>
            </div>
          </div>
          <textarea
            rows={4}
            aria-label="Texto"
            placeholder="Lo que van a leer…"
            value={readText(content.body, locale)}
            onChange={(e) =>
              patch({
                contents: phase.contents.map((c) =>
                  c.id === content.id
                    ? { ...c, body: writeText(c.body, locale, e.target.value) }
                    : c,
                ),
              })
            }
          />
        </div>
      ))}

      <button
        type="button"
        className="btn"
        onClick={() => patch({ contents: [...phase.contents, createContent(phase.contents.length)] })}
      >
        Agregar bloque de texto
      </button>
      <p className="hint">
        Imágenes, audio y video llegan cuando esté el servidor: hace falta un lugar donde subir los
        archivos.
      </p>

      <hr />

      <h2>Decisión</h2>

      {decision === null ? (
        <>
          <p className="hint">
            Sin decisión, esta fase sólo muestra información y sigue de largo.
          </p>
          <button type="button" className="btn" onClick={() => patch({ decision: createDecision(locale) })}>
            Agregar una decisión
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span>Pregunta</span>
            <input
              value={readText(decision.prompt, locale)}
              onChange={(e) =>
                patch({
                  decision: decision
                    ? { ...decision, prompt: writeText(decision.prompt, locale, e.target.value) }
                    : null,
                })
              }
            />
          </label>

          {sorted(decision.options).map((option, i) => (
            <div key={option.id} className="block">
              <div className="row">
                <input
                  aria-label={`Opción ${i + 1}`}
                  value={readText(option.label, locale)}
                  onChange={(e) =>
                    patch({
                      decision: decision
                        ? {
                            ...decision,
                            options: decision.options.map((o) =>
                              o.id === option.id
                                ? { ...o, label: writeText(o.label, locale, e.target.value) }
                                : o,
                            ),
                          }
                        : null,
                    })
                  }
                />
                <button
                  type="button"
                  className="btn btn-danger btn-tiny"
                  disabled={decision.options.length <= 2}
                  onClick={() =>
                    patch({
                      decision: decision
                        ? {
                            ...decision,
                            options: decision.options.filter((o) => o.id !== option.id),
                          }
                        : null,
                    })
                  }
                >
                  Quitar
                </button>
              </div>
              <label className="field field-inline">
                <span>Si gana, seguir en</span>
                <select
                  value={option.nextPhaseId ?? ''}
                  onChange={(e) =>
                    patch({
                      decision: decision
                        ? {
                            ...decision,
                            options: decision.options.map((o) =>
                              o.id === option.id ? { ...o, nextPhaseId: e.target.value || null } : o,
                            ),
                          }
                        : null,
                    })
                  }
                >
                  <option value="">
                    el camino normal
                    {followsByOrder ? ` (${readText(followsByOrder.title, locale)})` : ' (fin)'}
                  </option>
                  {others.map((p) => (
                    <option key={p.id} value={p.id}>
                      {readText(p.title, locale) || p.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}

          <button
            type="button"
            className="btn"
            onClick={() =>
              patch({
                decision: decision
                  ? {
                      ...decision,
                      options: [
                        ...decision.options,
                        createOption(locale, decision.options.length),
                      ],
                    }
                  : null,
              })
            }
          >
            Agregar opción
          </button>

          <p className="hint">
            Dejá todas las opciones en <em>el camino normal</em> y el ejercicio va derecho. Mandá una
            a otra fase y ahí se abre en ramas.
          </p>

          <label className="field">
            <span>Si hay empate</span>
            <select
              value={decision.tieBreaker}
              onChange={(e) =>
                patch({
                  decision: decision
                    ? { ...decision, tieBreaker: e.target.value as 'presenter' | 'first_listed' }
                    : null,
                })
              }
            >
              <option value="presenter">Lo define quien conduce</option>
              <option value="first_listed">Gana la primera de la lista</option>
            </select>
          </label>

          <label className="field">
            <span>Resultados</span>
            <select
              value={decision.resultsReveal}
              onChange={(e) =>
                patch({
                  decision: decision
                    ? {
                        ...decision,
                        resultsReveal: e.target.value as 'live' | 'on_presenter_command',
                      }
                    : null,
                })
              }
            >
              <option value="on_presenter_command">Los muestra quien conduce</option>
              <option value="live">Se ven en vivo mientras votan</option>
            </select>
          </label>

          <button
            type="button"
            className="btn btn-danger"
            onClick={() => patch({ decision: null })}
          >
            Quitar la decisión
          </button>
        </>
      )}

      <hr />

      <div className="row row-between">
        <label className="field field-inline">
          <span>Al terminar, seguir en</span>
          <select
            value={phase.nextPhaseId ?? ''}
            onChange={(e) => patch({ nextPhaseId: e.target.value || null })}
          >
            <option value="">
              la fase siguiente
              {followsByOrder ? ` (${readText(followsByOrder.title, locale)})` : ' — es la última'}
            </option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {readText(p.title, locale) || p.id}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn-danger"
          disabled={phases.length === 1}
          onClick={() => {
            if (!confirm('¿Borrar esta fase?')) return;
            onChange({
              ...draft,
              phases: draft.phases
                .filter((p) => p.id !== phase.id)
                .map((p) => ({
                  ...p,
                  nextPhaseId: p.nextPhaseId === phase.id ? null : p.nextPhaseId,
                  decision: p.decision
                    ? {
                        ...p.decision,
                        options: p.decision.options.map((o) =>
                          o.nextPhaseId === phase.id ? { ...o, nextPhaseId: null } : o,
                        ),
                      }
                    : null,
                })),
            });
            onDeleted();
          }}
        >
          Borrar fase
        </button>
      </div>
    </section>
  );
}
