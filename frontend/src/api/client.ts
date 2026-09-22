export const DEFAULT_API_BASE = "https://asid-backend.onrender.com";
const STORAGE_KEY = "asid_api_base_url";

export function normalizeBackendUrl(raw: string): string {
  let clean = raw.trim().replace(/\/+$/, "").replace(/\/api$/, "");
  if (!clean) return "";

  // Strip protocol temporarily to check hostname structure
  const withoutProto = clean.replace(/^https?:\/\//i, "");

  // If someone entered just a service slug like "asid-backend" without any dots or port, auto-append .onrender.com
  if (!withoutProto.includes(".") && !withoutProto.includes(":") && !withoutProto.includes("localhost")) {
    clean = clean.startsWith("http://") || clean.startsWith("https://")
      ? `${clean}.onrender.com`
      : `https://${withoutProto}.onrender.com`;
  }

  // Prepend protocol if missing
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    const isLocal = clean.startsWith("localhost") || clean.startsWith("127.0.0.1") || clean.startsWith("0.0.0.0");
    clean = isLocal ? `http://${clean}` : `https://${clean}`;
  }

  return clean.replace(/\/+$/, "");
}

export function getCustomApiBase(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) {
      const normalized = normalizeBackendUrl(stored);
      if (normalized !== stored) {
        window.localStorage.setItem(STORAGE_KEY, normalized);
      }
      return normalized;
    }
  }
  const envUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (envUrl) return normalizeBackendUrl(envUrl);

  // In local development on localhost, default to "" so Vite proxy (/api -> :8000) is used
  if (typeof window !== "undefined") {
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "0.0.0.0";
    if (isLocalhost) {
      return "";
    }
  }

  // Deployed / production default
  return DEFAULT_API_BASE;
}

export function setCustomApiBase(url: string): void {
  if (typeof window !== "undefined") {
    const clean = normalizeBackendUrl(url);
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
  const custom = getCustomApiBase();
  if (!custom) return "/api";
  const normalized = normalizeBackendUrl(custom);
  return `${normalized}/api`;
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
  const { json, headers, body, signal, ...rest } = options;
  const baseUrl = getApiBase();

  // Create an abort controller with a 60s timeout if no signal is provided, to give cold Render instances time to respond
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const effectiveSignal = signal || controller.signal;
    return await fetch(`${baseUrl}${path}`, {
      ...rest,
      signal: effectiveSignal,
      headers: {
        Accept: "application/json",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
      throw new ApiError(
        `Request to ${baseUrl} timed out. Render backend may still be waking up.`,
        408,
        "TIMEOUT",
      );
    }
    throw new ApiError(
      `Cannot reach the API at ${baseUrl}. Make sure your FastAPI server is running and accessible.`,
      0,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeoutId);
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
