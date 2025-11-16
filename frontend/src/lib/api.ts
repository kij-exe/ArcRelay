// Normalize backend base URL and ensure no trailing slash to avoid '//' in requests
const RAW_API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000/api";
const API_BASE = RAW_API_BASE.replace(/\/+$/, "");

interface ApiOptions extends RequestInit {
  token?: string | null;
}

export async function apiFetch<T>(
  path: string,
  { token, headers, ...options }: ApiOptions = {}
): Promise<T> {
  // Ensure path starts with a single leading slash
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE}${normalizedPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    let message = "Request failed";
    try {
      const data = await res.json();
      message = data.error || JSON.stringify(data);
    } catch {
      message = res.statusText || message;
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
}

