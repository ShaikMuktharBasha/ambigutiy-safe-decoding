import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type ReviewPayload, type VectorPayload } from "@/api/endpoints";
import { saveBlob } from "@/lib/download";
import { int } from "@/lib/format";
import { MODE_META } from "@/lib/status";
import type {
  BulkReviewAction,
  CategoryOrder,
  DecodeSettings,
  ExportKind,
  Scenario,
} from "@/types/api";
import { useActiveDataset } from "./useActiveDataset";
import { invalidateDataset, queryKeys } from "./queries";

export function useLoadDemo() {
  const client = useQueryClient();
  const { setActiveId } = useActiveDataset();
  return useMutation({
    mutationFn: (body: { rows?: number; seed?: number | null } = {}) =>
      api.loadDemo({ rows: body.rows ?? 300, seed: body.seed ?? 42, run_pipeline: true }),
    onSuccess: async (dataset) => {
      client.setQueryData(queryKeys.dataset(dataset.id), dataset);
      setActiveId(dataset.id);
      await invalidateDataset(client, dataset.id);
      const mode = dataset.pipeline.decode_config?.mode ?? "strict";
      toast.success("Demo dataset loaded", {
        description: `${int(dataset.row_count)} products decoded in ${MODE_META[mode].label.toLowerCase()} mode.`,
      });
    },
  });
}

export function useUploadDataset() {
  const client = useQueryClient();
  const { setActiveId } = useActiveDataset();
  return useMutation({
    mutationFn: (file: File) => api.uploadDataset(file),
    onSuccess: async (dataset) => {
      client.setQueryData(queryKeys.dataset(dataset.id), dataset);
      setActiveId(dataset.id);
      await client.invalidateQueries({ queryKey: queryKeys.datasets });
      toast.success("Dataset uploaded", {
        description: `${int(dataset.row_count)} rows · ${int(dataset.column_count)} columns`,
      });
    },
  });
}

export function useDeleteDataset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (datasetId: string) => api.deleteDataset(datasetId),
    onSuccess: async (_, datasetId) => {
      client.removeQueries({ queryKey: queryKeys.dataset(datasetId) });
      client.removeQueries({ queryKey: queryKeys.summary(datasetId) });
      client.removeQueries({ queryKey: queryKeys.results(datasetId) });
      await client.invalidateQueries({ queryKey: queryKeys.datasets });
      toast.success("Dataset deleted");
    },
  });
}

export function useSelectColumn(datasetId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { column: string; order: CategoryOrder }) =>
      api.encode({ dataset_id: datasetId, ...body }),
    onSuccess: async (encoding) => {
      await invalidateDataset(client, datasetId);
      toast.success(`Encoded "${encoding.column}"`, {
        description: `${encoding.categories.length} categories mapped to one-hot vectors.`,
      });
    },
  });
}

export function useSimulateDataset(datasetId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { seed?: number | null; mix?: Partial<Record<Scenario, number>> }) =>
      api.simulateDataset(datasetId, body),
    onSuccess: async (dataset) => {
      client.setQueryData(queryKeys.dataset(datasetId), dataset);
      await invalidateDataset(client, datasetId);
      toast.success("Probability vectors generated", {
        description: `Seed ${dataset.pipeline.probability_meta.seed ?? "random"} · ${int(dataset.row_count)} vectors`,
      });
    },
  });
}

export function useImportProbabilityColumns(datasetId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { mapping: Record<string, string>; normalize: boolean }) =>
      api.importProbabilityColumns(datasetId, body),
    onSuccess: async (dataset) => {
      client.setQueryData(queryKeys.dataset(datasetId), dataset);
      await invalidateDataset(client, datasetId);
      toast.success("Probability columns imported", { description: `${int(dataset.row_count)} vectors validated.` });
    },
  });
}

