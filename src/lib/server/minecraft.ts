import { MINECRAFT_API_TOKEN, MINECRAFT_API_URL } from './env';

const BASE = () => MINECRAFT_API_URL;
const TOKEN = () => MINECRAFT_API_TOKEN;

export async function pluginHealth(): Promise<{ ok: boolean; latencyMs?: number }> {
  const started = Date.now();
  try {
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch(`${BASE()}/api/health`, { signal: ctl.signal });
    clearTimeout(timeout);
    return { ok: res.ok, latencyMs: Date.now() - started };
  } catch {
    return { ok: false };
  }
}

export async function fetchClan(tag: string) {
  const res = await fetch(`${BASE()}/api/clan/${encodeURIComponent(tag)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Minecraft API error ${res.status}`);
  return res.json();
}

export type PlayerCapeDto = {
  uuid: string;
  clanTag?: string | null;
  capeUrl?: string | null;
  updatedAt?: number;
  updatedBy?: string | null;
};

export async function fetchPlayerCape(uuid: string): Promise<PlayerCapeDto | null> {
  const res = await fetch(`${BASE()}/api/player/${encodeURIComponent(uuid)}`);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Minecraft API error ${res.status}`);
  return res.json() as Promise<PlayerCapeDto>;
}

export async function setClanCape(tag: string, capeUrl: string, actor: string) {
  const res = await fetch(`${BASE()}/api/clan/${encodeURIComponent(tag)}/cape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ClanCapes-Token': TOKEN(),
    },
    body: JSON.stringify({ capeUrl, actor }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Failed ${res.status}`);
  }
  return res.json();
}

export async function deleteClanCape(tag: string) {
  const res = await fetch(`${BASE()}/api/clan/${encodeURIComponent(tag)}/cape`, {
    method: 'DELETE',
    headers: { 'X-ClanCapes-Token': TOKEN() },
  });
  if (!res.ok) throw new Error(`Failed ${res.status}`);
  return res.json();
}

export type PowerClanRow = {
  id: string;
  tag: string;
  leader: string;
  level: number;
};

export async function fetchPowerClans(): Promise<PowerClanRow[]> {
  const res = await fetch(`${BASE()}/api/powerclans/clans`, {
    headers: { 'X-ClanCapes-Token': TOKEN() },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `PowerClans API error ${res.status}`);
  }
  const data = (await res.json()) as { clans: PowerClanRow[] };
  return data.clans ?? [];
}
