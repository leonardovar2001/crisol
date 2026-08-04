import { useParams } from 'react-router-dom';
import { formatClock, useCountdown, useLive } from '../lib/live.js';
import { readSeat } from './Join.js';

/** The participant's phone. Only ever shows what the server sent for their role. */
export function Play() {
  const { sessionId = '' } = useParams();
  const seat = readSeat();
  const { view, connected, denied, send } = useLive(
    seat && seat.sessionId === sessionId
      ? { sessionId, participantId: seat.participantId, rejoinToken: seat.rejoinToken }
      : null,
  );
  const remaining = useCountdown(view);

  if (!seat || seat.sessionId !== sessionId) {
    return (
      <main className="page page-narrow">
        <h1>No estás en esta sesión</h1>
        <p className="lede">
          Entrá con el código de sala desde <a href="/join">acá</a>.
        </p>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="page page-narrow">
        <p className="hint">{connected ? 'Cargando…' : 'Conectando…'}</p>
      </main>
    );
  }

  return (
    <main className="page page-narrow play">
      <header className="play-head">
        <div>
          {view.phase ? (
            <>
              <span className="muted">
                Fase {view.phase.index} de {view.phase.total}
              </span>
              <h1>{view.phase.title}</h1>
            </>
          ) : (
            <h1>{view.status === 'ended' ? 'Terminó el ejercicio' : 'Esperando que empiece'}</h1>
          )}
        </div>
        {remaining !== null && (
          <span className={`clock ${remaining === 0 ? 'is-out' : ''}`}>
            {remaining === 0 ? 'Se acabó' : formatClock(remaining)}
          </span>
        )}
      </header>

      {!connected && <p className="alert">Se cortó la conexión. Reintentando…</p>}
      {view.status === 'paused' && <p className="note">En pausa.</p>}

      {view.contents.map((content) => (
        <section key={content.id} className="content-block">
          {content.kind === 'image' && content.mediaUrl && <img src={content.mediaUrl} alt={content.body} />}
          {content.kind === 'audio' && content.mediaUrl && <audio src={content.mediaUrl} controls />}
          {content.kind === 'video' && content.mediaUrl && <video src={content.mediaUrl} controls />}
          {content.kind === 'file' && content.mediaUrl && (
            <a href={content.mediaUrl} target="_blank" rel="noreferrer">
              Abrir el archivo
            </a>
          )}
          {content.body && <p>{content.body}</p>}
        </section>
      ))}

      {view.decision && (
        <section className="panel">
          <h2>{view.decision.prompt}</h2>
          {denied && <p className="alert">{denied}</p>}

          {/* Arriba de las opciones a propósito: si está abajo, en un teléfono
              queda fuera de pantalla y el botón deshabilitado parece roto. */}
          {!view.decision.answersOpen && !view.results && (
            <p className="waiting">Todavía no se puede votar. Esperá a que abran la votación.</p>
          )}

          <ul className="options">
            {view.decision.options.map((option) => {
              const mine = view.decision?.myVote === option.id;
              const won = view.results?.winnerId === option.id;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    className={`option ${mine ? 'is-mine' : ''} ${won ? 'is-winner' : ''}`}
                    disabled={!view.decision?.answersOpen}
                    onClick={() => send('vote', { optionId: option.id })}
                  >
                    <strong>{option.label}</strong>
                    {option.description && <span>{option.description}</span>}
                    {view.results && (
                      <span className="tally">{view.results.tally[option.id] ?? 0} votos</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {view.decision.answersOpen && view.decision.myVote && (
            <p className="waiting">Voto registrado. Podés cambiarlo mientras siga abierta.</p>
          )}
          {view.results?.byFacilitator && (
            <p className="note">Esta decisión la tomó quien conduce, no salió de la votación.</p>
          )}
        </section>
      )}

      <p className="muted">{view.participants} en la sala</p>
    </main>
  );
}
