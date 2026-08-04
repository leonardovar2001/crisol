import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatClock, useCountdown, useLive } from '../lib/live.js';

interface Info {
  id: string;
  joinCode: string;
  title: string;
  roles: { id: string; name: string; isGeneral: boolean; accessCode: string | null }[];
}

/** Where the exercise is actually run from. */
export function Control() {
  const { sessionId = '' } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const { view, connected, denied, send } = useLive({ sessionId });
  const remaining = useCountdown(view);

  useEffect(() => {
    void fetch(`/api/sessions/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo);
  }, [sessionId]);

  if (!view) {
    return (
      <main className="page">
        <p className="hint">{connected ? 'Cargando…' : 'Conectando…'}</p>
      </main>
    );
  }

  const decision = view.decision;
  const resolved = Boolean(view.results?.winnerId);

  return (
    <main className="page page-wide">
      <header className="row row-between">
        <div>
          <h1>{info?.title ?? 'Sesión'}</h1>
          <p className="lede">
            Código de sala <strong className="code">{info?.joinCode}</strong> · {view.participants}{' '}
            {view.participants === 1 ? 'persona' : 'personas'}
          </p>
        </div>
        {remaining !== null && (
          <span className={`clock clock-lg ${remaining === 0 ? 'is-out' : ''}`}>
            {remaining === 0 ? 'Se acabó' : formatClock(remaining)}
          </span>
        )}
      </header>

      {!connected && <p className="alert">Se cortó la conexión. Reintentando…</p>}
      {denied && <p className="alert">{denied}</p>}

      <div className="split">
        <section className="panel">
          {view.phase ? (
            <>
              <p className="muted">
                Fase {view.phase.index} de {view.phase.total}
              </p>
              <h2>{view.phase.title}</h2>
            </>
          ) : (
            <h2>{view.status === 'ended' ? 'Terminó' : 'Sin empezar'}</h2>
          )}

          {view.presenterCue && (
            <div className="cue">
              <span className="muted">Tu guion</span>
              <p>{view.presenterCue}</p>
            </div>
          )}

          <div className="row controls">
            {view.status === 'draft' && (
              <button type="button" className="btn btn-primary" onClick={() => send('start')}>
                Empezar
              </button>
            )}
            {decision && (
              <button type="button" className="btn" onClick={() => send('answers', { open: !decision.answersOpen })}>
                {decision.answersOpen ? 'Cerrar respuestas' : 'Abrir respuestas'}
              </button>
            )}
            {decision && !view.resultsVisible && (
              <button type="button" className="btn" onClick={() => send('reveal')}>
                Mostrar resultados
              </button>
            )}
            {decision && !resolved && (
              <button type="button" className="btn" onClick={() => send('resolve')}>
                Cerrar la decisión
              </button>
            )}
            {view.status !== 'draft' && view.status !== 'ended' && (
              <button type="button" className="btn btn-primary" onClick={() => send('advance')}>
                {view.nextPhaseTitle ? `Siguiente: ${view.nextPhaseTitle}` : 'Terminar'}
              </button>
            )}
            {view.status === 'live' && (
              <button type="button" className="btn" onClick={() => send('pause')}>
                Pausar
              </button>
            )}
            {view.remainingSeconds !== null && view.status !== 'draft' && view.status !== 'ended' && (
              <>
                <button type="button" className="btn btn-tiny" onClick={() => send('timer', { deltaSeconds: 60 })}>
                  +1 min
                </button>
                <button type="button" className="btn btn-tiny" onClick={() => send('timer', { deltaSeconds: 300 })}>
                  +5 min
                </button>
                <button type="button" className="btn btn-tiny" onClick={() => send('timer', { deltaSeconds: -60 })}>
                  −1 min
                </button>
              </>
            )}
            {view.status === 'paused' && (
              <button
                type="button"
                className="btn"
                onClick={() => send('resume', { remainingSeconds: view.remainingSeconds })}
              >
                Reanudar
              </button>
            )}
          </div>

          {decision && (
            <>
              <h2>{decision.prompt}</h2>
              <ul className="options">
                {decision.options.map((option) => (
                  <li key={option.id}>
                    <div className={`option ${view.results?.winnerId === option.id ? 'is-winner' : ''}`}>
                      <strong>{option.label}</strong>
                      <span className="tally">{view.liveTally?.[option.id] ?? 0} votos</span>
                      {!resolved && (
                        <button
                          type="button"
                          className="btn btn-tiny"
                          onClick={() => send('resolve', { optionId: option.id })}
                        >
                          Elegir esta
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="hint">
                El recuento lo ves siempre; los participantes sólo cuando lo mostrás. Si elegís una
                opción a mano queda registrado que no salió de la votación.
              </p>
            </>
          )}
        </section>

        <aside className="split-side">
          <section className="panel">
            <h2>Accesos</h2>
            <p className="muted">Código de sala</p>
            <p className="code code-lg">{info?.joinCode}</p>
            <p className="hint">
              Entran desde <code>/join</code>. Los roles con código lo necesitan además del de sala.
            </p>
            <ul className="plain">
              {info?.roles.map((role) => (
                <li key={role.id}>
                  <strong>{role.name}</strong>{' '}
                  {role.isGeneral ? (
                    <span className="muted">— entra sin código</span>
                  ) : (
                    <code>{role.accessCode}</code>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>En la sala ({view.roster?.length ?? 0})</h2>
            <ul className="plain">
              {(view.roster ?? []).map((person) => (
                <li key={person.id}>
                  {person.displayName} <span className="muted">· {person.roleName}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <div className="row">
        <Link className="back" to="/sessions">
          ← Sesiones
        </Link>
        <Link className="back" to={`/screen/${sessionId}`} target="_blank" rel="noreferrer">
          Abrir pantalla de sala ↗
        </Link>
        <Link className="back" to={`/report/${sessionId}`}>
          Ver reporte
        </Link>
      </div>
    </main>
  );
}
