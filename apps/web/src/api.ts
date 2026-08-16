export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers, credentials: "same-origin" });
  const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
  if (!response.ok) throw new ApiClientError(body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "请求失败", response.status);
  return body as T;
}
