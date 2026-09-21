/**
 * TypeScript mirrors of the FastAPI Pydantic schemas (backend/app/models).
 * Keep these in sync with the backend when the API changes.
 */

export type DecodingMode = "strict" | "soft" | "advisory";
export type DecodeStatus = "SAFE" | "UNCERTAIN" | "AMBIGUOUS" | "REJECTED" | "MANUALLY_REVIEWED";
export type PipelineStage = "uploaded" | "column_selected" | "probabilities_ready" | "decoded";
export type CategoryOrder = "appearance" | "alphabetical" | "frequency";
export type Scenario = "confident" | "moderate" | "near_tie" | "low_confidence" | "overconfident_error";
export type ExampleScenario = "safe" | "near_tie" | "low_confidence" | "random";
export type StatusFilter = "all" | "needs_review" | "flagged" | DecodeStatus;
export type SortField = "row_id" | "confidence" | "gap" | "status" | "prediction" | "original_value";
export type SortDir = "asc" | "desc";
export type ExportKind = "results" | "corrected" | "ambiguous" | "audit";
export type ReviewAction = "accept" | "choose" | "reject" | "revert";
export type BulkReviewAction = "accept" | "reject" | "revert";

export interface DecodeSettings {
  confidence_threshold: number;
  near_tie_threshold: number;
  mode: DecodingMode;
  top_k: number;
}

export interface RankedCategory {
  rank: number;
  category: string;
  index: number;
  probability: number;
}

export interface DecodeResponse {
  prediction: string | null;
  argmax_prediction: string;
  status: DecodeStatus;
  confidence: number;
  gap: number;
  reason: string;
  reason_code: string;
  reason_label: string;
  warning: string | null;
  top_k: RankedCategory[];
  alternatives: RankedCategory[];
  top_1: string;
  top_1_probability: number;
  top_2: string | null;
  top_2_probability: number | null;
  threshold: number;
  near_tie_threshold: number;
  mode: DecodingMode;
  flags: string[];
  tied_candidates: string[];
  requires_review: boolean;
  probabilities: number[];
}

export interface CompareModesResponse {
  argmax: { prediction: string; confidence: number };
  strict: DecodeResponse;
  soft: DecodeResponse;
  advisory: DecodeResponse;
}

export interface ValueCount {
  value: string;
  count: number;
}

export interface ColumnProfile {
  name: string;
  dtype: "text" | "integer" | "float" | "boolean" | "datetime";
  non_null: number;
  null_count: number;
  unique_count: number;
  unique_ratio: number;
  is_categorical: boolean;
  categorical_reason: string;
  sample_values: string[];
  top_values: ValueCount[];
}

export interface EncodingEntry {
  category: string;
  index: number;
  one_hot: number[];
  count: number;
}

export interface OneHotPreviewRow {
  row_id: number;
  value: string | null;
  one_hot: number[];
}

export interface EncodingOut {
  dataset_id: string | null;
  column: string | null;
  order: CategoryOrder;
  categories: string[];
  mapping: EncodingEntry[];
  unencoded_rows: number;
  vectors_preview: OneHotPreviewRow[];
}

export interface ProbabilityMeta {
  source?: string;
  seed?: number;
  mix?: Partial<Record<Scenario, number>>;
  columns?: Record<string, string>;
  normalized?: boolean;
  gemini_rows?: number;
  text_column?: string;
  model?: string;
  generated_at?: string;
}

export interface PipelineState {
  stage: PipelineStage;
  has_encoding: boolean;
  has_probabilities: boolean;
  has_results: boolean;
  probability_source: string | null;
  probability_meta: ProbabilityMeta;
  decode_config: DecodeSettings | null;
  decoded_at: string | null;
  reviewed_rows: number;
  audit_records: number;
}

export interface DatasetSummary {
  id: string;
  name: string;
  source: "upload" | "demo";
  filename: string | null;
  created_at: string;
  updated_at: string;
  row_count: number;
  column_count: number;
  target_column: string | null;
  category_count: number;
  pipeline: PipelineState;
}

export interface DatasetDetail extends DatasetSummary {
  columns: ColumnProfile[];
  suggested_column: string | null;
  categorical_columns: string[];
  text_columns: string[];
  numeric_columns: string[];
  preview: Record<string, unknown>[];
  encoding: EncodingOut | null;
  suggested_probability_columns: Record<string, string>;
}

export interface ReviewInfo {
  row_id: number;
  action: string;
  selected_category: string | null;
  previous_status: string;
  original_prediction: string | null;
  timestamp: string;
  note: string | null;
}

export interface ProbabilityEntry {
  category: string;
  index: number;
  probability: number;
}

export interface RowResult {
  row_id: number;
  original_value: string | null;
  prediction: string | null;
  final_value: string | null;
  argmax_prediction: string;
  status: DecodeStatus;
  computed_status: DecodeStatus;
  confidence: number;
  gap: number;
  top_1: string;
  top_1_probability: number;
  top_2: string | null;
  top_2_probability: number | null;
  reason: string;
  reason_code: string;
  reason_label: string;
  warning: string | null;
  flags: string[];
  tied_candidates: string[];
  top_k: RankedCategory[];
  probabilities: ProbabilityEntry[];
  requires_review: boolean;
  manually_reviewed: boolean;
  review: ReviewInfo | null;
  argmax_correct: boolean | null;
  probability_source: string | null;
  scenario: string | null;
  context: Record<string, unknown>;
}

