import { toast } from "sonner";
import { isApiError } from "@/api/client";

const TITLES: Record<string, string> = {
  NETWORK_ERROR: "API unreachable",
  API_UNAVAILABLE: "API unavailable",
  UNSUPPORTED_FILE_TYPE: "Unsupported file type",
  INVALID_FILE: "Invalid file",
  INVALID_CSV: "Invalid CSV file",
  INVALID_XLSX: "Invalid Excel file",
  FILE_TOO_LARGE: "File too large",
  EMPTY_FILE: "Empty file",
  EMPTY_DATASET: "No data rows",
  TOO_MANY_ROWS: "Too many rows",
  TOO_MANY_COLUMNS: "Too many columns",
  MISSING_CATEGORICAL_COLUMN: "Column not found",
  MISSING_COLUMN: "Column not found",
  MISSING_CATEGORIES: "Missing categories",
  INVALID_CATEGORIES: "Invalid categories",
  UNKNOWN_CATEGORY: "Unknown category",
  MALFORMED_PROBABILITY_VECTOR: "Malformed probability vector",
  NEGATIVE_PROBABILITY: "Negative probability",
  PROBABILITY_OUT_OF_RANGE: "Probability above 1",
  PROBABILITY_LENGTH_MISMATCH: "Wrong vector length",
  PROBABILITY_SUM_INVALID: "Probabilities don't sum to 1",
  INVALID_THRESHOLD: "Invalid decoder settings",
  VALIDATION_ERROR: "Invalid request",
  DATASET_NOT_FOUND: "Dataset not found",
  ROW_NOT_FOUND: "Row not found",
  NO_CATEGORICAL_COLUMN: "Select a column first",
  NO_PROBABILITIES: "No probability vectors yet",
  NOT_DECODED: "Dataset not decoded yet",
  NOTHING_TO_REVERT: "Nothing to revert",
  GEMINI_NOT_CONFIGURED: "Gemini isn't configured",
  GEMINI_ERROR: "Gemini request failed",
  GEMINI_TIMEOUT: "Gemini timed out",
  INTERNAL_ERROR: "Server error",
};

export function errorTitle(error: unknown, fallback = "Something went wrong"): string {
  return isApiError(error) ? (TITLES[error.code] ?? fallback) : fallback;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}

export function notifyError(error: unknown, fallback?: string) {
  toast.error(errorTitle(error, fallback), { description: errorMessage(error) });
}
