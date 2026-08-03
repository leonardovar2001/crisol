import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, type User } from '../lib/api.js';

/** Who is signed in, if anyone. `undefined` means we have not asked yet. */
const Ctx = createContext<{
  user: User | null | undefined;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}>({ user: undefined, refresh: async () => {}, signOut: async () => {} });

export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setUser(null);
      else setUser(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ user, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function RequireUser({ children }: { children: React.ReactNode }) {
  const { user } = useSession();

  if (user === undefined) return <main className="page">Cargando…</main>;
  if (user === null) return <Login />;
  return <>{children}</>;
}

function Login() {
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page-narrow">
      <h1>Entrar</h1>
      <p className="lede">Esta instancia es tuya. Sólo entran las cuentas que hayas creado.</p>

      <form className="panel" onSubmit={submit}>
        <label className="field">
          <span>Correo</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
