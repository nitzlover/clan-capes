'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UploadSection } from '@/components/UploadSection';
import { PlayerCapeView3D } from '@/components/PlayerCapeView3D';
import { SelectServerPrompt } from '@/components/ServerPicker';
import { api, type ClanRow, getToken, UnauthorizedError } from '@/lib/api';
import { useSelectedServer, serverQueryString } from '@/lib/selected-server';
import { Reveal, Stagger, StaggerItem, CountUp, useDelayedFlag } from '@/components/motion';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';

/**
 * Capes route — clan-cape library + uploader.
 *
 * Layout:
 *   1. KPI strip — total clans, coverage, with/without cape (live CountUp).
 *   2. Cape Studio — the PNG uploader (drag-drop + clan picker + live 3D
 *      preview + diagnostic log). Scrolled to / pre-filled when an operator
 *      hits "Add cape" / "Replace" on a roster card.
 *   3. Roster — searchable, filterable, sortable gallery of every clan and
 *      the cape currently pinned to it. Grid (3D player previews) or list
 *      (texture thumbnails) layout, with per-card Inspect / Replace /
 *      Download / Copy-URL / Delete actions and an Inspect lightbox.
 *
 * Server-scoped: the clan-tag namespace is per-server, so the page demands a
 * single selected server before it will upload or list (audit H3).
 */

type FilterMode = 'all' | 'with' | 'missing';
type SortMode = 'recent' | 'az' | 'missing';
type LayoutMode = 'grid' | 'list';

/** Relative "Nm ago" from an epoch-ms stamp; empty when unknown. */
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

/** Filename out of a cape URL, sans cache-buster query. */
function capeFilename(url: string): string {
  return url.split('?')[0].split('/').pop() ?? url;
}

/** Strip the `admin:` / `leader:` prefix the audit actor carries. */
function shortActor(actor?: string): string {
  if (!actor) return '';
  const i = actor.indexOf(':');
  return i >= 0 ? actor.slice(i + 1) : actor;
}

