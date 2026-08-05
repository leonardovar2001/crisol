import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { parseScenarioFile } from '@crisol/shared';
import { createDraft } from '../lib/draft.js';
import { api, ApiError, type ScenarioSummary } from '../lib/api.js';
import { useSession } from './Session.js';

export function ScenarioList() {
  const navigate = useNavigate();
  const { user, signOut } = useSession();
  const [scenarios, setScenarios] = useState<ScenarioSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = async () => {
    try {
      setScenarios(await api.listScenarios());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = title.trim();
    if (!name) return;
    try {
      const created = await api.createScenario(createDraft(name, user?.locale ?? 'es'));
      navigate(`/admin/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear');
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`¿Borrar "${name}"? Se borra también lo que hayas subido. No se puede deshacer.`))
      return;
    await api.deleteScenario(id);
    void reload();
  };

  const importFile = async (file: File) => {
    setError(null);
    try {
      const parsed = parseScenarioFile(JSON.parse(await file.text()));
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        setError(`El archivo no es un escenario válido: ${first?.path.join('.')} — ${first?.message}`);
        return;
      }
      const created = await api.createScenario(parsed.data);
      navigate(`/admin/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('No se pudo leer el archivo. ¿Es un .json exportado desde Crisol?');
    }
  };

  return (
    <main className="page">
      <div className="row row-between">
        <h1>Escenarios</h1>
        <button type="button" className="btn" onClick={() => void signOut()}>
          Salir ({user?.email})
        </button>
      </div>
      <p className="lede">Diseñá un ejercicio: roles, fases, decisiones y hacia dónde lleva cada una.</p>

      <form className="row" onSubmit={create}>
        <input
          aria-label="Título del escenario nuevo"
          placeholder="Título del escenario nuevo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Crear
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          Importar
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />
      </form>

      {error && <p className="alert">{error}</p>}

      {scenarios === null ? (
        <p className="hint">Cargando…</p>
      ) : scenarios.length === 0 ? (
        <p className="note">
          Todavía no hay ninguno. Escribí un título arriba y empezá, o importá un <code>.json</code>{' '}
          que te hayan pasado.
        </p>
      ) : (
        <ul className="card-list">
          {scenarios.map((s) => (
            <li key={s.id} className="card card-row">
              <Link className="card-main" to={`/admin/${s.id}`}>
                <strong>{s.title}</strong>
                <span>
                  {s.slug} · {s.phases} {s.phases === 1 ? 'fase' : 'fases'} · editado{' '}
                  {new Date(s.updatedAt).toLocaleString()}
                </span>
              </Link>
              <button type="button" className="btn btn-danger" onClick={() => void remove(s.id, s.title)}>
                Borrar
              </button>
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
