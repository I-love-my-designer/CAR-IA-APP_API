// Shared helper for calling the backend API. If an API shared secret is
// configured (localStorage key "car_ia_api_secret"), it is sent in the
// "x-api-key" header to match the server-side API_SHARED_SECRET check.
// To enable: localStorage.setItem("car_ia_api_secret", "<même valeur que API_SHARED_SECRET>")

export function getApiSecret(): string {
  try {
    return window.localStorage.getItem("car_ia_api_secret") || "";
  } catch {
    return "";
  }
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const secret = getApiSecret();
  if (!secret) return fetch(input, init);
  const headers = new Headers(init.headers || {});
  headers.set("x-api-key", secret);
  return fetch(input, { ...init, headers });
}
