const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function getApiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(getApiUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}
