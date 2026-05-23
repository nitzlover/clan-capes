'use client';

import { useState } from 'react';
import { fileToBannerSpec } from '@/lib/imageToBanner';
import type { BannerSpec } from '@/lib/banners';
import { BannerPreview } from '@/components/BannerPreview';

type Props = {
  /** Called when the user accepts the converted banner — parent loads it
   *  into the editor state so they can tweak/save. */
  onAccept: (spec: BannerSpec) => void;
  /** Disable everything while a parent operation is in flight. */
  busy?: boolean;
};

/**
 * Drop-in card that converts an uploaded image into a vanilla banner
 * spec. The conversion runs entirely client-side (see
 * `lib/imageToBanner.ts`) — no server round trip, no external API.
 *
 * The card is deliberately self-contained — drop it next to the
 * BannerEditor and the admin can iterate: upload, see preview, click
 * "Use as banner" to load into the editor, hit Save in the editor.
 */
export function ImageToBannerCard({ onAccept, busy }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [spec, setSpec] = useState<BannerSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [layers, setLayers] = useState(6);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    setSpec(null);
    setPreviewUrl(URL.createObjectURL(file));
    setRunning(true);
    try {
      const converted = await fileToBannerSpec(file, layers);
      setSpec(converted);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'image conversion failed');
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setPreviewUrl(null);
    setSpec(null);
    setError(null);
  }

  const disabled = busy || running;

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="label-mono">Image → banner</p>
          <p className="mt-1 font-mono text-[11px] text-white/40">
            Upload any PNG/JPG. The converter downscales it to 20×40 and
            picks the best base colour + up to {layers} pattern layers.
          </p>
        </div>
        <label className="flex items-center gap-2 font-mono text-[11px] text-white/60">
          layers
          <input
            type="number"
            min={1}
            max={6}
            value={layers}
            disabled={disabled}
            onChange={(e) => setLayers(Math.max(1, Math.min(6, Number(e.target.value) || 6)))}
            className="w-12 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-center"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="space-y-2">
          <label
            className={`block cursor-pointer rounded-md border border-dashed border-white/20 bg-black/30 px-4 py-3 text-center text-xs uppercase tracking-[0.18em] text-white/60 hover:border-white/40 hover:text-white ${
              disabled ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            {running ? 'Converting…' : previewUrl ? 'Replace image' : 'Upload image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              disabled={disabled}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
          {previewUrl && (
            <div className="flex flex-col items-center gap-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                source
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt=""
                className="h-20 w-20 rounded border border-white/10 object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          )}
        </div>

        {spec && (
          <div className="flex flex-col items-center gap-2">
            <BannerPreview spec={spec} width={80} label="Converted" />
            <p className="font-mono text-[10px] text-white/50">
              {spec.patterns.length} layer{spec.patterns.length === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onAccept(spec)}
                disabled={disabled}
                className="btn-primary text-xs"
              >
                Use as banner
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={disabled}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70 hover:text-white"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {error && (
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-300">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
