import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';

/**
 * Route shell for the surfaces described in docs/01-vision-y-arquitectura.md §7.
 * Every one of these is a placeholder — the real screens come next.
 */

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <main className="placeholder">
      <h1>{title}</h1>
      <p>{note}</p>
      <Link to="/">← Inicio</Link>
    </main>
  );
}

function Home() {
  return (
    <main className="placeholder">
      <h1>Crisol</h1>
      <p>Plataforma de ejercicios de simulación. Todavía en construcción.</p>
      <nav>
        <ul>
          <li><Link to="/admin">Autoría de escenarios</Link></li>
          <li><Link to="/sessions">Sesiones</Link></li>
          <li><Link to="/join">Entrar a una sesión</Link></li>
        </ul>
      </nav>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/*" element={<Placeholder title="Autoría" note="Editor de escenarios, fases, gráficos y medios." />} />
        <Route path="/sessions" element={<Placeholder title="Sesiones" note="Lanzar sesiones, códigos de sala y QR." />} />
        <Route path="/control/:sessionId" element={<Placeholder title="Control" note="Reloj, avance de fases, votación." />} />
        <Route path="/presenter/:sessionId" element={<Placeholder title="Presenter" note="Cues del facilitador." />} />
        <Route path="/screen/:sessionId" element={<Placeholder title="Pantalla" note="Vista de sala para proyectar." />} />
        <Route path="/join" element={<Placeholder title="Entrar" note="Código de sala o QR." />} />
        <Route path="/play/:sessionId" element={<Placeholder title="Participante" note="Contenido de tu rol y votación." />} />
        <Route path="/report/:sessionId" element={<Placeholder title="Reporte" note="Qué pasó, qué se votó, exportable." />} />
        <Route path="*" element={<Placeholder title="No encontrado" note="Esa ruta no existe." />} />
      </Routes>
    </BrowserRouter>
  );
}
