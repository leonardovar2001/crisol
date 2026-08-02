import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { scenarioSchema } from '@crisol/shared';
import { createDraft, newId } from '../lib/draft.js';
import { deleteDraft, listDrafts, saveDraft, type DraftSummary } from '../lib/storage.js';

export function ScenarioList() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftSummary[]>(() => listDrafts());
  const [title, setTitle] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    const name = title.trim();
    if (!name) return;
    const id = newId('esc');
    saveDraft(id, createDraft(name));
    navigate(`/admin/${id}`);
  };

  const remove = (id: string, name: string) => {
    if (!confirm(`¿Borrar "${name}"? No se puede deshacer.`)) return;
    deleteDraft(id);
    setDrafts(listDrafts());
  };

  const importFile = async (file: File) => {
    setImportError(null);
    try {
      const parsed = scenarioSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        setImportError(
          `El archivo no es un escenario válido: ${first?.path.join('.')} — ${first?.message}`,
        );
        return;
      }
      const id = newId('esc');
      saveDraft(id, parsed.data);
      navigate(`/admin/${id}`);
    } catch {
      setImportError('No se pudo leer el archivo. ¿Es un .json exportado desde Crisol?');
    }
  };

  return (
    <main className="page">
      <header className="page-head">
        <h1>Escenarios</h1>
        <p className="lede">Diseñá un ejercicio: roles, fases, decisiones y hacia dónde lleva cada una.</p>
      </header>

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

      {importError && <p className="alert">{importError}</p>}

      {drafts.length === 0 ? (
        <p className="note">
          Todavía no hay ninguno. Escribí un título arriba y empezá, o importá un <code>.json</code>{' '}
          que te hayan pasado.
        </p>
      ) : (
        <ul className="card-list">
          {drafts.map((d) => (
            <li key={d.id} className="card card-row">
              <Link className="card-main" to={`/admin/${d.id}`}>
                <strong>{d.title}</strong>
                <span>
                  {d.slug} · {d.phases} {d.phases === 1 ? 'fase' : 'fases'} · editado{' '}
                  {new Date(d.updatedAt).toLocaleString()}
                </span>
              </Link>
              <button type="button" className="btn btn-danger" onClick={() => remove(d.id, d.title)}>
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="note">
        Los escenarios se guardan en este navegador. Todavía no hay servidor: si limpiás los datos
        del navegador, se pierden. <strong>Exportá el archivo</strong> para tener una copia de verdad.
      </p>

      <Link className="back" to="/">
        ← Inicio
      </Link>
    </main>
  );
}
