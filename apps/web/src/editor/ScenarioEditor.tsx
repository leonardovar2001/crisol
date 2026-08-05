import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { scenarioSchema } from '@crisol/shared';
import {
  createPhase,
  createRole,
  formatDuration,
  move,
  readText,
  slugify,
  sorted,
  writeText,
  type Draft,
} from '../lib/draft.js';
import { api, ApiError } from '../lib/api.js';
import { PhaseEditor } from './PhaseEditor.js';

type Tab = 'datos' | 'roles' | 'fases';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function ScenarioEditor() {
  const { draftId = '' } = useParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tab, setTab] = useState<Tab>('fases');
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .getScenario(draftId)
      .then((row) => setDraft(row.document))
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor'),
      );
  }, [draftId]);

  /**
   * Typing should not fire a request per keystroke, and leaving the page should
   * not lose the last one. The timer coalesces edits; `beforeunload` flushes.
   */
  const update = useCallback(
    (next: Draft) => {
      setDraft(next);
      setSaveState('saving');
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        api
          .updateScenario(draftId, next)
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'));
      }, 700);
    },
    [draftId],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === 'saving') event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  const phases = useMemo(() => (draft ? sorted(draft.phases) : []), [draft]);

  useEffect(() => {
    if (draft && selectedPhaseId === null && phases[0]) setSelectedPhaseId(phases[0].id);
  }, [draft, phases, selectedPhaseId]);

  const validation = useMemo(() => (draft ? scenarioSchema.safeParse(draft) : null), [draft]);

  if (!draft) {
    return (
      <main className="page">
        <h1>{loadError ? 'No se pudo abrir' : 'Cargando…'}</h1>
        {loadError && <p className="alert">{loadError}</p>}
        <Link className="back" to="/admin">
          ← Escenarios
        </Link>
      </main>
    );
  }

  const locale = draft.defaultLocale;
  const selected = phases.find((p) => p.id === selectedPhaseId) ?? phases[0];

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draft.slug || 'escenario'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="page page-wide">
      <header className="page-head">
        <div className="row row-between">
          <div>
            <h1>{readText(draft.title, locale) || 'Sin título'}</h1>
            <p className="lede">
              {phases.length} {phases.length === 1 ? 'fase' : 'fases'} · {draft.roles.length}{' '}
              {draft.roles.length === 1 ? 'rol' : 'roles'}
            </p>
          </div>
          <div className="row">
            <span className={`save save-${saveState}`}>
              {saveState === 'saving' && 'Guardando…'}
              {saveState === 'saved' && 'Guardado'}
              {saveState === 'error' && 'No se pudo guardar'}
            </span>
            <button type="button" className="btn btn-primary" onClick={exportFile}>
              Exportar .json
            </button>
          </div>
        </div>

        <nav className="tabs">
          {(['fases', 'roles', 'datos'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`tab ${tab === t ? 'is-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'fases' ? 'Fases' : t === 'roles' ? 'Roles' : 'Datos'}
            </button>
          ))}
        </nav>
      </header>

      {validation && !validation.success && (
        <details className="alert" open>
          <summary>
            {validation.error.issues.length}{' '}
            {validation.error.issues.length === 1 ? 'problema' : 'problemas'} — no se puede
            exportar así
          </summary>
          <ul>
            {validation.error.issues.slice(0, 8).map((issue, i) => (
              <li key={i}>
                <code>{issue.path.join('.') || 'escenario'}</code> — {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {tab === 'datos' && (
        <section className="panel">
          <label className="field">
            <span>Título</span>
            <input
              value={readText(draft.title, locale)}
              onChange={(e) => update({ ...draft, title: writeText(draft.title, locale, e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Identificador</span>
            <input
              value={draft.slug}
              onChange={(e) => update({ ...draft, slug: slugify(e.target.value) })}
            />
            <small>Se usa como nombre de archivo al exportar. Sólo minúsculas, números y guiones.</small>
          </label>
          <label className="field">
            <span>Descripción</span>
            <textarea
              rows={3}
              value={readText(draft.description, locale)}
              onChange={(e) =>
                update({ ...draft, description: writeText(draft.description, locale, e.target.value) })
              }
            />
            <small>Para que otro facilitador sepa si le sirve. No la ven los participantes.</small>
          </label>
          <label className="field">
            <span>Idioma principal</span>
            <select
              value={draft.defaultLocale}
              onChange={(e) => update({ ...draft, defaultLocale: e.target.value })}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
        </section>
      )}

      {tab === 'roles' && (
        <section className="panel">
          <p className="hint">
            Un rol es un punto de vista. Define qué ve cada participante: podés darle a Legales un
            documento que Comunicación no recibe. El rol <strong>general</strong> es el que recibe
            quien entra sólo con el código de sala.
          </p>
          <p className="hint">
            El <strong>cupo</strong> es cuánta gente entra en cada rol. Vacío es sin límite, que es
            lo normal para el general. En los demás conviene ponerlo: el código de rol lo tiene
            quien lo tenga, y sin cupo un enlace filtrado llena el rol de curiosos.
          </p>

          {sorted(draft.roles).map((role, index) => (
            <div key={role.id} className="stack-row">
              <input
                aria-label="Nombre del rol"
                value={readText(role.name, locale)}
                onChange={(e) =>
                  update({
                    ...draft,
                    roles: draft.roles.map((r) =>
                      r.id === role.id
                        ? { ...r, name: writeText(r.name, locale, e.target.value), key: slugify(e.target.value).replace(/-/g, '_') || r.key }
                        : r,
                    ),
                  })
                }
              />
              <label className="checkbox">
                <input
                  type="radio"
                  name="general"
                  checked={role.isGeneral}
                  onChange={() =>
                    update({
                      ...draft,
                      roles: draft.roles.map((r) => ({ ...r, isGeneral: r.id === role.id })),
                    })
                  }
                />
                general
              </label>
              <label className="field-inline">
                <span>Cupo</span>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  aria-label={`Cupo de ${readText(role.name, locale)}`}
                  placeholder="sin límite"
                  value={role.capacity ?? ''}
                  onChange={(e) =>
                    update({
                      ...draft,
                      roles: draft.roles.map((r) =>
                        r.id === role.id
                          ? { ...r, capacity: e.target.value ? Math.max(1, Number(e.target.value)) : null }
                          : r,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="btn btn-danger"
                disabled={draft.roles.length === 1}
                onClick={() =>
                  update({
                    ...draft,
                    roles: draft.roles.filter((r) => r.id !== role.id),
                    phases: draft.phases.map((p) => ({
                      ...p,
                      contents: p.contents.map((c) =>
                        c.roleId === role.id ? { ...c, roleId: null } : c,
                      ),
                    })),
                  })
                }
              >
                Quitar
              </button>
              <span className="hint-inline">{index === 0 ? '' : ''}</span>
            </div>
          ))}

          <button
            type="button"
            className="btn"
            onClick={() =>
              update({
                ...draft,
                roles: [...draft.roles, createRole('Rol nuevo', locale, false, draft.roles.length)],
              })
            }
          >
            Agregar rol
          </button>
        </section>
      )}

      {tab === 'fases' && (
        <div className="split">
          <aside className="split-side">
            <ol className="phase-list">
              {phases.map((phase, index) => (
                <li key={phase.id}>
                  <button
                    type="button"
                    className={`phase-item ${phase.id === selected?.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedPhaseId(phase.id)}
                  >
                    <span className="phase-num">{index + 1}</span>
                    <span className="phase-body">
                      <strong>{readText(phase.title, locale) || 'Sin título'}</strong>
                      <span>
                        {phase.kind} · {formatDuration(phase.durationSeconds)}
                        {phase.decision ? ' · decide' : ''}
                      </span>
                    </span>
                  </button>
                  <div className="phase-move">
                    <button
                      type="button"
                      className="btn btn-tiny"
                      aria-label="Subir"
                      disabled={index === 0}
                      onClick={() => update({ ...draft, phases: move(phases, index, index - 1) })}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-tiny"
                      aria-label="Bajar"
                      disabled={index === phases.length - 1}
                      onClick={() => update({ ...draft, phases: move(phases, index, index + 1) })}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const phase = createPhase(`Fase ${phases.length + 1}`, locale, phases.length);
                update({ ...draft, phases: [...draft.phases, phase] });
                setSelectedPhaseId(phase.id);
              }}
            >
              Agregar fase
            </button>
          </aside>

          <div className="split-main">
            {selected && (
              <PhaseEditor
                scenarioId={draftId}
                draft={draft}
                phase={selected}
                locale={locale}
                onChange={update}
                onDeleted={() => setSelectedPhaseId(null)}
              />
            )}
          </div>
        </div>
      )}

      <Link className="back" to="/admin">
        ← Escenarios
      </Link>
    </main>
  );
}
