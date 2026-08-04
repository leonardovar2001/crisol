import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type ScenarioSummary } from '../lib/api.js';

interface SessionRow {
  id: string;
  joinCode: string;
  status: 'draft' | 'live' | 'paused' | 'ended';
  title: string;
  participants: string;
  createdAt: string;
}

const LABEL: Record<SessionRow['status'], string> = {
  draft: 'sin empezar',
  live: 'en curso',
  paused: 'en pausa',
  ended: 'terminada',
};

export function Sessions() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    Promise.all([
      api.listScenarios().then(setScenarios),
      fetch('/api/sessions')
        .then((r) => (r.ok ? r.json() : []))
        .then(setSessions),
    ]).catch(() => setError('No se pudo conectar con el servidor'));

  useEffect(() => {
    void reload();
  }, []);

  const launch = async (scenarioId: string) => {
    const response = await fetch(`/api/scenarios/${scenarioId}/sessions`, { method: 'POST' });
    if (!response.ok) return setError('No se pudo lanzar la sesión');
    const created = await response.json();
    navigate(`/control/${created.id}`);
  };

  return (
    <main className="page">
      <h1>Sesiones</h1>
      <p className="lede">Lanzá un escenario y conducilo. Los participantes entran con un código.</p>

      {error && <p className="alert">{error}</p>}

      <h2>Lanzar</h2>
      {scenarios.length === 0 ? (
        <p className="note">
          No hay escenarios todavía. <Link to="/admin">Creá uno primero</Link>.
        </p>
      ) : (
        <ul className="card-list">
          {scenarios.map((scenario) => (
            <li key={scenario.id} className="card card-row">
              <div className="card-main">
                <strong>{scenario.title}</strong>
                <span>
                  {scenario.phases} {scenario.phases === 1 ? 'fase' : 'fases'}
                </span>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void launch(scenario.id)}>
                Lanzar
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2>Sesiones recientes</h2>
      {sessions.length === 0 ? (
        <p className="hint">Ninguna todavía.</p>
      ) : (
        <ul className="card-list">
          {sessions.map((session) => (
            <li key={session.id} className="card card-row">
              <Link className="card-main" to={`/control/${session.id}`}>
                <strong>{session.title}</strong>
                <span>
                  código {session.joinCode} · {LABEL[session.status]} · {session.participants}{' '}
                  {session.participants === '1' ? 'persona' : 'personas'}
                </span>
              </Link>
              <Link className="btn" to={`/report/${session.id}`}>
                Reporte
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link className="back" to="/">
        ← Inicio
      </Link>
    </main>
  );
}
