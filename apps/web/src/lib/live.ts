import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

/** What the server sends. Whatever is not here, this client is not allowed to know. */
export interface LiveView {
  status: 'draft' | 'live' | 'paused' | 'ended';
  phase: { id: string; title: string; kind: string; index: number; total: number } | null;
  remainingSeconds: number | null;
  runningSince: string | null;
  serverNow: string;
  contents: { id: string; kind: string; body: string; mediaUrl: string | null }[];
  decision: {
    id: string;
    prompt: string;
    options: { id: string; label: string; description: string }[];
    answersOpen: boolean;
    myVote: string | null;
  } | null;
  results: { tally: Record<string, number>; winnerId: string | null; byFacilitator: boolean } | null;
  participants: number;
  charts: import('../components/Chart.js').ChartData[];
  // Only present on the facilitator's view.
  liveTally?: Record<string, number> | null;
  notes?: { id: string; phaseId: string | null; decisionId: string | null; body: string; at: string }[];
  presenterCue?: string;
  roster?: { id: string; displayName: string; roleName: string; status: string }[];
  pending?: { id: string; displayName: string; roleName: string }[];
  approvalMode?: string;
  /** Está esperando que lo dejen entrar: la vista viene vacía a propósito. */
  awaitingApproval?: boolean;
  nextPhaseTitle?: string | null;
  resultsVisible?: boolean;
}

export function useLive(query: Record<string, string> | null) {
  const [view, setView] = useState<LiveView | null>(null);
  const [connected, setConnected] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    if (!query) return;
    const s = io({ path: '/socket.io', query, transports: ['websocket', 'polling'] });
    socket.current = s;

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('state', (next: LiveView) => setView(next));
    s.on('denied', (message: string) => {
      setDenied(message);
      setTimeout(() => setDenied(null), 4000);
    });

    return () => {
      s.close();
      socket.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(query)]);

  const send = (event: string, payload?: unknown) => socket.current?.emit(event, payload ?? {});
  return { view, connected, denied, send };
}

/**
 * The clock the server owns.
 *
 * The server says how much was left and when it started running; the browser
 * only interpolates between updates. That is what keeps the projected screen
 * and twenty phones showing the same number.
 */
export function useCountdown(view: LiveView | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (!view || view.remainingSeconds === null) return null;
  if (view.status !== 'live' || !view.runningSince) return view.remainingSeconds;

  const drift = now - Date.parse(view.serverNow);
  const elapsed = (Date.parse(view.serverNow) - Date.parse(view.runningSince) + drift) / 1000;
  return Math.max(0, Math.round(view.remainingSeconds - elapsed));
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
