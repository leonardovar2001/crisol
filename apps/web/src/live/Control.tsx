import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatClock, useCountdown, useLive } from '../lib/live.js';
import { joinUrl, useInstance } from '../lib/instance.js';
import { QrCode } from '../components/QrCode.js';
import { Chart } from '../components/Chart.js';

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
  const [overriding, setOverriding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const instance = useInstance();

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

          {(view.charts ?? []).map((ch) => (
            <Chart key={ch.key} data={ch} />
          ))}

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
                          onClick={() => setOverriding(option.id)}
                        >
                          Elegir esta
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {overriding && (
                <div className="panel override-box">
                  <p>
                    Vas a elegir «{decision.options.find((o) => o.id === overriding)?.label}». Va a
                    quedar registrado que no salió de la votación.
                  </p>
                  <label className="field">
                    <span>Por qué (opcional, pero el reporte lo agradece)</span>
                    <textarea
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="La discusión mostró que…"
                    />
                  </label>
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        send('resolve', { optionId: overriding, reason });
                        setOverriding(null);
                        setReason('');
                      }}
                    >
                      Confirmar
                    </button>
                    <button type="button" className="btn" onClick={() => setOverriding(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

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
            {info && (
              <div className="access">
                <QrCode value={joinUrl(instance, info.joinCode)} size={150} />
                <div>
                  <p className="muted">Código de sala</p>
                  <p className="code code-lg">{info.joinCode}</p>
                  <button
                    type="button"
                    className="btn btn-tiny"
                    onClick={() => void navigator.clipboard?.writeText(joinUrl(instance, info.joinCode))}
                  >
                    Copiar enlace
                  </button>
                </div>
              </div>
            )}
            <p className="hint">
              Escanean el QR o entran a <code>/join</code> con el código.
            </p>

            {info?.roles.some((r) => !r.isGeneral) && (
              <>
                <h3>Roles con código</h3>
                <p className="hint">
                  Estos se entregan aparte, en privado: son los que reparten la información
                  asimétrica.
                </p>
                <ul className="plain role-codes">
                  {info.roles
                    .filter((role) => !role.isGeneral)
                    .map((role) => (
                      <li key={role.id}>
                        <QrCode value={joinUrl(instance, info.joinCode, role.accessCode)} size={92} />
                        <div>
                          <strong>{role.name}</strong>
                          <p>
                            <code>{role.accessCode}</code>
                          </p>
                        </div>
                      </li>
                    ))}
                </ul>
              </>
            )}

            {instance && instance.publicUrl.includes('localhost') && (
              <p className="alert">
                Los QR apuntan a <code>{instance.publicUrl}</code>. Desde otro teléfono eso no
                resuelve: poné la dirección real de esta máquina en <code>PUBLIC_URL</code>.
              </p>
            )}
          </section>

          <section className="panel">
            <h2>Notas</h2>
            <p className="hint">
              Privadas. No las ve nadie más. Sirven para lo que salió en la conversación y no está
              en ninguna opción.
            </p>
            <textarea
              rows={3}
              value={note}
              placeholder="Querían un camino que no estaba entre las opciones…"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  send('note', { body: note, decisionId: decision?.id ?? null });
                  setNote('');
                }
              }}
            />
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!note.trim()}
                onClick={() => {
                  send('note', { body: note, decisionId: decision?.id ?? null });
                  setNote('');
                }}
              >
                Guardar nota
              </button>
              <span className="muted">
                {decision ? 'queda ligada a esta decisión' : 'queda ligada a esta fase'}
              </span>
            </div>

            <ul className="notes">
              {(view.notes ?? [])
                .filter((n) => n.phaseId === view.phase?.id)
                .map((n) => (
                  <li key={n.id}>
                    <p>{n.body}</p>
                    <button
                      type="button"
                      className="btn btn-danger btn-tiny"
                      onClick={() => send('note_remove', { noteId: n.id })}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
            </ul>
          </section>

          {(view.pending?.length ?? 0) > 0 && (
            <section className="panel pending-box">
              <h2>Piden entrar ({view.pending?.length})</h2>
              <ul className="plain">
                {(view.pending ?? []).map((person) => (
                  <li key={person.id} className="pending-row">
                    <span>
                      {person.displayName} <span className="muted">· {person.roleName}</span>
                    </span>
                    <span className="row">
                      <button
                        type="button"
                        className="btn btn-tiny btn-primary"
                        onClick={() => send('admit', { participantId: person.id, admit: true })}
                      >
                        Dejar entrar
                      </button>
                      <button
                        type="button"
                        className="btn btn-tiny btn-danger"
                        onClick={() => send('admit', { participantId: person.id, admit: false })}
                      >
                        Rechazar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel">
            <h2>En la sala ({view.roster?.length ?? 0})</h2>
            <label className="field">
              <span>Quién necesita tu aprobación</span>
              <select
                value={view.approvalMode ?? 'none'}
                onChange={(e) => send('approval_mode', { mode: e.target.value })}
              >
                <option value="none">Nadie: entran directo</option>
                <option value="protected">Sólo los roles con código</option>
                <option value="all">Todos</option>
              </select>
            </label>
            <ul className="plain">
              {(view.roster ?? []).map((person) => (
                <li key={person.id} className="pending-row">
                  <span>
                    {person.displayName} <span className="muted">· {person.roleName}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-tiny"
                    title="Libera su lugar para que otro pueda tomar ese rol"
                    onClick={() => {
                      if (confirm(`¿Sacar a ${person.displayName} y liberar su lugar?`))
                        send('release', { participantId: person.id });
                    }}
                  >
                    Sacar
                  </button>
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
