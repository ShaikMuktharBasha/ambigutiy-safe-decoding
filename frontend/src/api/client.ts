const STORAGE_KEY = "asid_api_base_url";

export function getCustomApiBase(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
  }
  return (import.meta.env.VITE_API_BASE_URL ?? "").trim();
}

export function setCustomApiBase(url: string): void {
  if (typeof window !== "undefined") {
    const clean = url.trim().replace(/\/+$/, "");
    if (clean) {
      window.localStorage.setItem(STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
}

export function resetCustomApiBase(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function getApiBase(): string {
  const raw = getCustomApiBase().replace(/\/+$/, "");
  if (!raw) return "/api";
  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  return withProtocol.endsWith("/api") ? withProtocol : `${withProtocol}/api`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
  body?: BodyInit;
}

interface ErrorPayload {
  error?: { code?: string; message?: string; details?: unknown };
}

async function send(path: string, options: RequestOptions = {}): Promise<Response> {
  const { json, headers, body, ...rest } = options;
  const baseUrl = getApiBase();
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...rest,
      headers: {
        Accept: "application/json",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
  } catch {
    throw new ApiError(
      `Cannot reach the API at ${baseUrl}. Make sure your FastAPI server is running and accessible.`,
      0,
      "NETWORK_ERROR",
    );
  }
}

async function toError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? ((await response.json().catch(() => null)) as ErrorPayload | null) : null;
  const error = payload?.error;
  if (error?.message) {
    return new ApiError(error.message, response.status, error.code ?? "HTTP_ERROR", error.details);
  }
  if (response.status === 404 && contentType.includes("text/html")) {
    return new ApiError(
      `The API endpoint was not found at ${getApiBase()}. If deployed on Render, please connect your FastAPI backend URL.`,
      404,
      "ENDPOINT_NOT_FOUND",
    );
  }
  if (response.status >= 500) {
    return new ApiError(
      `The API is unavailable (HTTP ${response.status}). Check that the FastAPI server is running.`,
      response.status,
      "API_UNAVAILABLE",
    );
  }
  return new ApiError(`Request failed with HTTP ${response.status}.`, response.status, "HTTP_ERROR");
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function download(path: string): Promise<{ blob: Blob; filename: string }> {
  const response = await send(path, { headers: { Accept: "text/csv" } });
  if (!response.ok) throw await toError(response);
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ?? "export.csv" };
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
