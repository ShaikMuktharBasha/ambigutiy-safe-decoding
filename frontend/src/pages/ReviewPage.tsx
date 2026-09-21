import { AnimatePresence, motion } from "motion/react";
import { ChartColumn, ChevronLeft, ChevronRight, CircleCheck, ScrollText } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { NoDatasetState, PipelineIncompleteState } from "@/components/common/Guards";
import { ExportMenu } from "@/components/decoding/ExportMenu";
import { ProbabilityRuler } from "@/components/decoding/ProbabilityRuler";
import { ReviewActions } from "@/components/decoding/ReviewActions";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SegmentedControl, Select } from "@/components/ui/Controls";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/Layout";
import { useResults, useSummary } from "@/hooks/queries";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { useReviewAction } from "@/hooks/useReviewAction";
import { int, pct } from "@/lib/format";
import { rowContextLabel } from "@/lib/rows";
import type { DatasetSummary, ResultsQuery, ReviewAction, RowResult, SortField } from "@/types/api";

type QueueFilter = "needs_review" | "AMBIGUOUS" | "UNCERTAIN" | "REJECTED";

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] text-ink-3">{label}</div>
      <div className="mt-0.5 truncate text-[13.5px] text-ink">{children}</div>
    </div>
  );
}

function ReviewCard({
  row,
  categories,
  targetColumn,
  threshold,
  nearTie,
  pending,
  onAction,
}: {
  row: RowResult;
  categories: string[];
  targetColumn: string | null;
  threshold: number;
  nearTie: number;
  pending: boolean;
  onAction: (action: ReviewAction, category?: string | null) => void;
}) {
  const context = rowContextLabel(row, targetColumn);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="num text-[14px] font-semibold text-ink">Row #{row.row_id}</span>
            {context && <span className="truncate text-[13px] text-ink-3">{context}</span>}
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 pt-4 sm:grid-cols-5">
        <Metric label="Top prediction">
          <span className="font-medium">{row.top_1}</span> <span className="num text-ink-3">— {pct(row.top_1_probability)}</span>
        </Metric>
        <Metric label="Alternative">
          {row.top_2 ? (
            <>
              {row.top_2} <span className="num text-ink-3">— {pct(row.top_2_probability)}</span>
            </>
          ) : (
            "—"
          )}
        </Metric>
        <Metric label="Confidence">
          <span className="num">{pct(row.confidence)}</span>
        </Metric>
        <Metric label="Gap">
          <span className="num">{pct(row.gap)}</span>
        </Metric>
        <Metric label="Reason">{row.reason_label}</Metric>
      </div>

      <div className="px-5 pt-4">
        <ProbabilityRuler
          entries={row.probabilities}
          top1={{ category: row.top_1, probability: row.top_1_probability }}
          top2={row.top_2 ? { category: row.top_2, probability: row.top_2_probability ?? 0 } : null}
          threshold={threshold}
          nearTie={nearTie}
          nearTieFlagged={row.flags.includes("NEAR_TIE")}
          status={row.computed_status}
          gap={row.gap}
          showLegend={false}
        />
        <p className="pb-1 pt-1 text-[12.5px] leading-relaxed text-ink-3">{row.reason}</p>
      </div>

      <div className="mt-3 border-t border-line bg-canvas/60 px-5 py-3">
        <ReviewActions row={row} categories={categories} pending={pending} onAction={onAction} />
      </div>
    </Card>
  );
}

