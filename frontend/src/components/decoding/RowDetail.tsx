import { StatusBadge } from "@/components/ui/Badge";
import { useReviewAction } from "@/hooks/useReviewAction";
import { humanize, stringifyCell } from "@/lib/format";
import { SCENARIO_LABEL } from "@/lib/rows";
import type { RowResult } from "@/types/api";
import { ProbabilityList, ProbabilityRuler } from "./ProbabilityRuler";
import { ReviewActions } from "./ReviewActions";

export function RowDetail({
  row,
  datasetId,
  categories,
  threshold,
  nearTie,
}: {
  row: RowResult;
  datasetId: string;
  categories: string[];
  threshold: number;
  nearTie: number;
}) {
  const { act, pendingRow } = useReviewAction(datasetId);
  const contextEntries = Object.entries(row.context).slice(0, 10);

  return (
    <div className="grid gap-6 px-4 py-5 sm:px-6 @3xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={row.status} />
            {row.status !== row.computed_status && (
              <span className="text-[11.5px] text-ink-3">
                decoder said <StatusBadge status={row.computed_status} className="ml-1" />
              </span>
            )}
            {row.warning && <span className="text-[12px] font-medium text-uncertain-ink">⚠ {row.warning}</span>}
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">{row.reason}</p>
        </div>

        <ProbabilityRuler
          entries={row.probabilities}
          top1={{ category: row.top_1, probability: row.top_1_probability }}
          top2={row.top_2 ? { category: row.top_2, probability: row.top_2_probability ?? 0 } : null}
          threshold={threshold}
          nearTie={nearTie}
          nearTieFlagged={row.flags.includes("NEAR_TIE")}
          status={row.computed_status}
          gap={row.gap}
        />

        <div>
          <div className="mb-2 text-[12px] font-medium text-ink-3">Complete probability vector</div>
          <ProbabilityList items={row.probabilities} highlight={row.top_1} secondary={row.top_2} />
        </div>
      </div>

      <div className="min-w-0 space-y-5">
        <div>
          <div className="mb-2 text-[12px] font-medium text-ink-3">Top-{row.top_k.length} ranking</div>
          <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
            {row.top_k.map((item) => (
              <li key={item.category} className="flex items-center justify-between px-3 py-1.5 text-[12.5px]">
                <span className="flex items-center gap-2.5">
                  <span className="num text-[11px] text-ink-4">{item.rank}.</span>
                  <span className={item.rank === 1 ? "font-medium text-ink" : "text-ink-2"}>{item.category}</span>
                </span>
                <span className="num text-ink">{(item.probability * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="mb-2 text-[12px] font-medium text-ink-3">Record</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
            {contextEntries.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="truncate text-ink-3">{key}</dt>
                <dd className="truncate text-ink">{stringifyCell(value) || "—"}</dd>
              </div>
            ))}
            {row.probability_source && (
              <div className="contents">
                <dt className="text-ink-3">vector source</dt>
                <dd className="text-ink">
                  {humanize(row.probability_source)}
                  {row.scenario && row.scenario !== "gemini" ? ` · ${SCENARIO_LABEL[row.scenario] ?? humanize(row.scenario)}` : ""}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div>
          <div className="mb-2 text-[12px] font-medium text-ink-3">Manual decision</div>
          <ReviewActions
            row={row}
            categories={categories}
            size="xs"
            pending={pendingRow === row.row_id}
            onAction={(action, category) => act(row, action, category)}
          />
        </div>
      </div>
    </div>
  );
}
