import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ScenarioEditor } from './editor/ScenarioEditor.js';
import { ScenarioList } from './editor/ScenarioList.js';
import { RequireUser, SessionProvider } from './editor/Session.js';

/**
 * Route shell for the surfaces described in docs/01-vision-y-arquitectura.md §6.
 * Every one of these is a placeholder — the real screens come next.
 */

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <main className="placeholder">
      <h1>{title}</h1>
      <p className="lede">{note}</p>
      <p className="note">Esta pantalla todavía no está construida.</p>
      <Link className="back" to="/">
        ← Inicio
      </Link>
    </main>
  );
}

const surfaces = [
  { to: '/admin', name: 'Autoría de escenarios', hint: 'Roles, fases, contenido, gráficos y decisiones.' },
  { to: '/sessions', name: 'Sesiones', hint: 'Lanzar una sesión, códigos de sala y QR.' },
  { to: '/join', name: 'Entrar a una sesión', hint: 'Con el código que te pasaron.' },
];

function Home() {
  return (
    <main className="placeholder">
      <h1>Crisol</h1>
      <p className="lede">Ejercicios por fases con decisiones en grupo. Todavía en construcción.</p>

      <ul className="card-list">
        {surfaces.map((s) => (
          <li key={s.to}>
            <Link className="card" to={s.to}>
              <strong>{s.name}</strong>
              <span>{s.hint}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="note">
        El motor no sabe de ninguna materia en particular: la pone quien escribe el escenario.
      </p>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/admin"
          element={
            <RequireUser>
              <ScenarioList />
            </RequireUser>
          }
        />
        <Route
          path="/admin/:draftId"
          element={
            <RequireUser>
              <ScenarioEditor />
            </RequireUser>
          }
        />
        <Route path="/sessions" element={<Placeholder title="Sesiones" note="Lanzar sesiones, códigos de sala y QR." />} />
        <Route path="/control/:sessionId" element={<Placeholder title="Control" note="Reloj, avance de fases, votación." />} />
        <Route path="/presenter/:sessionId" element={<Placeholder title="Presenter" note="Guion de quien conduce." />} />
        <Route path="/screen/:sessionId" element={<Placeholder title="Pantalla" note="Vista de sala para proyectar." />} />
        <Route path="/join" element={<Placeholder title="Entrar" note="Código de sala o QR." />} />
        <Route path="/play/:sessionId" element={<Placeholder title="Participante" note="Contenido de tu rol y votación." />} />
        <Route path="/report/:sessionId" element={<Placeholder title="Reporte" note="Qué pasó, qué se votó, exportable." />} />
          <Route path="*" element={<Placeholder title="No encontrado" note="Esa ruta no existe." />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
