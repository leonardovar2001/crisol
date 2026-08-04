import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api.js';

const SEAT = 'crisol.seat';

export interface Seat {
  sessionId: string;
  participantId: string;
  rejoinToken: string;
  roleId: string;
}

export function readSeat(): Seat | null {
  try {
    const raw = localStorage.getItem(SEAT);
    return raw ? (JSON.parse(raw) as Seat) : null;
  } catch {
    return null;
  }
}

/**
 * Entry for participants: a room code and a name, no account.
 *
 * The seat is kept on the device so a locked phone or a closed tab does not
 * cost someone their role or their vote — they come back to the same seat.
 */
export function Join() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [joinCode, setJoinCode] = useState(params.get('codigo') ?? '');
  const [displayName, setDisplayName] = useState('');
  const [roleCode, setRoleCode] = useState(params.get('rol') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const seat = readSeat();
    if (!seat) return;
    void fetch('/api/sessions/rejoin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rejoinToken: seat.rejoinToken }),
    }).then((r) => {
      if (r.ok) navigate(`/play/${seat.sessionId}`, { replace: true });
      else localStorage.removeItem(SEAT);
    });
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/sessions/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          joinCode: joinCode.trim(),
          displayName: displayName.trim(),
          roleCode: roleCode.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new ApiError(response.status, payload.error ?? 'No se pudo entrar');
      localStorage.setItem(SEAT, JSON.stringify(payload));
      navigate(`/play/${payload.sessionId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page-narrow">
      <h1>Entrar al ejercicio</h1>
      <p className="lede">Pedile el código a quien lo esté conduciendo.</p>

      <form className="panel" onSubmit={submit}>
        <label className="field">
          <span>Código de sala</span>
          <input
            inputMode="numeric"
            pattern="\d{6}"
            placeholder="123456"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Tu nombre</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={40} />
        </label>
        <label className="field">
          <span>Código de rol (opcional)</span>
          <input value={roleCode} onChange={(e) => setRoleCode(e.target.value)} />
          <small>Sólo si te dieron uno. Sin él entrás como participante general.</small>
        </label>
        {error && <p className="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
