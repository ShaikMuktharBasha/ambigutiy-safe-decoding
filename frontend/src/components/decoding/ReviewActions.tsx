import { Ban, Check, ChevronDown, GitCompareArrows, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MenuItem, Popover } from "@/components/ui/Overlay";
import { cn } from "@/lib/cn";
import { dateTime } from "@/lib/format";
import { AUDIT_ACTION_LABELS } from "@/lib/status";
import type { ReviewAction, RowResult } from "@/types/api";

export function ReviewActions({
  row,
  categories,
  onAction,
  pending,
  size = "sm",
  className,
}: {
  row: RowResult;
  categories: string[];
  onAction: (action: ReviewAction, category?: string | null) => void;
  pending?: boolean;
  size?: "xs" | "sm";
  className?: string;
}) {
  if (row.manually_reviewed && row.review) {
    return (
      <div className={cn("flex flex-wrap items-center gap-3", className)}>
        <div className="text-[12.5px] text-ink-2">
          <span className="font-medium text-reviewed-ink">{AUDIT_ACTION_LABELS[row.review.action] ?? row.review.action}</span>
          {row.review.selected_category ? (
            <>
              {" "}
              → <span className="font-medium text-ink">{row.review.selected_category}</span>
            </>
          ) : null}
          <span className="text-ink-3"> · {dateTime(row.review.timestamp)}</span>
        </div>
        <Button size={size} variant="ghost" icon={<Undo2 />} loading={pending} onClick={() => onAction("revert")}>
          Revert
        </Button>
      </div>
    );
  }

  const others = categories.filter((c) => c !== row.top_1 && c !== row.top_2);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button size={size} variant="primary" icon={<Check />} disabled={pending} onClick={() => onAction("accept")}>
        Accept {row.top_1}
      </Button>
      {row.top_2 && (
        <Button
          size={size}
          variant="secondary"
          icon={<GitCompareArrows />}
          disabled={pending}
          onClick={() => onAction("choose", row.top_2)}
        >
          Choose {row.top_2}
        </Button>
      )}
      {others.length > 0 && (
        <Popover
          align="start"
          trigger={({ toggle, open }) => (
            <Button size={size} variant="secondary" disabled={pending} onClick={toggle} aria-expanded={open}>
              Choose another
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          )}
        >
          {(close) => (
            <div className="max-h-64 overflow-y-auto">
              {others.map((category) => {
                const p = row.probabilities.find((e) => e.category === category)?.probability ?? 0;
                return (
                  <MenuItem
                    key={category}
                    onClick={() => {
                      close();
                      onAction("choose", category);
                    }}
                    trailing={<span className="num text-[11.5px] text-ink-3">{(p * 100).toFixed(1)}%</span>}
                  >
                    {category}
                  </MenuItem>
                );
              })}
            </div>
          )}
        </Popover>
      )}
      <Button size={size} variant="danger" icon={<Ban />} disabled={pending} onClick={() => onAction("reject")}>
        Reject
      </Button>
    </div>
  );
}
