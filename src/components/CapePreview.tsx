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
        {label && <p className="mb-1 text-xs text-muted">{label}</p>}
        <div
          className="flex items-center justify-center rounded border border-dashed border-muted/40 bg-black/30 text-xs text-muted"
          style={{ width: displayW, height: displayH }}
        >
          No preview
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && <p className="mb-1 text-xs text-muted">{label}</p>}
      <div
        className="overflow-hidden rounded border border-white/10 bg-[#1e1e1e] shadow-lg"
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
