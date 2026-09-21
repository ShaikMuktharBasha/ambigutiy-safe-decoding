const rawBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const API_BASE = rawBase
  ? rawBase.startsWith("http")
    ? `${rawBase}/api`
    : `https://${rawBase}/api`
  : "/api";

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
  try {
    return await fetch(`${API_BASE}${path}`, {
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
      "Cannot reach the API. Make sure the FastAPI server is running on port 8000.",
      0,
      "NETWORK_ERROR",
    );
  }
}

async function toError(response: Response): Promise<ApiError> {
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const payload = isJson ? ((await response.json().catch(() => null)) as ErrorPayload | null) : null;
  const error = payload?.error;
  if (error?.message) {
    return new ApiError(error.message, response.status, error.code ?? "HTTP_ERROR", error.details);
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
