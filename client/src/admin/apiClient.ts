export type AdminApiRequest = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export function createAdminApiClient(apiBase: string): AdminApiRequest {
  return async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }

    return body;
  };
}
