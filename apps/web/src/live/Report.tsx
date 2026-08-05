import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

interface Report {
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  totalSeconds: number | null;
  status: string;
  participants: { displayName: string; roleName: string }[];
  path: {
    id: string;
    title: string;
    kind: string;
    plannedSeconds: number | null;
    actualSeconds: number | null;
    startedAt: string;
    notes: Note[];
  }[];
  decisions: {
    phaseTitle: string;
    prompt: string;
    options: { id: string; label: string; votes: number; won: boolean }[];
    resolvedBy: 'vote' | 'tie_break' | 'override' | 'unresolved';
    wouldHaveWon: string | null;
    reason: string | null;
    notes: Note[];
    votesCast: number;
    peoplePresent: number;
    deliberationSeconds: number | null;
  }[];
  skippedPhases: string[];
  facilitatorOverrides: number;
  closingNotes: Note[];
  timeline: { at: string; label: string }[];
}

interface Note {
  id: string;
  body: string;
  at: string;
}

function duration(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s}s` : `${s}s`;
}

const RESOLVED: Record<Report['decisions'][number]['resolvedBy'], string> = {
  vote: 'por votación',
  tie_break: 'desempate',
  override: 'decisión de quien conduce',
  unresolved: 'sin cerrar',
};

/** The debrief. Everything here is read back from the event log. */
export function Report() {
  const { sessionId = '' } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  /**
   * El debrief se hace con todos mirando la misma pantalla. Con las notas
   * ocultas, esta página se puede proyectar sin filtrar lo que anotaste.
   */
  const [showNotes, setShowNotes] = useState(true);

  const load = useCallback(
    () =>
      fetch(`/api/sessions/${sessionId}/report`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No se pudo cargar'))))
        .then(setReport)
        .catch((e: Error) => setError(e.message)),
    [sessionId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const addNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    await fetch(`/api/sessions/${sessionId}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: draft }),
    });
    setDraft('');
    await load();
  };

  const removeNote = async (noteId: string) => {
    await fetch(`/api/sessions/${sessionId}/notes/${noteId}`, { method: 'DELETE' });
    await load();
  };

  if (error) {
    return (
      <main className="page">
        <h1>Reporte</h1>
        <p className="alert">{error}</p>
        <Link className="back" to="/sessions">
          ← Sesiones
        </Link>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="page">
        <p className="hint">Cargando…</p>
      </main>
    );
  }

  /** Lo que exportás es lo que estás viendo: con las notas ocultas, no viajan. */
  const exportJson = () => {
    const payload = showNotes
      ? report
      : {
          ...report,
          closingNotes: [],
          path: report.path.map((p) => ({ ...p, notes: [] })),
          decisions: report.decisions.map((d) => ({ ...d, notes: [], reason: null })),
        };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-${sessionId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="page report">
      <header className="row row-between no-print">
        <div>
          <h1>{report.title}</h1>
          <p className="lede">
            {report.startedAt ? new Date(report.startedAt).toLocaleString() : 'No llegó a empezar'}
            {report.totalSeconds !== null && ` · duró ${duration(report.totalSeconds)}`}
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className={`btn ${showNotes ? 'btn-warn' : ''}`}
            aria-pressed={showNotes}
            onClick={() => setShowNotes(!showNotes)}
          >
            {showNotes ? 'Notas privadas: visibles' : 'Notas privadas: ocultas'}
          </button>
          <button type="button" className="btn" onClick={exportJson}>
            Exportar .json{showNotes ? '' : ' (sin notas)'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Imprimir o guardar PDF
          </button>
        </div>
      </header>

      {showNotes && (
        <p className="alert no-print">
          Tus notas y los motivos de las intervenciones están a la vista. Si vas a proyectar esta
          pantalla en el debrief, ocultalas primero.
        </p>
      )}

      <h1 className="only-print">{report.title}</h1>

      <div className="tiles">
        <div className="tile">
          <span>{report.participants.length}</span>
          <small>participantes</small>
        </div>
        <div className="tile">
          <span>{report.path.length}</span>
          <small>fases recorridas</small>
        </div>
        <div className="tile">
          <span>{report.decisions.length}</span>
          <small>decisiones</small>
        </div>
        <div className="tile">
          <span>{report.facilitatorOverrides}</span>
          <small>intervenciones</small>
        </div>
      </div>

      <h2>Decisiones</h2>
      {report.decisions.length === 0 ? (
        <p className="hint">No se cerró ninguna decisión.</p>
      ) : (
        report.decisions.map((decision, i) => {
          const total = decision.options.reduce((sum, o) => sum + o.votes, 0);
          return (
            <section key={i} className="panel decision-report">
              <p className="muted">{decision.phaseTitle}</p>
              <h3>{decision.prompt}</h3>

              <ul className="options">
                {decision.options.map((option) => (
                  <li key={option.id}>
                    <div className={`option ${option.won ? 'is-winner' : ''}`}>
                      <strong>{option.label}</strong>
                      <span className="screen-bar" aria-hidden="true">
                        <span style={{ width: total > 0 ? `${(option.votes / total) * 100}%` : '0%' }} />
                      </span>
                      <span className="tally">{option.votes}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="muted">
                Resuelta {RESOLVED[decision.resolvedBy]} · {decision.votesCast} de{' '}
                {decision.peoplePresent} votaron
                {decision.deliberationSeconds !== null &&
                  ` · deliberaron ${duration(decision.deliberationSeconds)}`}
              </p>

              {decision.resolvedBy === 'override' && (
                <p className="note">
                  {/* Que hubo una intervención es un hecho que la sala presenció:
                      se muestra siempre. El motivo lo escribió quien conduce
                      para sí, y sigue la regla de las notas. */}
                  Esta decisión no salió de la votación.
                  {decision.wouldHaveWon && <> La mesa había elegido «{decision.wouldHaveWon}».</>}
                  {showNotes && decision.reason && <> Motivo: {decision.reason}</>}
                </p>
              )}

              {showNotes && decision.notes.length > 0 && (
                <ul className="notes">
                  {decision.notes.map((n) => (
                    <li key={n.id}>
                      <p>{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      <h2>Recorrido</h2>
      <table className="report-table">
        <thead>
          <tr>
            <th>Fase</th>
            <th>Previsto</th>
            <th>Real</th>
          </tr>
        </thead>
        <tbody>
          {report.path.map((phase, i) => (
            <tr key={i}>
              <td>{phase.title}</td>
              <td>{phase.plannedSeconds === null ? 'sin límite' : duration(phase.plannedSeconds)}</td>
              <td
                className={
                  phase.plannedSeconds !== null &&
                  phase.actualSeconds !== null &&
                  phase.actualSeconds > phase.plannedSeconds
                    ? 'over'
                    : ''
                }
              >
                {duration(phase.actualSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.skippedPhases.length > 0 && (
        <p className="note">
          No se recorrieron: {report.skippedPhases.join(', ')}. Son las ramas que las decisiones
          dejaron de lado.
        </p>
      )}

      {showNotes && report.path.some((p) => p.notes.length > 0) && (
        <>
          <h2>Notas durante el ejercicio</h2>
          {report.path
            .filter((p) => p.notes.length > 0)
            .map((phase, i) => (
              <section key={i} className="panel">
                <p className="muted">{phase.title}</p>
                <ul className="notes">
                  {phase.notes.map((n) => (
                    <li key={n.id}>
                      <p>{n.body}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </>
      )}

      {showNotes && <h2>Notas del debrief</h2>}
      {showNotes && (
        <p className="hint no-print">
          Lo que salió al repasar el ejercicio. Se guarda con la sesión, así que sigue acá la
          próxima vez que abras este reporte.
        </p>
      )}
      {showNotes && report.closingNotes.length > 0 && (
        <ul className="notes">
          {report.closingNotes.map((n) => (
            <li key={n.id}>
              <p>{n.body}</p>
              <button
                type="button"
                className="btn btn-danger btn-tiny no-print"
                onClick={() => void removeNote(n.id)}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className={`no-print ${showNotes ? '' : 'is-hidden'}`} onSubmit={addNote}>
        <textarea
          rows={3}
          value={draft}
          placeholder="Al repasarlo salió que…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!draft.trim()}>
          Agregar nota
        </button>
      </form>

      <h2>Quiénes estuvieron</h2>
      <ul className="plain">
        {report.participants.map((person, i) => (
          <li key={i}>
            {person.displayName} <span className="muted">· {person.roleName}</span>
          </li>
        ))}
      </ul>

      <h2>Línea de tiempo</h2>
      <ol className="timeline">
        {report.timeline.map((entry, i) => (
          <li key={i}>
            <span className="muted">
              {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>{' '}
            {entry.label}
          </li>
        ))}
      </ol>

      <Link className="back no-print" to="/sessions">
        ← Sesiones
      </Link>
    </main>
  );
}
