import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { api, type VectorPayload } from "@/api/endpoints";
import type { ResultsQuery } from "@/types/api";

export const queryKeys = {
  health: ["health"] as const,
  settings: ["settings"] as const,
  gemini: ["gemini-status"] as const,
  datasets: ["datasets"] as const,
  dataset: (id: string) => ["dataset", id] as const,
  summary: (id: string) => ["summary", id] as const,
  results: (id: string, query?: ResultsQuery) => (query ? (["results", id, query] as const) : (["results", id] as const)),
  evaluation: (id: string) => ["evaluation", id] as const,
  audit: (id: string) => ["audit", id] as const,
  compare: (payload: VectorPayload) => ["compare", payload] as const,
};

/** Refresh everything derived from a dataset after a mutation. */
export function invalidateDataset(client: QueryClient, id: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.datasets }),
    client.invalidateQueries({ queryKey: queryKeys.dataset(id) }),
    client.invalidateQueries({ queryKey: queryKeys.summary(id) }),
    client.invalidateQueries({ queryKey: queryKeys.results(id) }),
    client.invalidateQueries({ queryKey: queryKeys.evaluation(id) }),
    client.invalidateQueries({ queryKey: queryKeys.audit(id) }),
  ]);
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
    refetchInterval: 30_000,
    retry: (count) => count < 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.settings, staleTime: 60_000 });
}

export function useDatasets() {
  return useQuery({ queryKey: queryKeys.datasets, queryFn: api.datasets });
}

export function useDataset(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.dataset(id ?? ""),
    queryFn: () => api.dataset(id as string),
    enabled: Boolean(id),
  });
}

export function useSummary(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.summary(id ?? ""),
    queryFn: () => api.summary(id as string),
    enabled: Boolean(id),
  });
}

export function useRow(id: string | null | undefined, rowId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.results(id ?? ""), "row", rowId],
    queryFn: () => api.row(id as string, rowId as number),
    enabled: Boolean(id) && rowId !== null && rowId > 0,
    retry: false,
    meta: { silent: true },
  });
}

export function useResults(id: string | null | undefined, query: ResultsQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.results(id ?? "", query),
    queryFn: () => api.results(id as string, query),
    enabled: Boolean(id) && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useEvaluation(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.evaluation(id ?? ""),
    queryFn: () => api.evaluation(id as string),
    enabled: Boolean(id) && enabled,
  });
}

export function useAudit(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.audit(id ?? ""),
    queryFn: () => api.audit(id as string),
    enabled: Boolean(id),
  });
}

export function useGeminiStatus() {
  return useQuery({ queryKey: queryKeys.gemini, queryFn: api.geminiStatus, staleTime: 60_000 });
}

export function useCompareModes(payload: VectorPayload | null) {
  return useQuery({
    queryKey: queryKeys.compare(payload ?? { categories: [], probabilities: [] }),
    queryFn: () => api.compareModes(payload as VectorPayload),
    enabled: payload !== null,
    placeholderData: keepPreviousData,
    retry: false,
    meta: { silent: true },
  });
}