export type StatusCounts = Record<DecodeStatus, number>;

export interface ResultsPage {
  dataset_id: string;
  target_column: string | null;
  categories: string[];
  config: DecodeSettings;
  decoded_at: string | null;
  items: RowResult[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  counts: StatusCounts;
}

export interface ResultsQuery {
  status: StatusFilter;
  search: string;
  sort_by: SortField;
  sort_dir: SortDir;
  page: number;
  page_size: number;
}

export interface HistogramBin {
  start: number;
  end: number;
  label: string;
  count: number;
  below_threshold: boolean;
}

export interface CategoryCount {
  category: string;
  count: number;
  argmax_count: number;
}

export interface ResultsSummary {
  dataset_id: string;
  dataset_name: string;
  decoded: boolean;
  total_rows: number;
  target_column: string | null;
  categories: string[];
  config: DecodeSettings | null;
  decoded_at: string | null;
  counts: StatusCounts;
  computed_counts: StatusCounts;
  needs_review: number;
  reviewed: number;
  average_confidence: number | null;
  median_confidence: number | null;
  average_gap: number | null;
  confidence_histogram: HistogramBin[];
  category_counts: CategoryCount[];
  unresolved: number;
  reason_counts: Record<string, number>;
  probability_source: string | null;
  recent: RowResult[];
}

export interface ArgmaxMetrics {
  total: number;
  accepted: number;
  abstained: number;
  flagged: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  silent_errors: number;
  average_confidence: number | null;
}

export interface SafeMetrics {
  total: number;
  accepted: number;
  flagged: number;
  abstained: number;
  status_counts: StatusCounts;
  correct_accepted: number;
  incorrect_accepted: number;
  coverage: number | null;
  selective_accuracy: number | null;
  errors_intercepted: number;
  correct_flagged: number;
  review_rate: number | null;
  average_confidence_accepted: number | null;
}

export interface SweepPoint {
  confidence_threshold: number;
  coverage: number;
  selective_accuracy: number | null;
  errors_let_through: number;
  errors_intercepted: number;
  is_current: boolean;
}

export interface ScenarioBreakdown {
  scenario: string;
  total: number;
  argmax_accuracy: number | null;
  status_counts: StatusCounts;
}

export interface EvaluationOut {
  dataset_id: string;
  has_ground_truth: boolean;
  evaluated_rows: number;
  config: DecodeSettings;
  probability_source: string | null;
  argmax: ArgmaxMetrics;
  safe: SafeMetrics;
  comparison: {
    unsafe_predictions_prevented: number;
    errors_let_through: number;
    error_reduction: number | null;
    accuracy_gain: number | null;
  };
  review: {
    reviewed: number;
    reviewed_correct: number;
    reviewed_rejected: number;
    human_accuracy: number | null;
  };
  sweep: SweepPoint[];
  scenarios: ScenarioBreakdown[];
  notes: string[];
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  dataset_id: string;
  row_id: number;
  column: string | null;
  action: "ACCEPT_TOP" | "CHOOSE_ALTERNATIVE" | "CHOOSE_OTHER" | "REJECT" | "REVERT" | string;
  original_value: string | null;
  original_prediction: string | null;
  decoder_prediction: string | null;
  selected_category: string | null;
  previous_status: string;
  new_status: string;
  confidence: number | null;
  gap: number | null;
  mode: string | null;
  note: string | null;
}

export interface AuditLogResponse {
  dataset_id: string;
  dataset_name: string;
  total: number;
  items: AuditRecord[];
}

export interface ReviewResponse {
  row: RowResult;
  audit: AuditRecord;
  counts: StatusCounts;
  needs_review: number;
}

export interface BulkReviewResponse {
  applied: number;
  skipped: number;
  audit: AuditRecord[];
  counts: StatusCounts;
  needs_review: number;
}

export type GeminiConfigSource = "settings" | "environment" | "none";

export interface GeminiStatus {
  configured: boolean;
  model: string;
  max_rows: number;
  batch_size: number;
  source: GeminiConfigSource;
  key_preview: string | null;
  model_is_custom: boolean;
  model_choices: string[];
}

export interface Limits {
  max_upload_mb: number;
  max_rows: number;
  max_columns: number;
  max_categories: number;
  max_top_k: number;
  probability_sum_tolerance: number;
}

export interface SettingsOut {
  decode: DecodeSettings;
  defaults: DecodeSettings;
  gemini: GeminiStatus;
  limits: Limits;
}

export interface HealthOut {
  status: "ok";
  app: string;
  version: string;
  environment: string;
  time: string;
  gemini_configured: boolean;
  datasets: number;
}

export interface ExampleVectorResponse {
  categories: string[];
  probabilities: number[];
  scenario: string;
  seed: number;
}

export interface NormalizeResponse {
  probabilities: number[];
  original_sum: number;
}

export interface GeminiClassifyResponse {
  provider: "gemini";
  model: string;
  text: string;
  raw_scores: Record<string, number>;
  probabilities: number[];
  decode: DecodeResponse;
}
