import { useParams } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { formatClock, useCountdown, useLive } from '../lib/live.js';

/**
 * The projected view.
 *
 * No controls, nothing private, and everything sized to be read from the back
 * of a room. It shows what the general role sees — never a role's private
 * material, since the whole room is looking at it.
 */
export function Screen() {
  const { sessionId = '' } = useParams();
  const { view, connected } = useLive({ sessionId, screen: '1' });
  const remaining = useCountdown(view);

  if (!view) {
    return (
      <main className="screen screen-center">
        <p className="screen-idle">{connected ? 'Cargando…' : 'Conectando…'}</p>
        <ThemeToggle />
      </main>
    );
  }

  if (!view.phase) {
    return (
      <main className="screen screen-center">
        <p className="screen-idle">
          {view.status === 'ended' ? 'Terminó el ejercicio' : 'Esperando para empezar'}
        </p>
        <p className="screen-sub">{view.participants} en la sala</p>
        <ThemeToggle />
      </main>
    );
  }

  const decision = view.decision;
  const total = view.results
    ? Object.values(view.results.tally).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <main className="screen">
      <header className="screen-head">
        <div>
          <p className="screen-step">
            Fase {view.phase.index} de {view.phase.total}
          </p>
          <h1>{view.phase.title}</h1>
        </div>
        {remaining !== null && (
          <span className={`screen-clock ${remaining === 0 ? 'is-out' : ''}`}>
            {remaining === 0 ? 'Se acabó el tiempo' : formatClock(remaining)}
          </span>
        )}
      </header>

      {view.status === 'paused' && <p className="screen-badge">En pausa</p>}

      <div className="screen-body">
        {view.contents.map((content) => (
          <section key={content.id} className="screen-content">
            {content.kind === 'image' && content.mediaUrl && <img src={content.mediaUrl} alt={content.body} />}
            {content.kind === 'video' && content.mediaUrl && <video src={content.mediaUrl} controls />}
            {content.kind === 'audio' && content.mediaUrl && <audio src={content.mediaUrl} controls />}
            {content.body && <p>{content.body}</p>}
          </section>
        ))}

        {decision && (
          <section className="screen-decision">
            <h2>{decision.prompt}</h2>
            <ul>
              {decision.options.map((option) => {
                const votes = view.results?.tally[option.id] ?? 0;
                const share = total > 0 ? Math.round((votes / total) * 100) : 0;
                const won = view.results?.winnerId === option.id;
                return (
                  <li key={option.id} className={won ? 'is-winner' : ''}>
                    <span className="screen-option-label">{option.label}</span>
                    {view.results && (
                      <>
                        <span className="screen-bar" aria-hidden="true">
                          <span style={{ width: `${share}%` }} />
                        </span>
                        <span className="screen-votes">{votes}</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {view.results?.byFacilitator && (
              <p className="screen-sub">Decisión de quien conduce, no de la votación</p>
            )}
            {!view.results && decision.answersOpen && (
              <p className="screen-sub">Votación abierta · {view.participants} en la sala</p>
            )}
          </section>
        )}
      </div>

      {!connected && <p className="screen-badge">Sin conexión</p>}
      <ThemeToggle />
    </main>
  );
}
