import { useState } from "react";
import { toast } from "sonner";
import { STATUS_META } from "@/lib/status";
import type { ReviewAction, RowResult } from "@/types/api";
import { useReview } from "./mutations";

interface Callbacks {
  onSuccess?: () => void;
  onError?: () => void;
  onUndo?: () => void;
}

/**
 * Wraps the review mutation with consistent feedback: a toast describing the
 * decision (with Undo) and per-row pending state.
 */
export function useReviewAction(datasetId: string) {
  const review = useReview(datasetId);
  const [pendingRow, setPendingRow] = useState<number | null>(null);

  async function act(row: RowResult, action: ReviewAction, category?: string | null, callbacks: Callbacks = {}) {
    setPendingRow(row.row_id);
    try {
      const result = await review.mutateAsync({ row_id: row.row_id, action, category });
      callbacks.onSuccess?.();
      if (action === "revert") {
        toast.success(`Row #${row.row_id} restored`, {
          description: `Back to ${STATUS_META[result.row.status].label.toLowerCase()} · logged to the audit trail.`,
        });
        return;
      }
      const selected = result.audit.selected_category;
      toast.success(selected ? `Row #${row.row_id} → ${selected}` : `Row #${row.row_id} rejected`, {
        description: "Decision logged to the audit trail.",
        action: {
          label: "Undo",
          onClick: () => {
            callbacks.onUndo?.();
            review.mutateAsync({ row_id: row.row_id, action: "revert" }).catch(() => undefined);
          },
        },
      });
    } catch {
      callbacks.onError?.();
    } finally {
      setPendingRow((current) => (current === row.row_id ? null : current));
    }
  }

  return { act, pendingRow };
}
