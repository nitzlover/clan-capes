'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, UnauthorizedError } from '@/lib/api';
import { Reveal } from '@/components/motion';
import { SkeletonRows } from '@/components/Skeleton';

type ServerRow = {
  id: number;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
};

/**
 * Servers route — Phase 1 surface.
 *
 * Lists every game server registered with this panel via the
 * one-time-pass setup flow. Lets the admin:
 *   - Register a new server by pasting a `setup_<…>` token that the
 *     plugin printed to the OP's chat. We exchange that for a fresh
 *     long-lived API key and display the plaintext exactly once.
 *   - Rotate an existing server's API key (issues a new one, also
 *     displayed once, and immediately revokes the previous).
 *   - Fully deregister a server (cascades the clan/member rows).
 *
 * The one-time API-key reveal modal is non-dismissible by ESC / outside
 * click — the admin must explicitly acknowledge they've stored it.
 * Lose the plaintext, rotate the key.
 */
export default function ServersPage() {
  const [rows, setRows] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ servers: ServerRow[] }>('/panel/servers');
      setRows(res.servers);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function rotate(server: ServerRow) {
    if (
      !confirm(
        `Rotate API key for ${server.name}? The current key will stop working immediately.`,
      )
    )
      return;
    try {
      const res = await api<{ apiKey: string; server: { id: number; name: string } }>(
        `/panel/servers/${server.id}`,
        { method: 'PATCH' },
      );
      setRevealed({
        kind: 'rotate',
        serverName: res.server.name,
        apiKey: res.apiKey,
      });
      load();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      alert(e instanceof Error ? e.message : 'Rotate failed');
    }
  }

  async function remove(server: ServerRow) {
    if (
      !confirm(
        `Deregister ${server.name}? This cascades to all clans, members, and banners on that server. Audit history stays.`,
      )
    )
      return;
    try {
      await api(`/panel/servers/${server.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      alert(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Servers</h1>
          <p className="page-subtitle">
            Game servers registered with this panel via one-time-pass setup.
          </p>
        </div>
        <button onClick={() => setRegisterOpen(true)} className="btn-primary">
          + Register server
        </button>
      </div>

      <section className="brutal-card">
        <div className="flex items-center justify-between border-b-2 border-[var(--rule-strong)] bg-[var(--bg-sink)] px-6 py-4">
          <span className="label-mono">Registered servers</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            {rows.length} total
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-6 py-4">
              <SkeletonRows rows={4} />
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
                No servers registered.
              </p>
              <p className="mt-2 text-xs text-[var(--text-faint)]">
                Run <code className="text-[var(--text-soft)]">/clancapes setup</code>{' '}
                on a Paper server, then paste the printed token here.
              </p>
            </div>
          ) : (
            <Reveal>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--rule)]">
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th>Last seen</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--rule)] last:border-b-0">
                    <Td>
                      <span className="font-sans text-sm font-extrabold uppercase tracking-wider text-white">
                        {s.name}
                      </span>
                    </Td>
                    <Td>
                      <StatusPill lastSeenAt={s.lastSeenAt} />
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
                        {new Date(s.createdAt).toLocaleString()}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                        {s.lastSeenAt
                          ? new Date(s.lastSeenAt).toLocaleString()
                          : 'never'}
                      </span>
                    </Td>
                    <Td align="right">
                      <button
                        onClick={() => rotate(s)}
                        className="mr-3 border border-[var(--rule-strong)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-soft)] hover:border-white hover:bg-white hover:text-black"
                      >
                        Rotate key
                      </button>
                      <button
                        onClick={() => remove(s)}
                        className="btn-danger-link"
                      >
                        Delete
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            </Reveal>
          )}
        </div>
      </section>

      {registerOpen && (
        <RegisterModal
          onClose={() => setRegisterOpen(false)}
          onIssued={(payload) => {
            setRegisterOpen(false);
            setRevealed(payload);
            load();
          }}
        />
      )}

      {revealed && (
        <RevealModal data={revealed} onClose={() => setRevealed(null)} />
      )}
    </div>
  );
}

/**
 * Status pill driven by the heartbeat freshness window. Anything seen
 * inside the last 10 minutes counts as online — the plugin pings every
 * 5 by default, so a single missed beat still reads as healthy. Past
 * 30 minutes we call it stale; older than 24h or never seen drops to
 * the offline state.
 */
function StatusPill({ lastSeenAt }: { lastSeenAt: string | null }) {
  if (!lastSeenAt) {
    return (
      <span className="meta-tag" title="No heartbeat received yet">
        <span className="status-dot" aria-hidden /> never
      </span>
    );
  }
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  const minutes = ageMs / 60_000;
  let label = 'online';
  let cls = 'status-pill ok';
  if (minutes > 30) {
    label = 'offline';
    cls = 'status-pill bad';
  } else if (minutes > 10) {
    label = 'stale';
    cls = 'status-pill';
  }
  return (
    <span className={cls} title={`Last heartbeat ${Math.round(minutes)} min ago`}>
      <span className="status-dot" aria-hidden />
      {label}
    </span>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <th
      className={`px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-faint)] ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <td className={`px-6 py-4 ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </td>
  );
}

type RevealedKey = {
  kind: 'create' | 'rotate';
  serverName: string;
  apiKey: string;
};

function RegisterModal({
  onClose,
  onIssued,
}: {
  onClose: () => void;
  onIssued: (revealed: RevealedKey) => void;
}) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{
        apiKey: string;
        server: { id: number; name: string };
      }>('/setup/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      onIssued({
        kind: 'create',
        serverName: res.server.name,
        apiKey: res.apiKey,
      });
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setError(e instanceof Error ? e.message : 'Consume failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 className="font-sans text-2xl font-extrabold uppercase tracking-tight text-white">
        Register server
      </h2>
      <p className="mt-2 text-sm text-[var(--text-mute)]">
        Paste the one-time-pass token printed by{' '}
        <code className="text-[var(--text-soft)]">/clancapes setup</code> on the
        game server. The token expires 15 minutes after generation.
      </p>

      <label className="mt-6 block">
        <span className="label-mono">Setup token</span>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          spellCheck={false}
          placeholder="setup_…"
          className="input mt-2 font-mono"
          autoFocus
        />
      </label>
      {error && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-white">
          ! {error}
        </p>
      )}

      <div className="mt-8 flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost" disabled={busy}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || !token.trim()}
          className="btn-primary disabled:opacity-40"
        >
          {busy ? 'Consuming…' : 'Consume token'}
        </button>
      </div>
    </ModalShell>
  );
}

function RevealModal({
  data,
  onClose,
}: {
  data: RevealedKey;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (insecure context, focus issues).
      // Fall through — the user can select+copy from the visible <code>.
    }
  }

  return (
    <ModalShell onClose={onClose} dismissible={false}>
      <p className="label-mono">
        {data.kind === 'rotate' ? 'API key rotated' : 'Server registered'}
      </p>
      <h2 className="mt-2 font-sans text-2xl font-extrabold uppercase tracking-tight text-white">
        {data.serverName}
      </h2>
      <p className="mt-3 text-sm text-[var(--text-mute)]">
        Copy the API key below and paste it into the plugin's{' '}
        <code className="text-[var(--text-soft)]">config.yml</code>{' '}
        (<code className="text-[var(--text-soft)]">/clancapes link</code>{' '}
        works too). <strong className="text-white">This key will not be shown again.</strong>{' '}
        Lose it and you'll have to rotate.
      </p>

      <pre className="mt-6 overflow-x-auto border-2 border-[var(--rule-strong)] bg-black px-4 py-3 font-mono text-[12px] text-white">
        {data.apiKey}
      </pre>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <button onClick={copy} className="btn-ghost">
          {copied ? '✓ Copied' : 'Copy to clipboard'}
        </button>
        <button onClick={onClose} className="btn-primary">
          I've saved it
        </button>
      </div>
    </ModalShell>
  );
}

/**
 * Shared modal shell — brutalist 2px frame, hard offset shadow,
 * dark backdrop. Dismissible by ESC/backdrop click by default; the
 * reveal modal flips that off so the admin can't accidentally close
 * before copying the API key.
 */
function ModalShell({
  children,
  onClose,
  dismissible = true,
}: {
  children: React.ReactNode;
  onClose: () => void;
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!dismissible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismissible, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        className="w-full max-w-lg border-2 border-white bg-[var(--bg-raise)] p-8 shadow-[10px_10px_0_0_rgba(255,255,255,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
