import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { CategoryBars, ConfidenceHistogram, CoverageChart, OutcomeBars, ProbabilityBars, StatusDonut } from "@/components/charts/Charts";
import { NoDatasetState, PipelineIncompleteState } from "@/components/common/Guards";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, SegmentedControl } from "@/components/ui/Controls";
import { AnimatedNumber, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader, Stagger, StaggerItem } from "@/components/ui/Layout";
import { useEvaluation, useResults, useRow, useSummary } from "@/hooks/queries";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { cn } from "@/lib/cn";
import { humanize, int, pct } from "@/lib/format";
import { rowContextLabel, SCENARIO_LABEL } from "@/lib/rows";
import { MODE_META, STATUS_META, STATUS_ORDER } from "@/lib/status";
import type { DatasetSummary, EvaluationOut, ResultsSummary } from "@/types/api";

type Tab = "distributions" | "evaluation";

function ProbabilityComparison({ dataset, summary }: { dataset: DatasetSummary; summary: ResultsSummary }) {
  const flagged = useResults(dataset.id, { status: "flagged", search: "", sort_by: "gap", sort_dir: "asc", page: 1, page_size: 5 });
  const [input, setInput] = useState("");
  const [rowId, setRowId] = useState<number | null>(null);
  const row = useRow(dataset.id, rowId);

  useEffect(() => {
    if (rowId === null) {
      const first = flagged.data?.items[0]?.row_id;
      if (first) setRowId(first);
      else if (flagged.data) setRowId(1);
    }
  }, [flagged.data, rowId]);

  return (
    <Card className="h-full">
      <CardHeader title="Probability comparison" description="Full probability vector for a selected row" />
      <CardBody className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(input);
            if (Number.isInteger(n) && n > 0) setRowId(n);
          }}
        >
          <Input
            type="number"
            min={1}
            max={summary.total_rows}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Row number (1–${summary.total_rows})`}
            className="num h-8 text-[13px]"
          />
          <Button type="submit" size="sm" icon={<Search />}>
            Show
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-ink-3">Closest calls:</span>
          {flagged.data?.items.map((item) => (
            <button
              key={item.row_id}
              type="button"
              onClick={() => setRowId(item.row_id)}
              className={cn(
                "num rounded-md border px-1.5 py-0.5 transition-colors",
                rowId === item.row_id ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:border-line-strong",
              )}
            >
              #{item.row_id} · {pct(item.gap)}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          {row.isError ? (
            <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] text-rejected-ink">
              {row.error.message}
            </motion.p>
          ) : row.data ? (
            <motion.div key={row.data.row_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="num font-semibold text-ink">Row #{row.data.row_id}</span>
                <span className="text-ink-3">{rowContextLabel(row.data, summary.target_column)}</span>
                <StatusBadge status={row.data.status} className="ml-auto" />
              </div>
              <ProbabilityBars entries={row.data.probabilities} threshold={summary.config?.confidence_threshold ?? 0.75} />
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{row.data.reason}</p>
            </motion.div>
          ) : (
            <Skeleton key="sk" className="h-40" />
          )}
        </AnimatePresence>
      </CardBody>
    </Card>
  );
}

function Distributions({ dataset, summary }: { dataset: DatasetSummary; summary: ResultsSummary }) {
  const belowThreshold = summary.confidence_histogram.filter((b) => b.below_threshold).reduce((a, b) => a + b.count, 0);
  return (
    <Stagger className="grid gap-5 lg:grid-cols-12">
      <StaggerItem className="lg:col-span-7">
        <Card className="h-full">
          <CardHeader
            title="Confidence distribution"
            description="Maximum probability per row, in 0.05 bins"
            actions={
              <div className="flex gap-4 text-right text-[12px] text-ink-3">
                <div>
                  <div className="num text-[15px] text-ink">{pct(summary.average_confidence)}</div>
                  mean
                </div>
                <div>
                  <div className="num text-[15px] text-ink">{int(belowThreshold)}</div>
                  below τ
                </div>
              </div>
            }
          />
          <CardBody>
            <ConfidenceHistogram bins={summary.confidence_histogram} threshold={summary.config?.confidence_threshold ?? 0.75} />
          </CardBody>
        </Card>
      </StaggerItem>
      <StaggerItem className="lg:col-span-5">
        <Card className="h-full">
          <CardHeader title="Status distribution" description={summary.config ? `${MODE_META[summary.config.mode].label} mode` : undefined} />
          <CardBody>
            <StatusDonut counts={summary.counts} total={summary.total_rows} />
          </CardBody>
        </Card>
      </StaggerItem>
      <StaggerItem className="lg:col-span-6">
        <Card className="h-full">
          <CardHeader
            title="Top categories"
            description={`Final decoded values${summary.unresolved ? ` · ${int(summary.unresolved)} rows without a category` : ""}`}
          />
          <CardBody>
            <CategoryBars data={summary.category_counts} />
            <div className="mt-4 flex flex-wrap gap-1.5">
              {Object.entries(summary.reason_counts).map(([label, count]) => (
                <span key={label} className="rounded-md bg-sunken px-2 py-0.5 text-[11.5px] text-ink-2">
                  {label} <span className="num text-ink-3">{int(count)}</span>
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      </StaggerItem>
      <StaggerItem className="lg:col-span-6">
        <ProbabilityComparison dataset={dataset} summary={summary} />
      </StaggerItem>
    </Stagger>
  );
}

function CompareRow({ label, argmax, safe, emphasis }: { label: string; argmax: ReactNode; safe: ReactNode; emphasis?: boolean }) {
  return (
    <tr className={cn("transition-colors hover:bg-hover/40", emphasis && "bg-accent-soft/40")}>
      <td className={cn("border-b border-line px-4 py-2.5 text-[13px]", emphasis ? "font-medium text-accent-ink" : "text-ink-2")}>{label}</td>
      <td className="num border-b border-line px-4 py-2.5 text-right text-[13px] text-ink-2">{argmax}</td>
      <td className={cn("num border-b border-line px-4 py-2.5 text-right text-[13px]", emphasis ? "font-semibold text-accent-ink" : "text-ink")}>{safe}</td>
    </tr>
  );
}

function Evaluation({ evaluation }: { evaluation: EvaluationOut }) {
  const { argmax, safe, comparison } = evaluation;
  const hero = [
    { label: "Unsafe predictions prevented", value: comparison.unsafe_predictions_prevented, format: (v: number) => int(Math.round(v)), accent: true },
    { label: "Errors still accepted", value: comparison.errors_let_through, format: (v: number) => int(Math.round(v)) },
    { label: "Accuracy of accepted rows", value: safe.selective_accuracy ?? 0, format: (v: number) => pct(v), sub: `argmax ${pct(argmax.accuracy)}` },
    { label: "Coverage", value: safe.coverage ?? 0, format: (v: number) => pct(v), sub: "rows decoded automatically" },
  ];

  return (
    <Stagger className="space-y-5">
      <StaggerItem>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {hero.map((h) => (
            <Card key={h.label} className={cn("p-4", h.accent && "border-accent/30 bg-accent-soft/40")}>
              <div className={cn("text-[12.5px]", h.accent ? "text-accent-ink" : "text-ink-3")}>{h.label}</div>
              <div className={cn("num mt-2 text-[28px] leading-none tracking-[-0.03em]", h.accent ? "text-accent-ink" : "text-ink")}>
                <AnimatedNumber value={h.value} format={h.format} />
              </div>
              {h.sub && <div className="mt-2 text-[12px] text-ink-3">{h.sub}</div>}
            </Card>
          ))}
        </div>
      </StaggerItem>

      <StaggerItem>
        <div className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-6">
            <CardHeader
              title="Standard argmax vs ambiguity-safe decoder"
              description={`${int(evaluation.evaluated_rows)} rows · ${MODE_META[evaluation.config.mode].label} mode · τ ${evaluation.config.confidence_threshold.toFixed(2)} · δ ${evaluation.config.near_tie_threshold.toFixed(3)}`}
            />
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[420px] border-separate border-spacing-0">
                <thead>
                  <tr className="text-[12px] text-ink-3">
                    <th className="border-y border-line bg-sunken/60 px-4 py-2 text-left font-medium">Metric</th>
                    <th className="border-y border-line bg-sunken/60 px-4 py-2 text-right font-medium">Standard argmax</th>
                    <th className="border-y border-line bg-sunken/60 px-4 py-2 text-right font-medium text-ink">Safe decoder</th>
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="Total predictions" argmax={int(argmax.total)} safe={int(safe.total)} />
                  <CompareRow label="Accepted predictions" argmax={int(argmax.accepted)} safe={int(safe.accepted)} />
                  <CompareRow label="Rejected predictions" argmax="0" safe={int(safe.status_counts.REJECTED)} />
                  <CompareRow label="Ambiguous predictions" argmax="never detected" safe={int(safe.status_counts.AMBIGUOUS)} />
                  <CompareRow label="Uncertain predictions" argmax="never detected" safe={int(safe.status_counts.UNCERTAIN)} />
                  <CompareRow label="Abstained (no category returned)" argmax="0" safe={int(safe.abstained)} />
                  <CompareRow label="Average confidence of accepted" argmax={pct(argmax.average_confidence)} safe={pct(safe.average_confidence_accepted)} />
                  <CompareRow label="Accuracy of accepted" argmax={pct(argmax.accuracy)} safe={pct(safe.selective_accuracy)} />
                  <CompareRow label="Wrong predictions accepted" argmax={int(argmax.incorrect)} safe={int(safe.incorrect_accepted)} />
                  <CompareRow label="Unsafe predictions prevented" argmax="0" safe={int(comparison.unsafe_predictions_prevented)} emphasis />
                  <CompareRow label="Correct rows sent to review" argmax="0" safe={int(safe.correct_flagged)} />
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-[12px] leading-relaxed text-ink-3">
              Standard argmax always produces a category. The safe decoder can abstain or flag a row when confidence is insufficient
              {comparison.error_reduction !== null && <>, cutting accepted errors by <span className="num text-ink-2">{pct(comparison.error_reduction)}</span></>}.
            </p>
          </Card>

          <div className="space-y-5 lg:col-span-6">
            <Card>
              <CardHeader title="Where the errors go" description="Share of all evaluated rows" />
              <CardBody>
                <OutcomeBars evaluation={evaluation} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Coverage vs accuracy" description="Effect of the confidence threshold at the current near-tie threshold" />
              <CardBody>
                <CoverageChart sweep={evaluation.sweep} current={evaluation.config.confidence_threshold} />
              </CardBody>
            </Card>
          </div>
        </div>
      </StaggerItem>

      {evaluation.scenarios.length > 0 && (
        <StaggerItem>
          <Card>
            <CardHeader title="Decisions by simulation scenario" description="How each injected kind of vector was classified" />
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-ink-3">
                    <th className="border-y border-line bg-sunken/60 px-5 py-2 font-medium">Scenario</th>
                    <th className="border-y border-line bg-sunken/60 px-3 py-2 text-right font-medium">Rows</th>
                    <th className="border-y border-line bg-sunken/60 px-3 py-2 text-right font-medium">Argmax accuracy</th>
                    <th className="w-[45%] border-y border-line bg-sunken/60 px-5 py-2 font-medium">Decoder status mix</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluation.scenarios.map((scenario) => (
                    <tr key={scenario.scenario} className="hover:bg-hover/40">
                      <td className="border-b border-line px-5 py-2.5 text-ink">{SCENARIO_LABEL[scenario.scenario] ?? humanize(scenario.scenario)}</td>
                      <td className="num border-b border-line px-3 py-2.5 text-right text-ink-2">{int(scenario.total)}</td>
                      <td className="num border-b border-line px-3 py-2.5 text-right text-ink-2">{pct(scenario.argmax_accuracy)}</td>
                      <td className="border-b border-line px-5 py-2.5">
                        <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-sunken">
                          {STATUS_ORDER.map((status) =>
                            scenario.status_counts[status] ? (
                              <motion.div
                                key={status}
                                title={`${STATUS_META[status].label}: ${scenario.status_counts[status]}`}
                                className={cn("h-full", STATUS_META[status].dot)}
                                initial={{ width: 0 }}
                                animate={{ width: `${(scenario.status_counts[status] / scenario.total) * 100}%` }}
                                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                              />
                            ) : null,
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-4 px-5 py-3 text-[11.5px] text-ink-3">
              {STATUS_ORDER.slice(0, 4).map((status) => (
                <span key={status} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-[3px]", STATUS_META[status].dot)} /> {STATUS_META[status].label}
                </span>
              ))}
            </div>
          </Card>
        </StaggerItem>
      )}

      <StaggerItem>
        <ul className="space-y-1 px-1 text-[12px] leading-relaxed text-ink-3">
          {evaluation.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      </StaggerItem>
    </Stagger>
  );
}

function AnalyticsView({ dataset }: { dataset: DatasetSummary }) {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "evaluation" ? "evaluation" : "distributions";
  const summary = useSummary(dataset.id);
  const evaluation = useEvaluation(dataset.id, tab === "evaluation");

  return (
    <>
      <PageHeader
        title="Analytics"
        meta={<span className="font-medium text-ink-2">{dataset.name}</span>}
        description="Distributions of the decoded dataset, and an evaluation of safe decoding against standard argmax."
        actions={
          <SegmentedControl<Tab>
            ariaLabel="Analytics view"
            value={tab}
            onChange={(value) => setParams(value === "evaluation" ? { tab: value } : {}, { replace: true })}
            options={[
              { value: "distributions", label: "Distributions" },
              { value: "evaluation", label: "Evaluation" },
            ]}
          />
        }
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
          {tab === "distributions" ? (
            summary.data ? (
              <Distributions dataset={dataset} summary={summary.data} />
            ) : summary.isError ? (
              <ErrorState error={summary.error} />
            ) : (
              <Card className="h-80" />
            )
          ) : evaluation.data ? (
            <Evaluation evaluation={evaluation.data} />
          ) : evaluation.isError ? (
            <ErrorState error={evaluation.error} />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i} className="h-24" />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export function AnalyticsPage() {
  const { active } = useActiveDataset();
  if (!active) {
    return (
      <>
        <PageHeader title="Analytics" description="Charts and evaluation metrics." />
        <NoDatasetState />
      </>
    );
  }
  if (!active.pipeline.has_results) {
    return (
      <>
        <PageHeader title="Analytics" description="Charts and evaluation metrics." />
        <PipelineIncompleteState dataset={active} />
      </>
    );
  }
  return <AnalyticsView key={active.id} dataset={active} />;
}