export default function CapesPage() {
  const { value: serverId } = useSelectedServer();
  const toast = useToast();

  const [clans, setClans] = useState<ClanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedFlag(loading, 200);

  // Cape Studio (uploader) state — lifted here so a roster card can pre-fill
  // the clan picker by setting `tag`.
  const [tag, setTag] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [optionsRefresh, setOptionsRefresh] = useState(0);
  const studioRef = useRef<HTMLDivElement>(null);

  // Roster controls.
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('recent');
  const [layout, setLayout] = useState<LayoutMode>('grid');
  const [inspect, setInspect] = useState<ClanRow | null>(null);

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedQuery(query.trim().toUpperCase()), 150);
    return () => window.clearTimeout(h);
  }, [query]);

  const load = useCallback(async () => {
    if (serverId === null || serverId === 'all') {
      setClans([]);
      setLoading(false);
      return;
    }
    try {
      const c = await api<{ clans: ClanRow[] }>(`/panel/clans${serverQueryString(serverId)}`);
      setClans(c.clans);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setClans([]);
    }
    setLoading(false);
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── stats ──
  const total = clans.length;
  const withCape = useMemo(() => clans.filter((c) => c.capeUrl).length, [clans]);
  const missing = total - withCape;
  const coverage = total ? Math.round((withCape / total) * 100) : 0;

  // ── filtered + sorted roster ──
  const visible = useMemo(() => {
    let list = clans;
    if (debouncedQuery) list = list.filter((c) => c.tag.includes(debouncedQuery));
    if (filter === 'with') list = list.filter((c) => c.capeUrl);
    else if (filter === 'missing') list = list.filter((c) => !c.capeUrl);
    const sorted = [...list];
    if (sort === 'az') {
      sorted.sort((a, b) => a.tag.localeCompare(b.tag));
    } else if (sort === 'missing') {
      sorted.sort((a, b) => Number(!!a.capeUrl) - Number(!!b.capeUrl) || a.tag.localeCompare(b.tag));
    } else {
      // recent — newest cape first, no-cape rows sink to the bottom
      sorted.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    return sorted;
  }, [clans, debouncedQuery, filter, sort]);

  async function uploadPng(e: React.FormEvent) {
    e.preventDefault();
    if (!tag || !file) return;
    if (serverId === null || serverId === 'all') {
      setMessage('Pick a single server before uploading a cape.');
      return;
    }
    setMessage('');
    const fd = new FormData();
    fd.append('cape', file);
    const token = getToken();
    const res = await fetch(
      `/api/panel/clans/${tag.toUpperCase()}/cape${serverQueryString(serverId)}`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const text = (err as { error?: string }).error ?? 'Upload failed';
      setMessage(text);
      toast.error(text);
      return;
    }
    setMessage('PNG cape uploaded');
    toast.success(`Cape pinned to ${tag.toUpperCase()}`);
    setTag('');
    setFile(null);
    setOptionsRefresh((n) => n + 1);
    load();
  }

  async function removeCape(clanTag: string) {
    if (serverId === null || serverId === 'all') {
      toast.error('Pick a single server to remove a cape.');
      return;
    }
    if (!confirm(`Remove the cape pinned to ${clanTag}?`)) return;
    try {
      await api(`/panel/clans/${clanTag}/cape${serverQueryString(serverId)}`, {
        method: 'DELETE',
      });
      toast.success(`Removed cape for ${clanTag}`);
      setInspect((cur) => (cur?.tag === clanTag ? null : cur));
      load();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function pickForStudio(clanTag: string) {
    setTag(clanTag);
    setInspect(null);
    toast.info(`Cape Studio ready — drop a PNG for ${clanTag}`);
    requestAnimationFrame(() =>
      studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  function downloadCape(c: ClanRow) {
    const a = document.createElement('a');
    a.href = c.capeUrl;
    a.download = `${c.tag}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copyUrl(c: ClanRow) {
    const url = c.capeUrl.startsWith('/') ? `${location.origin}${c.capeUrl}` : c.capeUrl;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Copied ${c.tag} cape URL`);
    } catch {
      toast.error('Clipboard blocked by the browser');
    }
  }

  // No-selection / aggregate empty-state — show the prompt so the operator
  // can't accidentally target the wrong server (audit H3).
  if (serverId === null || serverId === 'all') {
    return (
      <div>
        <div className="page-band">
          <div>
            <h1 className="page-title">Capes</h1>
            <p className="page-subtitle">
              Upload a 64×32 (or 128×64) PNG and pin it to a clan tag.
            </p>
          </div>
        </div>
        <SelectServerPrompt>
          <p className="text-sm text-[var(--text-faint)]">
            Cape uploads are server-scoped — the clan tag namespace is
            per-server, so this page needs you to pick one.
          </p>
        </SelectServerPrompt>
      </div>
    );
  }

  return (
    <div>
      <div className="page-band">
        <div>
          <h1 className="page-title">Capes</h1>
          <p className="page-subtitle">
            Upload a 64×32 (or 128×64) PNG and pin it to a clan tag — the Fabric
            mod renders it on every member.
          </p>
        </div>
        <span className="meta-tag">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            checkroom
          </span>
          {coverage}% covered
        </span>
      </div>

      {/* ── KPI strip ── */}
      <Reveal>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Clans" value={total} icon="groups" />
          <StatCard label="With cape" value={withCape} icon="check_circle" accent />
          <StatCard label="Missing" value={missing} icon="report" />
          <StatCard label="Coverage" value={coverage} suffix="%" bar={coverage} icon="donut_large" />
        </div>
      </Reveal>

      {/* ── Cape Studio (uploader) ── */}
      <div ref={studioRef} className="mt-10 scroll-mt-6">
        <UploadSection
          tag={tag}
          onTagChange={setTag}
          file={file}
          onFileChange={setFile}
          pngPreview={preview}
          onPngUpload={uploadPng}
          message={message}
          optionsRefresh={optionsRefresh}
          serverId={typeof serverId === 'number' ? serverId : null}
        />
      </div>

      {/* ── Roster ── */}
      <section className="mt-14">
        <div className="chapter-head mb-5 border-b border-[var(--rule)] pb-4">
          <h2 className="font-sans text-2xl font-extrabold uppercase tracking-tight text-white">
            Roster
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            {debouncedQuery || filter !== 'all'
              ? `${visible.length}/${total}`
              : `${withCape} of ${total} with cape`}
          </span>
        </div>

        {/* toolbar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="input-group min-w-[200px] flex-1">
            <span className="material-symbols-outlined icon" style={{ fontSize: 18 }}>
              search
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clan tag…"
              aria-label="Search clan tag"
              className="input h-9 font-mono text-[11px] uppercase tracking-[0.16em]"
            />
          </div>

          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as FilterMode)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'with', label: 'Caped' },
              { value: 'missing', label: 'Missing' },
            ]}
          />

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            aria-label="Sort roster"
            className="input h-9 w-auto font-mono text-[11px] uppercase tracking-[0.16em]"
          >
            <option value="recent">Recent</option>
            <option value="az">A–Z</option>
            <option value="missing">Missing first</option>
          </select>

          <Segmented
            value={layout}
            onChange={(v) => setLayout(v as LayoutMode)}
            options={[
              { value: 'grid', icon: 'grid_view', label: 'Grid' },
              { value: 'list', icon: 'view_list', label: 'List' },
            ]}
            iconOnly
          />
        </div>

        {showSkeleton ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="brutal-card p-4" aria-hidden>
                <Skeleton className="h-[160px] w-full" rounded="md" />
                <Skeleton className="mt-4 h-4 w-20" rounded="sm" />
                <Skeleton className="mt-2 h-2.5 w-28" rounded="sm" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--text-mute)]">
            No clans on this server yet. Leaders create them in-game via{' '}
            <code className="text-[var(--text-soft)]">/clan create</code>.
          </p>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
              No clans match these filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
              className="mt-3 btn-ghost"
            >
              Clear filters
            </button>
          </div>
        ) : layout === 'grid' ? (
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((c) => (
              <StaggerItem key={c.tag}>
                <CapeCardGrid
                  clan={c}
                  onInspect={() => setInspect(c)}
                  onStudio={() => pickForStudio(c.tag)}
                  onDownload={() => downloadCape(c)}
                  onCopy={() => copyUrl(c)}
                  onDelete={() => removeCape(c.tag)}
                />
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <Stagger className="flex flex-col gap-2">
            {visible.map((c) => (
              <StaggerItem key={c.tag}>
                <CapeRow
                  clan={c}
                  onInspect={() => setInspect(c)}
                  onStudio={() => pickForStudio(c.tag)}
                  onDownload={() => downloadCape(c)}
                  onCopy={() => copyUrl(c)}
                  onDelete={() => removeCape(c.tag)}
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {inspect && (
        <InspectModal
          clan={inspect}
          onClose={() => setInspect(null)}
          onStudio={() => pickForStudio(inspect.tag)}
          onDownload={() => downloadCape(inspect)}
          onCopy={() => copyUrl(inspect)}
          onDelete={() => removeCape(inspect.tag)}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── KPI card ───────────────────────────── */

function StatCard({
  label,
  value,
  suffix,
  accent,
  bar,
  icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
  bar?: number;
  icon?: string;
}) {
  return (
    <div className="brutal-card p-4">
      <div className="flex items-center justify-between">
        <p className="label-mono">{label}</p>
        {icon && (
          <span
            className="material-symbols-outlined text-[var(--text-faint)]"
            style={{ fontSize: 16 }}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={`mt-2 font-sans text-3xl font-extrabold tabular ${
          accent ? 'text-[var(--accent)]' : 'text-white'
        }`}
      >
        <CountUp value={value} />
        {suffix}
      </p>
      {typeof bar === 'number' && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
            style={{ width: `${bar}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Segmented toggle ─────────────────────────── */

function Segmented({
  value,
  onChange,
  options,
  iconOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; icon?: string }>;
  iconOnly?: boolean;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-pill)] border border-[var(--rule-strong)] bg-[var(--surface-2)] p-0.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            title={o.label}
            aria-label={o.label}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
              active
                ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                : 'text-[var(--text-mute)] hover:text-white'
            }`}
          >
            {o.icon && (
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                {o.icon}
              </span>
            )}
            {!iconOnly && o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Icon button ───────────────────────────── */

function IconBtn({
  icon,
  title,
  onClick,
  tone,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  tone?: 'accent' | 'danger';
}) {
  const hover =
    tone === 'danger'
      ? 'hover:border-[var(--danger)] hover:text-[var(--danger)]'
      : tone === 'accent'
        ? 'hover:border-[var(--accent-line)] hover:text-[var(--accent)]'
        : 'hover:border-[var(--rule-strong)] hover:text-white';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--rule)] bg-[var(--surface-1)] text-[var(--text-mute)] transition-colors ${hover}`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
        {icon}
      </span>
    </button>
  );
}

/* ───────────────────────── Cape status line ───────────────────────── */

function StatusLine({ clan }: { clan: ClanRow }) {
  if (!clan.capeUrl) {
    return (
      <span className="mt-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
        <span className="status-dot" />
        no cape
      </span>
    );
  }
  return (
    <span className="mt-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent-bright)]">
      <span className="status-dot" style={{ background: 'var(--accent)' }} />
      cape set
    </span>
  );
}

function MetaLine({ clan }: { clan: ClanRow }) {
  if (!clan.capeUrl) return null;
  const when = relTime(clan.updatedAt);
  const who = shortActor(clan.updatedBy);
  return (
    <p className="mt-2 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
      {capeFilename(clan.capeUrl)}
      {when && ` · ${when}`}
      {who && ` · ${who}`}
    </p>
  );
}

/* ───────────────────────────── Grid card ───────────────────────────── */

function CapeCardGrid({
  clan,
  onInspect,
  onStudio,
  onDownload,
  onCopy,
  onDelete,
}: {
  clan: ClanRow;
  onInspect: () => void;
  onStudio: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const has = !!clan.capeUrl;
  return (
    <div
      className={`brutal-card group flex h-full flex-col overflow-hidden ${
        has ? '' : 'border-dashed !border-[var(--accent-line)]'
      }`}
    >
      <button
        type="button"
        onClick={has ? onInspect : onStudio}
        className="relative flex items-center justify-center bg-black py-4"
        title={has ? 'Inspect cape' : 'Add a cape'}
      >
        {has ? (
          <PlayerCapeView3D
            capeUrl={clan.capeUrl}
            width={110}
            height={160}
            view="back"
            zoom={0.7}
            interactive={false}
          />
        ) : (
          <div className="flex h-[160px] w-[110px] flex-col items-center justify-center gap-2 text-[var(--text-faint)]">
            <span className="material-symbols-outlined" style={{ fontSize: 30 }}>
              add_photo_alternate
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em]">empty</span>
          </div>
        )}
        {has && (
          <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 border border-[var(--rule-strong)] bg-black/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-soft)] opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
              zoom_in
            </span>
            inspect
          </span>
        )}
      </button>

      <div className="border-t border-[var(--rule)] p-4">
        <div className="font-sans text-lg font-extrabold uppercase tracking-wider text-white">
          {clan.tag}
        </div>
        <StatusLine clan={clan} />
        <MetaLine clan={clan} />
      </div>

      <div className="mt-auto flex items-center gap-1.5 border-t border-[var(--rule)] px-3 py-2.5">
        {has ? (
          <>
            <IconBtn icon="zoom_in" title="Inspect" onClick={onInspect} />
            <IconBtn icon="swap_horiz" title="Replace cape" onClick={onStudio} tone="accent" />
            <IconBtn icon="download" title="Download PNG" onClick={onDownload} />
            <IconBtn icon="link" title="Copy URL" onClick={onCopy} />
            <span className="flex-1" />
            <IconBtn icon="delete" title="Remove cape" onClick={onDelete} tone="danger" />
          </>
        ) : (
          <button type="button" onClick={onStudio} className="btn-accent w-full py-1.5 text-[13px]">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              upload
            </span>
            Add cape
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── List row ───────────────────────────── */

function CapeRow({
  clan,
  onInspect,
  onStudio,
  onDownload,
  onCopy,
  onDelete,
}: {
  clan: ClanRow;
  onInspect: () => void;
  onStudio: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const has = !!clan.capeUrl;
  return (
    <div
      className={`brutal-card flex items-center gap-4 p-3 ${
        has ? '' : 'border-dashed !border-[var(--accent-line)]'
      }`}
    >
      <button
        type="button"
        onClick={has ? onInspect : onStudio}
        title={has ? 'Inspect cape' : 'Add a cape'}
        className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--rule)] bg-black"
      >
        {has ? (
          // Raw texture thumbnail — keeps the dense list off the WebGL
          // context budget (3D previews are grid-only).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clan.capeUrl}
            alt=""
            className="h-10 w-[72px] object-cover [image-rendering:pixelated]"
          />
        ) : (
          <span className="material-symbols-outlined text-[var(--text-faint)]" style={{ fontSize: 18 }}>
            add_photo_alternate
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-sans text-base font-extrabold uppercase tracking-wider text-white">
            {clan.tag}
          </span>
          {has ? (
            <span className="status-dot" style={{ background: 'var(--accent)' }} />
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
              · no cape
            </span>
          )}
        </div>
        {has && (
          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
            {capeFilename(clan.capeUrl)}
            {relTime(clan.updatedAt) && ` · ${relTime(clan.updatedAt)}`}
            {shortActor(clan.updatedBy) && ` · ${shortActor(clan.updatedBy)}`}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {has ? (
          <>
            <IconBtn icon="zoom_in" title="Inspect" onClick={onInspect} />
            <IconBtn icon="swap_horiz" title="Replace cape" onClick={onStudio} tone="accent" />
            <IconBtn icon="download" title="Download PNG" onClick={onDownload} />
            <IconBtn icon="link" title="Copy URL" onClick={onCopy} />
            <IconBtn icon="delete" title="Remove cape" onClick={onDelete} tone="danger" />
          </>
        ) : (
          <button type="button" onClick={onStudio} className="btn-accent py-1.5 text-[13px]">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              upload
            </span>
            Add cape
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Inspect modal ─────────────────────────── */

function InspectModal({
  clan,
  onClose,
  onStudio,
  onDownload,
  onCopy,
  onDelete,
}: {
  clan: ClanRow;
  onClose: () => void;
  onStudio: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Cape for ${clan.tag}`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <div className="brutal-card relative z-10 grid max-h-[90vh] w-full max-w-3xl grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_320px]">
        {/* 3D viewer */}
        <div className="relative flex min-h-[420px] items-center justify-center bg-black">
          <PlayerCapeView3D
            capeUrl={clan.capeUrl}
            width={340}
            height={460}
            view="back"
            interactive={false}
          />
          <div className="pointer-events-none absolute bottom-4 left-4 inline-flex items-center gap-2 border border-[var(--rule-strong)] bg-[var(--bg-raise)]/85 px-2.5 py-1 backdrop-blur-sm">
            <span className="status-dot" style={{ background: 'var(--accent)' }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
              back view
            </span>
          </div>
        </div>

        {/* info + actions */}
        <div className="flex flex-col border-t border-[var(--rule)] bg-[var(--bg-raise)] md:border-l md:border-t-0">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--rule)] px-5 py-4">
            <div>
              <p className="label-mono">Clan cape</p>
              <h3 className="mt-1 font-sans text-2xl font-extrabold uppercase tracking-wider text-white">
                {clan.tag}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="font-mono text-sm text-[var(--text-mute)] hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div>
              <p className="label-mono mb-2">Texture</p>
              <div className="inline-block border border-[var(--rule-strong)] bg-black p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={clan.capeUrl}
                  alt={`${clan.tag} cape texture`}
                  className="block [image-rendering:pixelated]"
                  style={{ width: 256, height: 128 }}
                />
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[11px]">
              <dt className="text-[var(--text-faint)]">File</dt>
              <dd className="truncate text-[var(--text-soft)]">{capeFilename(clan.capeUrl)}</dd>
              {clan.updatedAt > 0 && (
                <>
                  <dt className="text-[var(--text-faint)]">Updated</dt>
                  <dd className="text-[var(--text-soft)]" title={new Date(clan.updatedAt).toLocaleString()}>
                    {relTime(clan.updatedAt)}
                  </dd>
                </>
              )}
              {shortActor(clan.updatedBy) && (
                <>
                  <dt className="text-[var(--text-faint)]">By</dt>
                  <dd className="truncate text-[var(--text-soft)]">{shortActor(clan.updatedBy)}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="mt-auto flex flex-wrap gap-2 border-t border-[var(--rule)] px-5 py-4">
            <button type="button" onClick={onStudio} className="btn-primary text-[13px]">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                swap_horiz
              </span>
              Replace
            </button>
            <button type="button" onClick={onDownload} className="btn-ghost text-[13px]">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                download
              </span>
              PNG
            </button>
            <button type="button" onClick={onCopy} className="btn-ghost text-[13px]">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                link
              </span>
              URL
            </button>
            <span className="flex-1" />
            <button type="button" onClick={onDelete} className="btn-danger-link self-center">
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

