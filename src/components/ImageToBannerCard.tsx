'use client';

import { useState } from 'react';
import { fileToBannerSpec } from '@/lib/imageToBanner';
import type { BannerSpec } from '@/lib/banners';
import { BannerPreview } from '@/components/BannerPreview';

type Props = {
  onAccept: (spec: BannerSpec) => void;
  busy?: boolean;
};

/**
 * Image-to-banner card — monochrome modern.
 *
 * Three columns: upload dropzone, source thumbnail, converted preview +
 * accept. No card chrome; the parent provides the rule + eyebrow already.
 * Layers count is a small inline numeric input so admins can dial 1..6.
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
    <div>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="eyebrow">Image → banner</p>
          <p className="mt-2 max-w-md font-mono text-[11px] text-[var(--text-faint)]">
            Upload any PNG/JPG. The converter downscales to 20×40 and picks
            the best base colour + up to {layers} pattern layers.
          </p>
        </div>
        <label className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-mute)]">
          Layers
          <input
            type="number"
            min={1}
            max={6}
            value={layers}
            disabled={disabled}
            onChange={(e) =>
              setLayers(Math.max(1, Math.min(6, Number(e.target.value) || 6)))
            }
            className="w-14 border border-[var(--rule)] bg-transparent px-2 py-1 text-center text-white tabular focus:outline-none focus:border-white"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
        <label
          className={`flex h-32 flex-col items-center justify-center border border-dashed border-[var(--rule-strong)] text-center transition-colors hover:border-white hover:text-white ${
            disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'
          }`}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-mute)]">
            {running ? 'Converting…' : previewUrl ? 'Replace image' : 'Upload image'}
          </span>
          <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
            png · jpg · gif · webp
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            disabled={disabled}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Source
          </p>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="h-32 w-full border border-[var(--rule)] object-contain bg-[var(--bg-sink)]"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <div className="flex h-32 items-center justify-center border border-[var(--rule)] font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
              empty
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Converted
          </p>
          {spec ? (
            <div className="flex items-start gap-4">
              <BannerPreview spec={spec} width={70} framed={false} shape="shield" />
              <div className="flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-mute)]">
                  {spec.patterns.length} layer
                  {spec.patterns.length === 1 ? '' : 's'}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onAccept(spec)}
                    disabled={disabled}
                    className="btn-primary"
                  >
                    Use as banner
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={disabled}
                    className="btn-ghost"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center border border-[var(--rule)] font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
              {running ? 'working…' : 'no result'}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.22em] text-white">
          ! {error}
        </p>
      )}
    </div>
  );
}
