const API_BASE = import.meta.env.VITE_API_BASE_URL;
const GATEWAY_TOKEN = import.meta.env.VITE_GATEWAY_TOKEN || "";

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (GATEWAY_TOKEN) {
    headers.set("Authorization", `Bearer ${GATEWAY_TOKEN}`);
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

export { API_BASE };
