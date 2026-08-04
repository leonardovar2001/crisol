import { useEffect, useState } from 'react';
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
  }[];
  decisions: {
    phaseTitle: string;
    prompt: string;
    options: { id: string; label: string; votes: number; won: boolean }[];
    resolvedBy: 'vote' | 'tie_break' | 'override' | 'unresolved';
    wouldHaveWon: string | null;
    votesCast: number;
    peoplePresent: number;
    deliberationSeconds: number | null;
  }[];
  skippedPhases: string[];
  facilitatorOverrides: number;
  timeline: { at: string; label: string }[];
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

  useEffect(() => {
    void fetch(`/api/sessions/${sessionId}/report`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No se pudo cargar'))))
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [sessionId]);

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

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
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
          <button type="button" className="btn" onClick={exportJson}>
            Exportar .json
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </header>

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
                  Esta decisión no salió de la votación.
                  {decision.wouldHaveWon && <> La mesa había elegido «{decision.wouldHaveWon}».</>}
                </p>
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
