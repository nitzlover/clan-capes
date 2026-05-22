const BASE = () => (process.env.MINECRAFT_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const TOKEN = () => process.env.MINECRAFT_API_TOKEN ?? '';

export async function fetchClan(tag: string) {
  const res = await fetch(`${BASE()}/api/clan/${encodeURIComponent(tag)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Minecraft API error ${res.status}`);
  return res.json();
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
