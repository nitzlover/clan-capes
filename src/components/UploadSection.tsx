'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { PlayerCapeView3D } from '@/components/PlayerCapeView3D';
import { ClanSelect } from '@/components/ClanSelect';
import { fetchClanOptions, type ClanOption } from '@/lib/api';

const TEMPLATE_URL = '/templates/template_64x32.png';

type LogKind = 'sys' | 'ok' | 'err';
type LogEntry = { kind: LogKind; message: string };

const INITIAL_LOG: LogEntry[] = [
  { kind: 'sys', message: 'Awaiting file input.' },
  {
    kind: 'sys',
    message: 'Validation rules: dims(64×32 or 128×64), format(PNG), size(≤512 KB).',
  },
];

type Props = {
  tag: string;
  onTagChange: (tag: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  pngPreview: string | null;
  onPngUpload: (e: FormEvent) => void;
  message: string;
  /** Increment to reload PowerClans list (e.g. after upload). */
  optionsRefresh?: number;
  /** Selected server scope — the clan dropdown is server-specific. */
  serverId?: number | null;
};

/**
 * Cape Studio.
 *
 * Two-pane brutalist surface:
 *   - Left: clan picker + drag-and-drop zone + diagnostic log + footer
 *     (Cancel / Deploy). The log replays every file event as a small
 *     terminal-style feed — [SYS] for system status, [OK] for passing
 *     validation lines, [ERR] for failures. Same idiom as the mockup
 *     but flattened to B&W per project memory.
 *   - Right: live 3D player wearing the prospective cape, with a
 *     "Live preview" overlay top-left. The existing Cape/Elytra and
 *     Stand/Fly toggles inside PlayerCapeView3D appear top-right.
 *
 * Deploy is the form's submit; the parent owns the actual fetch. We
 * surface the parent's `message` prop into the log so success/error
 * text shows up inline instead of as a stray paragraph below.
 */
export function UploadSection({
  tag,
  onTagChange,
  file,
  onFileChange,
  pngPreview,
  onPngUpload,
  message,
  optionsRefresh = 0,
  serverId = null,
}: Props) {
  const [clanOptions, setClanOptions] = useState<ClanOption[]>([]);
  const [optionsStatus, setOptionsStatus] = useState<'loading' | 'ok' | 'error'>(
    'loading',
  );
  const [optionsError, setOptionsError] = useState('');
  const [log, setLog] = useState<LogEntry[]>(INITIAL_LOG);
  const [dimsValid, setDimsValid] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // 3D preview controls live here (lifted out of PlayerCapeView3D) so
  // we can render the toggle pills wherever the surrounding layout
  // wants — in this case, top-right of the outer pane.
  const [backEquipment, setBackEquipment] = useState<BackEquipment>('cape');
  const [stance, setStance] = useState<StanceMode>('stand');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load clan list — reloads when optionsRefresh increments after a
  // successful upload so the "cape set" badges stay accurate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOptionsStatus('loading');
      setOptionsError('');
      try {
        const res = await fetchClanOptions(serverId);
        if (cancelled) return;
        setClanOptions(res.clans);
        setOptionsStatus('ok');
      } catch (e) {
        if (cancelled) return;
        setOptionsStatus('error');
        setOptionsError(e instanceof Error ? e.message : 'Failed to load clans');
        setClanOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [optionsRefresh, serverId]);

  // Validate the new file: decode its dimensions, push the result rows
  // into the log feed, gate the Deploy button. The Image() decode is
  // async so dimsValid flips a moment after the file arrives.
  useEffect(() => {
    if (!file) {
      setLog(INITIAL_LOG);
      setDimsValid(false);
      return;
    }
    setLog((l) => [
      ...l,
      { kind: 'sys', message: `Reading ${file.name}…` },
    ]);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dimsOk =
        (img.width === 64 && img.height === 32) ||
        (img.width === 128 && img.height === 64);
      const sizeKb = Math.round(file.size / 1024);
      const sizeOk = sizeKb <= 512;
      setLog((l) => [
        ...l,
        { kind: 'ok', message: 'Format: PNG' },
        {
          kind: dimsOk ? 'ok' : 'err',
          message: `Dimensions: ${img.width}×${img.height}${dimsOk ? '' : ' (need 64×32 or 128×64)'}`,
        },
        { kind: sizeOk ? 'ok' : 'err', message: `Size: ${sizeKb} KB` },
      ]);
      setDimsValid(dimsOk && sizeOk);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setLog((l) => [...l, { kind: 'err', message: 'Could not decode PNG.' }]);
      setDimsValid(false);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [file]);

  // Mirror the parent's message into the log so the user can see the
  // server's verdict alongside the local validation.
  useEffect(() => {
    if (!message) return;
    const isErr = /fail|error|invalid|bad|forbidden|denied/i.test(message);
    setLog((l) => [
      ...l,
      { kind: isErr ? 'err' : 'ok', message },
    ]);
  }, [message]);

  const canDeploy =
    !!file && !!tag.trim() && dimsValid && optionsStatus === 'ok';

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (f.type !== 'image/png') {
      setLog((l) => [
        ...l,
        { kind: 'err', message: `Rejected ${f.name}: not a PNG.` },
      ]);
      return;
    }
    onFileChange(f);
  }
  function onDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function cancelFile() {
    onFileChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <form
      onSubmit={onPngUpload}
      className="grid grid-cols-1 brutal-card is-flat lg:grid-cols-2"
    >
      {/* LEFT — controls */}
      <div className="flex flex-col bg-[var(--bg)]">
        {/* Header strip. */}
        <div className="flex items-center justify-between gap-4 border-b-2 border-[var(--rule-strong)] bg-[var(--bg-raise)] px-6 py-5">
          <div>
            <p className="label-mono">Cape Studio</p>
            <h3 className="mt-1 font-sans text-xl font-extrabold uppercase tracking-tight text-white">
              Upload PNG
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`status-dot ${file && dimsValid ? 'bg-white' : ''}`}
              aria-hidden
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
              {!file ? 'Awaiting' : dimsValid ? 'Ready' : 'Invalid'}
            </span>
          </div>
        </div>

        {/* Clan picker. */}
        <div className="px-6 pt-6">
          <p className="label-mono mb-2">Clan</p>
          <ClanSelect
            value={tag}
            options={clanOptions}
            disabled={optionsStatus !== 'ok'}
            onChange={onTagChange}
          />
          {optionsStatus === 'error' && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white">
              ! {optionsError}
            </p>
          )}
        </div>

        {/* Dropzone — click anywhere to open the file picker, or drop a
            PNG to set the file. Square area, dashed border that solidifies
            on hover and drag-over. */}
        <div className="flex flex-1 items-center justify-center px-6 py-6">
          <label
            htmlFor="upload-file"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={() => setDragOver(false)}
            onDragEnd={() => setDragOver(false)}
            className={`group flex aspect-square w-full max-w-[300px] cursor-pointer flex-col items-center justify-center border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? 'border-white bg-white/[0.06]'
                : 'border-[var(--rule-strong)] hover:border-white hover:bg-white/[0.02]'
            }`}
          >
            <span
              className="material-symbols-outlined mb-4 text-[var(--text-mute)] group-hover:text-white"
              style={{ fontSize: 36 }}
            >
              upload_file
            </span>
            <p className="font-sans text-base font-extrabold uppercase tracking-widest text-white">
              {file ? 'Replace PNG' : 'Drop PNG'}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <span className="border border-[var(--rule-strong)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
                64×32 / 128×64
              </span>
              <span className="border border-[var(--rule-strong)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
                PNG
              </span>
            </div>
            {file && (
              <p className="mt-4 max-w-full truncate font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-soft)]">
                {file.name}
              </p>
            )}
            <input
              ref={fileInputRef}
              id="upload-file"
              type="file"
              accept="image/png"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
        </div>

        <p className="px-6 pb-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
          Template ·{' '}
          <a
            href={TEMPLATE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--text-mute)] underline-offset-4 hover:text-white hover:underline"
          >
            template_64x32.png
          </a>
        </p>

        {/* Diagnostic log. */}
        <div className="border-t-2 border-[var(--rule-strong)] bg-[var(--bg-raise)]">
          <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
              Diagnostic log
            </span>
            <span
              className="material-symbols-outlined text-[var(--text-mute)]"
              style={{ fontSize: 14 }}
            >
              terminal
            </span>
          </div>
          <ul className="max-h-44 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
            {log.map((entry, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className={`w-12 shrink-0 ${
                    entry.kind === 'sys'
                      ? 'text-[var(--text-faint)]'
                      : 'text-white'
                  }`}
                >
                  {entry.kind === 'ok'
                    ? '[OK]'
                    : entry.kind === 'err'
                      ? '[ERR]'
                      : '[SYS]'}
                </span>
                <span
                  className={
                    entry.kind === 'err'
                      ? 'text-white'
                      : entry.kind === 'ok'
                        ? 'text-[var(--text-soft)]'
                        : 'text-[var(--text-mute)]'
                  }
                >
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer actions. */}
        <div className="flex flex-wrap justify-end gap-3 border-t-2 border-[var(--rule-strong)] bg-[var(--bg)] px-6 py-4">
          <button
            type="button"
            onClick={cancelFile}
            disabled={!file}
            className="btn-ghost disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canDeploy}
            className="btn-primary disabled:opacity-30"
          >
            Deploy
          </button>
        </div>
      </div>

      {/* RIGHT — 3D preview pane. */}
      <div className="relative flex min-h-[460px] items-center justify-center border-t-2 border-[var(--rule-strong)] bg-black lg:border-l-2 lg:border-t-0">
        <PlayerCapeView3D
          capeUrl={pngPreview}
          width={340}
          height={460}
          view="back"
          backEquipment={backEquipment}
          stance={stance}
        />
        {/* Cape/Elytra + Stand/Fly toggles — pinned to the outer right
            corner of this pane, not floating on top of the canvas the
            way they used to. */}
        <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-2">
          <PaneToggle
            value={backEquipment}
            onChange={(v) => setBackEquipment(v as BackEquipment)}
            options={[
              { value: 'cape', label: 'Cape' },
              { value: 'elytra', label: 'Elytra' },
            ]}
          />
          <PaneToggle
            value={stance}
            onChange={(v) => setStance(v as StanceMode)}
            options={[
              { value: 'stand', label: 'Stand' },
              { value: 'fly', label: 'Fly' },
            ]}
          />
        </div>
        {/* Top-left status pill. */}
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 border border-[var(--rule-strong)] bg-[var(--bg-raise)]/85 px-2.5 py-1 backdrop-blur-sm">
          <span
            className={`status-dot ${pngPreview ? 'bg-white' : ''}`}
            aria-hidden
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white">
            Live preview
          </span>
        </div>
        {/* Bottom hint. */}
        <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 border border-[var(--rule-strong)] bg-[var(--bg-raise)]/85 px-2.5 py-1 backdrop-blur-sm">
          <span
            className="material-symbols-outlined text-[var(--text-mute)]"
            style={{ fontSize: 14 }}
          >
            360
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
            Drag to rotate
          </span>
        </div>
      </div>
    </form>
  );
}

type BackEquipment = 'cape' | 'elytra';
type StanceMode = 'stand' | 'fly';

/**
 * Two-segment pill toggle, monochrome, sized to sit on top of the
 * dark right pane without competing with the player. Same shape as
 * the toggles that used to live inside PlayerCapeView3D — moved up
 * here so we can pin them to the outer pane corner with the rest of
 * the overlay chrome (status pill, drag hint), instead of inside the
 * canvas's bounding box.
 */
function PaneToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="pointer-events-auto inline-flex border border-[var(--rule-strong)] bg-black/65 backdrop-blur-sm">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
              active ? 'bg-white text-black' : 'text-white/70 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
