import { useCallback, useEffect, useRef, useState } from "react";
import { sameSettings } from "@/lib/rows";
import type { DecodeSettings } from "@/types/api";
import { useApplySettings } from "./mutations";
import { useSettings } from "./queries";
import { useDebouncedValue } from "./useDebouncedValue";

/**
 * Local draft of the decoder settings. With auto-apply on, every change is
 * saved and the active dataset is re-decoded (debounced) so thresholds can be
 * explored live.
 */
export function useDecoderDraft(datasetId: string | null, canDecode: boolean) {
  const settings = useSettings();
  const apply = useApplySettings();
  const [draft, setDraft] = useState<DecodeSettings | null>(null);
  const [autoApply, setAutoApply] = useState(true);
  const lastApplied = useRef<DecodeSettings | null>(null);

  useEffect(() => {
    if (settings.data && draft === null) {
      setDraft(settings.data.decode);
      lastApplied.current = settings.data.decode;
    }
  }, [settings.data, draft]);

  const debounced = useDebouncedValue(draft, 380);
  const { mutate } = apply;

  useEffect(() => {
    if (!autoApply || !debounced || sameSettings(debounced, lastApplied.current)) return;
    lastApplied.current = debounced;
    mutate({ settings: debounced, datasetId: canDecode ? datasetId : null });
  }, [debounced, autoApply, canDecode, datasetId, mutate]);

  const applyNow = useCallback(
    (notify = true) => {
      if (!draft) return;
      lastApplied.current = draft;
      mutate({ settings: draft, datasetId: canDecode ? datasetId : null, notify });
    },
    [draft, canDecode, datasetId, mutate],
  );

  const resetToDefaults = useCallback(() => {
    if (settings.data) setDraft(settings.data.defaults);
  }, [settings.data]);

  return {
    draft,
    setDraft,
    autoApply,
    setAutoApply,
    applyNow,
    resetToDefaults,
    saved: settings.data?.decode ?? null,
    limits: settings.data?.limits ?? null,
    isApplying: apply.isPending,
    dirty: Boolean(draft && settings.data && !sameSettings(draft, settings.data.decode)),
  };
}
