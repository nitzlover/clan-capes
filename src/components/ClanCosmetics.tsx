'use client';

/**
 * Per-clan cosmetics managers — Cape, Trim, Banner — used by the unified
 * /dashboard/clans editor (the Capes + Banners pages were folded into the
 * clan row, one hub per clan).
 *
 * Each manager is self-contained: it owns its own network plumbing through the
 * admin `api()` wrapper (server-scoped via ?serverId=) and surfaces results as
 * toasts. CapeManager additionally handles the PNG upload that used to live on
 * the standalone Cape Studio page.
 */

import { useEffect, useRef, useState } from 'react';
import { PlayerCapeView3D } from '@/components/PlayerCapeView3D';
import { ArmorTrimEditor, type ArmorTrimRecord } from '@/components/ArmorTrimEditor';
import { BannerEditor } from '@/components/BannerEditor';
import { BannerPreview } from '@/components/BannerPreview';
import {
  api,
  getToken,
  fetchClanBanner,
  saveClanBanner,
  deleteClanBanner,
  type ClanBannerDto,
} from '@/lib/api';
import { EMPTY_SPEC, type BannerSpec } from '@/lib/banners';
import { serverQueryString } from '@/lib/selected-server';
import { useToast } from '@/components/Toast';

export type CapeInfo = { capeUrl: string; updatedAt: number; updatedBy: string } | null;