export function useGeminiDataset(datasetId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { text_column: string; max_rows?: number | null }) => api.geminiDataset(datasetId, body),
    onSuccess: async (dataset) => {
      client.setQueryData(queryKeys.dataset(datasetId), dataset);
      await invalidateDataset(client, datasetId);
      toast.success("Gemini predictions ready", {
        description: `${dataset.pipeline.probability_meta.gemini_rows ?? 0} rows scored. Run decoding to apply the safety checks.`,
      });
    },
  });
}

export function useDecodeDataset(datasetId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<DecodeSettings>) => api.decodeDataset(datasetId, settings),
    onSuccess: async (summary) => {
      client.setQueryData(queryKeys.summary(datasetId), summary);
      await invalidateDataset(client, datasetId);
      toast.success("Safe decoding complete", {
        description: `${int(summary.counts.SAFE)} safe · ${int(summary.needs_review)} need review`,
      });
    },
  });
}

/** Save decoder settings and, when a dataset is given, re-decode it with them. */
export function useApplySettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { settings: DecodeSettings; datasetId?: string | null; notify?: boolean }) => {
      const saved = await api.updateSettings(input.settings);
      const summary = input.datasetId ? await api.decodeDataset(input.datasetId, input.settings) : null;
      return { saved, summary };
    },
    onSuccess: async ({ saved, summary }, input) => {
      client.setQueryData(queryKeys.settings, saved);
      if (input.datasetId && summary) {
        client.setQueryData(queryKeys.summary(input.datasetId), summary);
        await invalidateDataset(client, input.datasetId);
      }
      if (input.notify) {
        toast.success("Settings saved", {
          description: summary ? `Re-decoded ${summary.dataset_name} with the new settings.` : undefined,
        });
      }
    },
  });
}

export function useReview(datasetId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<ReviewPayload, "dataset_id">) => api.review({ dataset_id: datasetId, ...payload }),
    onSuccess: () => invalidateDataset(client, datasetId),
  });
}

export function useBulkReview(datasetId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { row_ids: number[]; action: BulkReviewAction }) =>
      api.bulkReview({ dataset_id: datasetId, ...body }),
    onSuccess: async (result) => {
      await invalidateDataset(client, datasetId);
      toast.success(`${result.applied} row${result.applied === 1 ? "" : "s"} updated`, {
        description: result.skipped ? `${result.skipped} skipped (already in that state).` : "Logged to the audit trail.",
      });
    },
  });
}

export function useUpdateGeminiConfig() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { api_key?: string; model?: string }) => api.updateGeminiConfig(body),
    onSuccess: (status) => {
      client.setQueryData(queryKeys.gemini, status);
      toast.success(status.configured ? "Gemini configured" : "Gemini key cleared", {
        description: status.configured
          ? `Using ${status.model} ${status.source === "environment" ? "(from .env)" : ""}`.trim()
          : "Falling back to simulated vectors until a key is set again.",
      });
    },
  });
}

export function useGeminiClassify() {
  return useMutation({
    mutationFn: (body: { text: string; categories: string[] } & Partial<DecodeSettings>) => api.geminiClassify(body),
  });
}

export function useNormalizeVector() {
  return useMutation({ mutationFn: (probabilities: number[]) => api.normalize(probabilities) });
}

export function useExampleVector() {
  return useMutation({
    mutationFn: (body: { categories: string[]; scenario: "safe" | "near_tie" | "low_confidence" | "random" }) =>
      api.exampleVector(body),
  });
}

export function useDecodeVector() {
  return useMutation({ mutationFn: (payload: VectorPayload) => api.decode(payload) });
}

export function useExportCsv() {
  return useMutation({
    mutationFn: async ({ datasetId, kind }: { datasetId: string; kind: ExportKind }) => {
      const { blob, filename } = await api.exportCsv(datasetId, kind);
      saveBlob(blob, filename);
      return filename;
    },
    onSuccess: (filename) => toast.success("Export downloaded", { description: filename }),
  });
}
