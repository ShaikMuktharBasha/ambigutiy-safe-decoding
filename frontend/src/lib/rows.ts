import type { DecodeSettings, PipelineStage, RowResult } from "@/types/api";

const TEXT_KEY = /(name|title|description|text|item|product)/i;

/** A human-friendly label for a row, e.g. the product name next to its category. */
export function rowContextLabel(row: RowResult, targetColumn: string | null): string | null {
  const entries = Object.entries(row.context).filter(
    ([key, value]) => key !== targetColumn && typeof value === "string" && value.trim() !== "",
  );
  const preferred = entries.find(([key]) => TEXT_KEY.test(key)) ?? entries[0];
  return preferred ? String(preferred[1]) : null;
}

export function sameSettings(a?: DecodeSettings | null, b?: DecodeSettings | null): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.confidence_threshold - b.confidence_threshold) < 1e-9 &&
    Math.abs(a.near_tie_threshold - b.near_tie_threshold) < 1e-9 &&
    a.mode === b.mode &&
    a.top_k === b.top_k
  );
}

export const STAGE_LABEL: Record<PipelineStage, string> = {
  uploaded: "Uploaded",
  column_selected: "Column encoded",
  probabilities_ready: "Vectors ready",
  decoded: "Decoded",
};

export const SCENARIO_LABEL: Record<string, string> = {
  confident: "Confident",
  moderate: "Moderate confidence",
  near_tie: "Near tie",
  low_confidence: "Diffuse / low confidence",
  overconfident_error: "Overconfident error",
  gemini: "Gemini",
};
