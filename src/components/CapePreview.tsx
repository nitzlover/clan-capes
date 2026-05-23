'use client';

type Props = {
  url?: string | null;
  base64?: string | null;
  scale?: number;
  width?: number;
  height?: number;
  label?: string;
  /** fill = stretch to box (cape UV); contain = keep aspect */
  fit?: 'fill' | 'contain';
};

export function CapePreview({
  url,
  base64,
  scale = 4,
  width = 64,
  height = 32,
  label,
  fit = 'contain',
}: Props) {
  const src = base64 ? `data:image/png;base64,${base64}` : url;
  const displayW = width * scale;
  const displayH = height * scale;

  if (!src) {
    return (
      <div>
        {label && (
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
            {label}
          </p>
        )}
        <div
          className="flex items-center justify-center border border-dashed border-[var(--rule)] bg-[var(--bg-sink)] font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]"
          style={{ width: displayW, height: displayH }}
        >
          empty
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
          {label}
        </p>
      )}
      <div
        className="overflow-hidden border border-[var(--rule)] bg-[var(--bg-sink)]"
        style={{
          width: displayW,
          height: displayH,
          imageRendering: 'pixelated',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label ?? 'Preview'}
          width={displayW}
          height={displayH}
          className="h-full w-full"
          style={{ imageRendering: 'pixelated', objectFit: fit }}
        />
      </div>
    </div>
  );
}
