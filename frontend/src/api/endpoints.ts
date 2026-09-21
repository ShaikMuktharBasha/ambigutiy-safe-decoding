import type {
  AuditLogResponse,
  BulkReviewAction,
  BulkReviewResponse,
  CategoryOrder,
  CompareModesResponse,
  DatasetDetail,
  DatasetSummary,
  DecodeResponse,
  DecodeSettings,
  EncodingOut,
  EvaluationOut,
  ExampleScenario,
  ExampleVectorResponse,
  ExportKind,
  GeminiClassifyResponse,
  GeminiStatus,
  HealthOut,
  NormalizeResponse,
  ResultsPage,
  ResultsQuery,
  ResultsSummary,
  ReviewAction,
  ReviewResponse,
  RowResult,
  Scenario,
  SettingsOut,
} from "@/types/api";
import { download, request } from "./client";

export interface VectorPayload extends Partial<DecodeSettings> {
  categories: string[];
  probabilities: number[];
  normalize?: boolean;
}

export interface ReviewPayload {
  dataset_id: string;
  row_id: number;
  action: ReviewAction;
  category?: string | null;
  note?: string | null;
}

const id = (value: string) => encodeURIComponent(value);

export const api = {
  health: () => request<HealthOut>("/health"),

  settings: () => request<SettingsOut>("/settings"),
  updateSettings: (settings: DecodeSettings) =>
    request<SettingsOut>("/settings", { method: "PUT", json: settings }),
  resetSettings: () => request<SettingsOut>("/settings/reset", { method: "POST" }),

  datasets: () => request<DatasetSummary[]>("/datasets"),
  dataset: (datasetId: string) => request<DatasetDetail>(`/datasets/${id(datasetId)}`),
  uploadDataset: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DatasetDetail>("/datasets/upload", { method: "POST", body: form });
  },
  loadDemo: (body: { rows?: number; seed?: number | null; run_pipeline?: boolean } = {}) =>
    request<DatasetDetail>("/datasets/demo", { method: "POST", json: body }),
  deleteDataset: (datasetId: string) => request<void>(`/datasets/${id(datasetId)}`, { method: "DELETE" }),

  encode: (body: { dataset_id: string; column: string; order: CategoryOrder }) =>
    request<EncodingOut>("/encode", { method: "POST", json: body }),
  simulateDataset: (datasetId: string, body: { seed?: number | null; mix?: Partial<Record<Scenario, number>> }) =>
    request<DatasetDetail>(`/datasets/${id(datasetId)}/simulate`, { method: "POST", json: body }),
  importProbabilityColumns: (datasetId: string, body: { mapping: Record<string, string>; normalize: boolean }) =>
    request<DatasetDetail>(`/datasets/${id(datasetId)}/probabilities/columns`, { method: "POST", json: body }),
  decodeDataset: (datasetId: string, body: Partial<DecodeSettings>) =>
    request<ResultsSummary>(`/datasets/${id(datasetId)}/decode`, { method: "POST", json: body }),

  decode: (body: VectorPayload) => request<DecodeResponse>("/decode", { method: "POST", json: body }),
  compareModes: (body: VectorPayload) =>
    request<CompareModesResponse>("/decode/compare", { method: "POST", json: body }),
  exampleVector: (body: { categories: string[]; scenario: ExampleScenario; seed?: number | null }) =>
    request<ExampleVectorResponse>("/simulate/vector", { method: "POST", json: body }),
  normalize: (probabilities: number[]) =>
    request<NormalizeResponse>("/simulate/normalize", { method: "POST", json: { probabilities } }),

  results: (datasetId: string, query: ResultsQuery) => {
    const params = new URLSearchParams({
      status: query.status,
      sort_by: query.sort_by,
      sort_dir: query.sort_dir,
      page: String(query.page),
      page_size: String(query.page_size),
    });
    if (query.search.trim()) params.set("search", query.search.trim());
    return request<ResultsPage>(`/results/${id(datasetId)}?${params.toString()}`);
  },
  summary: (datasetId: string) => request<ResultsSummary>(`/results/${id(datasetId)}/summary`),
  evaluation: (datasetId: string) => request<EvaluationOut>(`/results/${id(datasetId)}/evaluation`),
  row: (datasetId: string, rowId: number) => request<RowResult>(`/results/${id(datasetId)}/rows/${rowId}`),

  review: (body: ReviewPayload) => request<ReviewResponse>("/review", { method: "POST", json: body }),
  bulkReview: (body: { dataset_id: string; row_ids: number[]; action: BulkReviewAction }) =>
    request<BulkReviewResponse>("/review/bulk", { method: "POST", json: body }),
  audit: (datasetId: string) => request<AuditLogResponse>(`/audit/${id(datasetId)}`),
  exportCsv: (datasetId: string, kind: ExportKind) => download(`/export/${id(datasetId)}?kind=${kind}`),

  geminiStatus: () => request<GeminiStatus>("/gemini/status"),
  updateGeminiConfig: (body: { api_key?: string; model?: string }) =>
    request<GeminiStatus>("/gemini/config", { method: "PUT", json: body }),
  geminiClassify: (body: { text: string; categories: string[] } & Partial<DecodeSettings>) =>
    request<GeminiClassifyResponse>("/gemini/classify", { method: "POST", json: body }),
  geminiDataset: (datasetId: string, body: { text_column: string; max_rows?: number | null }) =>
    request<DatasetDetail>(`/gemini/datasets/${id(datasetId)}`, { method: "POST", json: body }),
};
