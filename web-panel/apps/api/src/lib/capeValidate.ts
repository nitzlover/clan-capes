import sharp from 'sharp';

const ALLOWED = [{ w: 64, h: 32 }, { w: 128, h: 64 }];

export async function validateAndNormalizePng(buffer: Buffer, maxKb: number): Promise<Buffer> {
  if (buffer.length > maxKb * 1024) {
    throw new Error(`File exceeds ${maxKb} KB`);
  }

  const image = sharp(buffer, { failOn: 'error' });
  const meta = await image.metadata();
  if (meta.format !== 'png') {
    throw new Error('Only PNG allowed');
  }

  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const allowed = ALLOWED.some((s) => s.w === w && s.h === h);
  if (!allowed) {
    throw new Error('Cape must be 64x32 or 128x64');
  }

  // Re-encode to strip metadata / malicious chunks
  return image.png({ compressionLevel: 9, force: true }).toBuffer();
}
