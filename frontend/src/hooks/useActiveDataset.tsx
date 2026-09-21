import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DatasetSummary } from "@/types/api";
import { useDatasets } from "./queries";

const STORAGE_KEY = "asid.activeDataset";

interface ActiveDatasetValue {
  activeId: string | null;
  active: DatasetSummary | null;
  datasets: DatasetSummary[];
  isLoading: boolean;
  isError: boolean;
  setActiveId: (id: string | null) => void;
}

const ActiveDatasetContext = createContext<ActiveDatasetValue | null>(null);

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable - selection simply won't persist */
  }
}

export function ActiveDatasetProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useDatasets();
  const [activeId, setActiveIdState] = useState<string | null>(readStored);
  const datasets = useMemo(() => data ?? [], [data]);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    writeStored(id);
  }, []);

  // Keep the selection valid: fall back to the newest dataset if the stored one is gone.
  useEffect(() => {
    if (!data) return;
    if (activeId && data.some((d) => d.id === activeId)) return;
    setActiveId(data[0]?.id ?? null);
  }, [data, activeId, setActiveId]);

  const value = useMemo<ActiveDatasetValue>(
    () => ({
      activeId,
      active: datasets.find((d) => d.id === activeId) ?? null,
      datasets,
      isLoading,
      isError,
      setActiveId,
    }),
    [activeId, datasets, isLoading, isError, setActiveId],
  );

  return <ActiveDatasetContext.Provider value={value}>{children}</ActiveDatasetContext.Provider>;
}

export function useActiveDataset(): ActiveDatasetValue {
  const value = useContext(ActiveDatasetContext);
  if (!value) throw new Error("useActiveDataset must be used inside ActiveDatasetProvider");
  return value;
}