function relTime(ms?: number): string {
  if (!ms) return '';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortActor(actor?: string): string {
  if (!actor) return '';
  const i = actor.indexOf(':');
  return i >= 0 ? actor.slice(i + 1) : actor;
}

/* ───────────────────────── Cape ───────────────────────── */

export function CapeManager({
  tag,
  serverId,
  cape,
  onChanged,
}: {
  tag: string;
  serverId: number | null;
  cape: CapeInfo;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [equip, setEquip] = useState<'cape' | 'elytra'>('cape');
  const [pose, setPose] = useState<'stand' | 'fly'>('stand');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [valid, setValid] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    if (!file) {
      setValid(false);
      setNote('');
      return;
    }
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dimsOk =
        (img.width === 64 && img.height === 32) || (img.width === 128 && img.height === 64);
      const kb = Math.round(file.size / 1024);
      const ok = dimsOk && kb <= 512;
      setValid(ok);
      setNote(
        ok
          ? `${img.width}×${img.height} · ${kb} KB`
          : `${img.width}×${img.height} · ${kb} KB — need 64×32 / 128×64, ≤512 KB`,
      );
      URL.revokeObjectURL(u);
    };
    img.onerror = () => {
      setValid(false);
      setNote('could not decode PNG');
      URL.revokeObjectURL(u);
    };
    img.src = u;
  }, [file]);

  const shownCape = preview ?? cape?.capeUrl ?? null;

  async function upload() {
    if (!file || !valid || busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('cape', file);
      const token = getToken();
      const res = await fetch(`/api/panel/clans/${tag}/cape${serverQueryString(serverId)}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? 'Upload failed');
      }
      toast.success(`Cape pinned to ${tag}`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!cape || busy) return;
    if (!confirm(`Remove the cape pinned to ${tag}?`)) return;
    setBusy(true);
    try {
      await api(`/panel/clans/${tag}/cape${serverQueryString(serverId)}`, { method: 'DELETE' });
      toast.success(`Removed cape for ${tag}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!cape) return;
    const a = document.createElement('a');
    a.href = cape.capeUrl;
    a.download = `${tag}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copyUrl() {
    if (!cape) return;
    const url = cape.capeUrl.startsWith('/') ? `${location.origin}${cape.capeUrl}` : cape.capeUrl;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Cape URL copied');
    } catch {
      toast.error('Clipboard blocked by the browser');
    }
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (f.type !== 'image/png') {
      setNote(`rejected ${f.name}: not a PNG`);
      return;
    }
    setFile(f);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      {/* ── stage — seamless: skinview3d's canvas is always opaque (no alpha),
            so it's cleared to the editor surface color and gets NO box, glow
            or frame of its own; the figure floats on the row background. ── */}
      <div className="flex flex-col gap-3">
        <div className="relative flex min-h-[360px] items-center justify-center">
          {shownCape ? (
            <PlayerCapeView3D
              capeUrl={shownCape}
              width={240}
              height={330}
              view="back"
              backEquipment={equip}
              stance={pose}
              interactive
              background={0x0d0d0d}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-[var(--text-faint)]">
              <span className="material-symbols-outlined" style={{ fontSize: 34 }}>
                checkroom
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]">no cape yet</span>
            </div>
          )}
          {preview && (
            <span className="pointer-events-none absolute right-3 top-3 border border-[var(--accent-line)] bg-black/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--accent-bright)]">
              unsaved
            </span>
          )}
          <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
            <span className="status-dot" style={{ background: 'var(--accent)' }} />
            back · drag to spin
          </span>
        </div>

        {/* control bar — below the stage, labelled segmented pills */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <SegControl
            label="Back"
            value={equip}
            onChange={(v) => setEquip(v as 'cape' | 'elytra')}
            options={[
              { value: 'cape', label: 'Cape' },
              { value: 'elytra', label: 'Elytra' },
            ]}
          />
          <SegControl
            label="Pose"
            value={pose}
            onChange={(v) => setPose(v as 'stand' | 'fly')}
            options={[
              { value: 'stand', label: 'Idle' },
              { value: 'fly', label: 'Fly' },
            ]}
          />
        </div>
      </div>

      {/* ── panel ── */}
      <div className="flex flex-col gap-6">
        {/* upload */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="label-mono">{cape ? 'Replace texture' : 'Upload texture'}</p>
            {cape ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent-bright)]">
                <span className="status-dot" style={{ background: 'var(--accent)' }} />
                active
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                empty
              </span>
            )}
          </div>
          <label
            htmlFor={`cape-file-${tag}`}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragOver
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--rule-strong)] hover:border-white hover:bg-white/[0.02]'
            }`}
          >
            <span className="material-symbols-outlined mb-2 text-[var(--text-mute)]" style={{ fontSize: 28 }}>
              upload_file
            </span>
            <p className="font-sans text-sm font-extrabold uppercase tracking-widest text-white">
              {file ? 'Replace PNG' : 'Drop / pick PNG'}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
              64×32 or 128×64 · ≤512 KB
            </p>
            {note && (
              <p
                className={`mt-2 font-mono text-[10px] uppercase tracking-[0.16em] ${
                  valid ? 'text-[var(--text-soft)]' : 'text-white'
                }`}
              >
                {valid ? '✓' : '!'} {note}
              </p>
            )}
            <input
              ref={inputRef}
              id={`cape-file-${tag}`}
              type="file"
              accept="image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={upload} disabled={!valid || busy} className="btn-accent text-[13px] disabled:opacity-30">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                cloud_upload
              </span>
              {busy ? 'Deploying…' : cape ? 'Replace cape' : 'Deploy cape'}
            </button>
            {file && (
              <button type="button" onClick={() => setFile(null)} className="btn-ghost text-[13px]">
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* current */}
        {cape && (
          <div className="border-t border-[var(--rule)] pt-6">
            <p className="label-mono mb-3">Live texture</p>
            <div className="flex flex-wrap items-start gap-4">
              <div className="border border-[var(--rule-strong)] bg-black p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cape.capeUrl}
                  alt={`${tag} cape texture`}
                  className="block [image-rendering:pixelated]"
                  style={{ width: 160, height: 80 }}
                />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[11px]">
                <dt className="text-[var(--text-faint)]">File</dt>
                <dd className="truncate text-[var(--text-soft)]">{cape.capeUrl.split('?')[0].split('/').pop()}</dd>
                {cape.updatedAt > 0 && (
                  <>
                    <dt className="text-[var(--text-faint)]">Updated</dt>
                    <dd className="text-[var(--text-soft)]" title={new Date(cape.updatedAt).toLocaleString()}>
                      {relTime(cape.updatedAt)}
                    </dd>
                  </>
                )}
                {shortActor(cape.updatedBy) && (
                  <>
                    <dt className="text-[var(--text-faint)]">By</dt>
                    <dd className="truncate text-[var(--text-soft)]">{shortActor(cape.updatedBy)}</dd>
                  </>
                )}
              </dl>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={download} className="btn-ghost text-[13px]">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  download
                </span>
                PNG
              </button>
              <button type="button" onClick={copyUrl} className="btn-ghost text-[13px]">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  link
                </span>
                URL
              </button>
              <span className="flex-1" />
              <button type="button" onClick={remove} disabled={busy} className="btn-danger-link self-center">
                Remove cape
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Trim ───────────────────────── */

export function TrimManager({ tag, serverId }: { tag: string; serverId: number | null }) {
  const qs = serverQueryString(serverId);
  return (
    <div className="overflow-x-auto">
      <ArmorTrimEditor
        loadTrims={async () =>
          (await api<{ trims: ArmorTrimRecord[] }>(`/panel/clans/${tag}/armor-trim${qs}`)).trims
        }
        saveSlot={async (slot, material, pattern) => {
          await api(`/panel/clans/${tag}/armor-trim/${slot}${qs}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ material, pattern }),
          });
        }}
        clearSlot={async (slot) => {
          await api(`/panel/clans/${tag}/armor-trim/${slot}${qs}`, { method: 'DELETE' });
        }}
      />
    </div>
  );
}

/* ───────────────────────── Banner ───────────────────────── */

export function BannerManager({ tag, serverId }: { tag: string; serverId: number | null }) {
  const toast = useToast();
  const [banner, setBanner] = useState<ClanBannerDto | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBanner(undefined);
    fetchClanBanner(tag, serverId)
      .then((b) => {
        if (alive) setBanner(b);
      })
      .catch(() => {
        if (alive) setBanner(null);
      });
    return () => {
      alive = false;
    };
  }, [tag, serverId]);

  const spec: BannerSpec = banner
    ? { baseColor: banner.baseColor, patterns: banner.patterns }
    : EMPTY_SPEC;

  async function save(s: BannerSpec) {
    setBusy(true);
    setError(null);
    try {
      const dto = await saveClanBanner(tag, s.baseColor, s.patterns, serverId);
      setBanner(dto);
      toast.success(`Banner saved for ${tag}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove the banner for ${tag}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteClanBanner(tag, serverId);
      setBanner(null);
      toast.success(`Banner removed for ${tag}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (banner === undefined) {
    return <p className="py-8 text-sm text-[var(--text-mute)]">Loading banner…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-2">
        <BannerPreview spec={spec} width={92} framed={false} shape="shield" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
          {banner
            ? `${banner.patterns.length} layer${banner.patterns.length === 1 ? '' : 's'}`
            : 'vanilla shield'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <BannerEditor
          initial={spec}
          onSave={save}
          onRemove={banner ? remove : undefined}
          busy={busy}
          error={error}
        />
      </div>
    </div>
  );
}

/* ───────────────────────── shared bits ───────────────────────── */

function SegControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
        {label}
      </span>
      <div className="inline-flex rounded-[var(--radius-pill)] border border-[var(--rule-strong)] bg-[var(--surface-2)] p-0.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`rounded-[var(--radius-pill)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                active
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                  : 'text-[var(--text-mute)] hover:text-white'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
