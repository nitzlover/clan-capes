import { NextResponse } from 'next/server';
import { pluginHealth } from '@/lib/server/minecraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const h = await pluginHealth();
  return NextResponse.json(h);
}
