import { motion } from "motion/react";
import { CircleCheck, Play, RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { NoDatasetState, PipelineIncompleteState } from "@/components/common/Guards";
import { DecodeControls } from "@/components/decoding/DecodeControls";
import { ExportMenu } from "@/components/decoding/ExportMenu";
import { ResultsTable } from "@/components/decoding/ResultsTable";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Controls";
import { AnimatedNumber, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/Layout";
import { Spinner } from "@/components/ui/Spinner";
import { useDecodeDataset } from "@/hooks/mutations";
import { useResults, useSummary } from "@/hooks/queries";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { useDecoderDraft } from "@/hooks/useDecoderDraft";
import { cn } from "@/lib/cn";
import { int, pct } from "@/lib/format";
import { sameSettings } from "@/lib/rows";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import type { DatasetSummary, ResultsQuery, StatusFilter } from "@/types/api";

const VALID_FILTERS = new Set<StatusFilter>(["all", "needs_review", "flagged", ...STATUS_ORDER]);

function DecoderWorkspace({ dataset, initialStatus }: { dataset: DatasetSummary; initialStatus: StatusFilter }) {
  const draft = useDecoderDraft(dataset.id, dataset.pipeline.has_probabilities);
  const decode = useDecodeDataset(dataset.id);
  const decoded = dataset.pipeline.has_results;
  const [query, setQuery] = useState<ResultsQuery>({
    status: initialStatus,
    search: "",
    sort_by: "row_id",
    sort_dir: "asc",
    page: 1,
    page_size: 25,
  });
  const onQueryChange = useCallback((patch: Partial<ResultsQuery>) => setQuery((q) => ({ ...q, ...patch })), []);
  const results = useResults(dataset.id, query, decoded);
  const summary = useSummary(decoded ? dataset.id : null);
  const appliedConfig = dataset.pipeline.decode_config;
  const mismatch = decoded && draft.saved !== null && !sameSettings(appliedConfig, draft.saved);
  const total = summary.data?.total_rows || 1;

  return (
    <>
      <PageHeader
        title="Decoder"
        meta={
          <>
            <span className="font-medium text-ink-2">{dataset.name}</span>
            <span>·</span>
            <span>
              {int(dataset.row_count)} rows · {dataset.category_count} categories
            </span>
          </>
        }
        description="Tune the thresholds and decoding mode. Every change re-runs the local ambiguity detector over the whole dataset."
        actions={<ExportMenu datasetId={dataset.id} decoded={decoded} />}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-20">
          <CardHeader
            title="Decoder settings"
            actions={
              <span className="flex h-5 items-center gap-1.5 text-[11.5px] text-ink-3">
                {draft.isApplying ? (
                  <>
                    <Spinner className="size-3" /> Applying
                  </>
                ) : decoded && !mismatch ? (
                  <>
                    <CircleCheck className="size-3.5 text-safe" /> Applied
                  </>
                ) : null}
              </span>
            }
          />
          <div className="px-5 pb-5">
            {draft.draft ? (
              <DecodeControls value={draft.draft} onChange={draft.setDraft} maxTopK={draft.limits?.max_top_k} />
            ) : (
              <div className="space-y-4">
                <Skeleton className="h-8" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            )}
            <div className="mt-6 space-y-3 border-t border-line pt-4">
              <Switch checked={draft.autoApply} onChange={draft.setAutoApply} label="Apply changes automatically" />
              {(!draft.autoApply || mismatch) && (
                <Button
                  variant="primary"
                  className="w-full"
                  icon={<Play />}
                  loading={draft.isApplying}
                  disabled={!draft.draft || (!draft.dirty && !mismatch)}
                  onClick={() => draft.applyNow(true)}
                >
                  Apply and re-decode
                </Button>
              )}
              {mismatch && !draft.isApplying && (
                <p className="text-xs leading-relaxed text-uncertain-ink">
                  These results were decoded with different settings than the ones saved.
                </p>
              )}
              <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={draft.resetToDefaults}>
                Reset to defaults
              </Button>
            </div>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          {!decoded ? (
            <Card>
              <EmptyState
                icon={<Play />}
                title="Ready to decode"
                description="Probability vectors are attached. Run the safe decoder with the settings on the left."
                actions={
                  <Button
                    variant="primary"
                    loading={decode.isPending}
                    disabled={!draft.draft}
                    onClick={() => draft.draft && decode.mutate(draft.draft)}
                  >
                    Run safe decoding
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
                {STATUS_ORDER.map((status) => {
                  const meta = STATUS_META[status];
                  const Icon = meta.icon;
                  const count = summary.data?.counts[status] ?? 0;
                  const active = query.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => onQueryChange({ status: active ? "all" : status, page: 1 })}
                      className={cn(
                        "rounded-xl border bg-surface px-3.5 py-3 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5",
                        active ? "border-ink ring-2 ring-ink/5" : "border-line hover:border-line-strong",
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
                        <Icon className={cn("size-3.5", meta.text)} />
                        {meta.label}
                      </div>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="num text-[22px] leading-tight text-ink">
                          <AnimatedNumber value={count} />
                        </span>
                        <span className="num text-[11.5px] text-ink-4">{pct(count / total, 0)}</span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken">
                        <motion.div
                          className={cn("h-full rounded-full", meta.dot)}
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / total) * 100}%` }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              <ResultsTable
                datasetId={dataset.id}
                page={results.data}
                isLoading={results.isLoading}
                isFetching={results.isFetching || draft.isApplying}
                query={query}
                onQueryChange={onQueryChange}
                targetColumn={dataset.target_column}
                threshold={appliedConfig?.confidence_threshold ?? 0.75}
                nearTie={appliedConfig?.near_tie_threshold ?? 0.05}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function DecoderPage() {
  const { active } = useActiveDataset();
  const [params] = useSearchParams();
  const requested = params.get("status") as StatusFilter | null;
  const initialStatus = requested && VALID_FILTERS.has(requested) ? requested : "all";

  if (!active) {
    return (
      <>
        <PageHeader title="Decoder" description="Safely decode probability vectors back into categories." />
        <NoDatasetState />
      </>
    );
  }
  if (!active.pipeline.has_probabilities) {
    return (
      <>
        <PageHeader title="Decoder" description="Safely decode probability vectors back into categories." />
        <PipelineIncompleteState dataset={active} />
      </>
    );
  }
  return <DecoderWorkspace key={`${active.id}-${initialStatus}`} dataset={active} initialStatus={initialStatus} />;
}
