import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle.js';
import {
  applyInstanceTheme,
  contrast,
  isDarkEnoughForBase,
  useInstanceTheme,
} from '../lib/theme.js';
import { useSession } from './Session.js';

const DEFAULTS = { baseColor: '#0f3040', accentColor: '#4fa8cc' };

/**
 * Instance colours. Two of them, because everything else is derived — a
 * self-hoster can look like their organisation without being able to leave the
 * projected screen unreadable.
 */
export function Appearance() {
  const { user } = useSession();
  const { theme, reload } = useInstanceTheme();
  const [draft, setDraft] = useState(DEFAULTS);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (theme) setDraft(theme);
  }, [theme]);

  // Live preview: the page you are looking at is the preview.
  useEffect(() => {
    applyInstanceTheme(draft);
  }, [draft]);

  const baseOk = isDarkEnoughForBase(draft.baseColor);
  const onLight = contrast(draft.accentColor, '#ffffff');
  const onDark = contrast(draft.accentColor, draft.baseColor);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(null);
    const response = await fetch('/api/instance/theme', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? 'No se pudo guardar');
      return;
    }
    setSaved('Guardado. Lo ven todos los que entren a esta instancia.');
    void reload();
  };

  if (user && user.role !== 'owner') {
    return (
      <main className="page">
        <h1>Apariencia</h1>
        <p className="note">Sólo quien administra la instancia puede cambiar los colores.</p>
        <Link className="back" to="/admin">
          ← Escenarios
        </Link>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="row row-between">
        <h1>Apariencia</h1>
        <ThemeToggle />
      </div>
      <p className="lede">
        Dos colores, y el resto se deriva. Lo que ves en esta página ya es la vista previa.
      </p>

      <form className="panel" onSubmit={save}>
        <label className="field">
          <span>Color base</span>
          <div className="row">
            <input
              type="color"
              className="swatch"
              value={draft.baseColor}
              onChange={(e) => setDraft({ ...draft, baseColor: e.target.value })}
            />
            <input
              value={draft.baseColor}
              onChange={(e) => setDraft({ ...draft, baseColor: e.target.value })}
              spellCheck={false}
            />
          </div>
          <small>
            Es el fondo del modo oscuro y la tinta del modo claro, así que tiene que ser oscuro.
          </small>
          {!baseOk && (
            <p className="alert">
              Demasiado claro. Con este color el modo oscuro se queda sin contraste.
            </p>
          )}
        </label>

        <label className="field">
          <span>Color de acento</span>
          <div className="row">
            <input
              type="color"
              className="swatch"
              value={draft.accentColor}
              onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })}
            />
            <input
              value={draft.accentColor}
              onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })}
              spellCheck={false}
            />
          </div>
          <small>Botones, enlaces, el reloj y la opción ganadora.</small>
        </label>

        <table className="contrast">
          <tbody>
            <tr>
              <td>Acento sobre fondo claro</td>
              <td>{onLight.toFixed(1)}:1</td>
              <td>{onLight >= 4.5 ? 'se lee bien' : onLight >= 3 ? 'justo' : 'no se lee'}</td>
            </tr>
            <tr>
              <td>Acento sobre fondo oscuro</td>
              <td>{onDark.toFixed(1)}:1</td>
              <td>{onDark >= 4.5 ? 'se lee bien' : onDark >= 3 ? 'justo' : 'no se lee'}</td>
            </tr>
          </tbody>
        </table>
        <p className="hint">
          Se recomienda 4.5:1 o más. Esto importa en la pantalla proyectada, que se mira desde el
          fondo de una sala.
        </p>

        {error && <p className="alert">{error}</p>}
        {saved && <p className="note">{saved}</p>}

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={!baseOk}>
            Guardar
          </button>
          <button type="button" className="btn" onClick={() => setDraft(DEFAULTS)}>
            Volver al original
          </button>
        </div>
      </form>

      <Link className="back" to="/admin">
        ← Escenarios
      </Link>
    </main>
  );
}