function ReviewQueue({ dataset }: { dataset: DatasetSummary }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<QueueFilter>("needs_review");
  const [sortBy, setSortBy] = useState<SortField>("gap");
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const query: ResultsQuery = { status: filter, search: "", sort_by: sortBy, sort_dir: "asc", page, page_size: 6 };
  const results = useResults(dataset.id, query);
  const summary = useSummary(dataset.id);
  const { act, pendingRow } = useReviewAction(dataset.id);
  const config = dataset.pipeline.decode_config;

  const unhide = (rowId: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });

  const handle = (row: RowResult, action: ReviewAction, category?: string | null) => {
    setHidden((prev) => new Set(prev).add(row.row_id));
    void act(row, action, category, { onError: () => unhide(row.row_id), onUndo: () => unhide(row.row_id) });
  };

  const items = (results.data?.items ?? []).filter((row) => !hidden.has(row.row_id));
  const s = summary.data;
  const flaggedTotal = s ? s.total_rows - s.computed_counts.SAFE : 0;
  const reviewed = s?.reviewed ?? 0;
  const progress = flaggedTotal ? Math.min(1, reviewed / flaggedTotal) : 0;

  return (
    <>
      <PageHeader
        title="Review queue"
        meta={<span className="font-medium text-ink-2">{dataset.name}</span>}
        description="Rows the decoder would not trust on its own. Every decision you make here is recorded in the audit log."
        actions={<ExportMenu datasetId={dataset.id} decoded />}
      />

      <Card className="mb-5 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="num text-[22px] leading-none text-ink">{int(s?.needs_review ?? 0)}</div>
            <div className="mt-1 text-[12.5px] text-ink-3">rows need a decision</div>
          </div>
          <div className="min-w-[14rem] flex-1 sm:max-w-md">
            <div className="mb-1.5 flex justify-between text-[12px] text-ink-3">
              <span>Review progress</span>
              <span className="num">
                {int(reviewed)} / {int(flaggedTotal)} flagged
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sunken">
              <motion.div
                className="h-full rounded-full bg-reviewed"
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<QueueFilter>
          ariaLabel="Queue filter"
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          options={[
            { value: "needs_review", label: "All pending" },
            { value: "AMBIGUOUS", label: `Ambiguous ${s ? s.counts.AMBIGUOUS : ""}` },
            { value: "UNCERTAIN", label: `Uncertain ${s ? s.counts.UNCERTAIN : ""}` },
            { value: "REJECTED", label: `Rejected ${s ? s.counts.REJECTED : ""}` },
          ]}
        />
        <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
          Order by
          <Select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortField);
              setPage(1);
            }}
            className="w-44"
          >
            <option value="gap">Smallest gap first</option>
            <option value="confidence">Lowest confidence first</option>
            <option value="row_id">Row number</option>
          </Select>
        </label>
      </div>

      {results.isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Card key={i} className="space-y-4 p-5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10" />
              <Skeleton className="h-8 w-2/3" />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CircleCheck className="text-safe" />}
            title={filter === "needs_review" ? "Queue clear" : "Nothing pending with this status"}
            description={
              filter === "needs_review"
                ? "Every flagged prediction has a human decision. Check the audit log or the evaluation to see the effect."
                : "Switch filters to see other rows waiting for review."
            }
            actions={
              <>
                <Button icon={<ScrollText />} onClick={() => navigate("/audit")}>
                  View audit log
                </Button>
                <Button icon={<ChartColumn />} onClick={() => navigate("/analytics?tab=evaluation")}>
                  Open evaluation
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {items.map((row) => (
              <motion.div
                key={row.row_id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 48, scale: 0.98, transition: { duration: 0.22 } }}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
              >
                <ReviewCard
                  row={row}
                  categories={results.data?.categories ?? []}
                  targetColumn={dataset.target_column}
                  threshold={config?.confidence_threshold ?? 0.75}
                  nearTie={config?.near_tie_threshold ?? 0.05}
                  pending={pendingRow === row.row_id}
                  onAction={(action, category) => handle(row, action, category)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {results.data && results.data.pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-[13px] text-ink-3">
          <Button size="sm" icon={<ChevronLeft />} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="num">
            Page {results.data.page} of {results.data.pages}
          </span>
          <Button size="sm" disabled={page >= results.data.pages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight />
          </Button>
        </div>
      )}
    </>
  );
}

export function ReviewPage() {
  const { active } = useActiveDataset();
  if (!active) {
    return (
      <>
        <PageHeader title="Review queue" description="Resolve ambiguous and low-confidence predictions." />
        <NoDatasetState />
      </>
    );
  }
  if (!active.pipeline.has_results) {
    return (
      <>
        <PageHeader title="Review queue" description="Resolve ambiguous and low-confidence predictions." />
        <PipelineIncompleteState dataset={active} />
      </>
    );
  }
  return <ReviewQueue key={active.id} dataset={active} />;
}
