import { motion } from "motion/react";
import { ArrowRight, Binary, Inbox, Loader2, RefreshCw, ServerCrash, Sparkles, Upload } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiBase } from "@/api/client";
import { ApiConnector } from "@/components/common/ApiConnector";
import { OutcomeBars, StatusDonut } from "@/components/charts/Charts";
import { PipelineIncompleteState } from "@/components/common/Guards";
import { DecisionFlow } from "@/components/decoding/DecisionFlow";
import { ExportMenu } from "@/components/decoding/ExportMenu";
import { ConfidenceMeter } from "@/components/decoding/ProbabilityRuler";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AnimatedNumber, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader, Stagger, StaggerItem } from "@/components/ui/Layout";
import { useLoadDemo } from "@/hooks/mutations";
import { useEvaluation, useSummary } from "@/hooks/queries";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { cn } from "@/lib/cn";
import { int, pct, relativeTime } from "@/lib/format";
import { rowContextLabel } from "@/lib/rows";
import { MODE_META, STATUS_META } from "@/lib/status";
import type { DecodeStatus, DatasetSummary } from "@/types/api";

function Landing() {
  const loadDemo = useLoadDemo();
  const navigate = useNavigate();
  return (
    <div className="grid min-h-[calc(100vh-11rem)] items-center gap-10 py-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
      <Stagger>
        <StaggerItem>
          <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-card">
            <span className="num text-[12px] text-ink-3">p = [0.48, 0.47, 0.05]</span>
            <span className="text-ink-4">→</span>
            <span className="num text-[12px] text-rejected-ink line-through decoration-rejected/50">argmax: Electronics</span>
          </div>
        </StaggerItem>
        <StaggerItem>
          <h1 className="font-serif text-[36px] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-[48px] lg:text-[44px] xl:text-[54px]">
            <span className="whitespace-nowrap">Ambiguity-Safe</span>
            <br />
            <span className="whitespace-nowrap">Inverse Decoding</span>
          </h1>
        </StaggerItem>
        <StaggerItem>
          <p className="mt-5 font-serif text-[22px] italic leading-snug text-accent-ink sm:text-[24px]">
            Stop blindly trusting argmax.
          </p>
        </StaggerItem>
        <StaggerItem>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-2">
            Detect low-confidence and near-tie categorical predictions before they silently enter your pipeline.
          </p>
        </StaggerItem>
        <StaggerItem>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <Button variant="primary" size="md" icon={<Sparkles />} loading={loadDemo.isPending} onClick={() => loadDemo.mutate({})}>
              Try Demo
            </Button>
            <Button size="md" icon={<Upload />} onClick={() => navigate("/datasets")}>
              Upload Dataset
            </Button>
          </div>
          <p className="mt-4 text-xs text-ink-4">The demo runs fully offline: 300 synthetic products, no model or API key needed.</p>
        </StaggerItem>
      </Stagger>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <DecisionFlow />
      </motion.div>
    </div>
  );
}

function StatCard({
  label,
  value,
  format,
  sub,
  status,
  href,
}: {
  label: string;
  value: number;
  format?: (v: number) => string;
  sub?: ReactNode;
  status?: DecodeStatus;
  href?: string;
}) {
  const meta = status ? STATUS_META[status] : null;
  const Icon = meta?.icon;
  const body = (
    <Card className={cn("h-full p-4 transition-[border-color,transform] duration-200", href && "hover:-translate-y-0.5 hover:border-line-strong")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] text-ink-3">{label}</span>
        {Icon && (
          <span className={cn("flex size-6 items-center justify-center rounded-md", meta.soft)}>
            <Icon className={cn("size-3.5", meta.text)} />
          </span>
        )}
      </div>
      <div className="num mt-2 text-[28px] leading-none tracking-[-0.03em] text-ink">
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub && <div className="mt-2 text-[12px] text-ink-3">{sub}</div>}
    </Card>
  );
  return href ? (
    <Link to={href} className="block rounded-card">
      {body}
    </Link>
  ) : (
    body
  );
}

function DecodedDashboard({ dataset }: { dataset: DatasetSummary }) {
  const summary = useSummary(dataset.id);
  const evaluation = useEvaluation(dataset.id);
  const navigate = useNavigate();

  if (summary.isLoading) return <DashboardSkeleton />;
  if (summary.isError || !summary.data) return <ErrorState error={summary.error} />;
  const s = summary.data;
  const total = s.total_rows || 1;
  const config = s.config;

  return (
    <>
      <PageHeader
        title="Dashboard"
        meta={
          <>
            <span className="font-medium text-ink-2">{s.dataset_name}</span>
            <span>·</span>
            <span>{config ? `${MODE_META[config.mode].label} mode` : "Not decoded"}</span>
            <span>·</span>
            <span>decoded {relativeTime(s.decoded_at)}</span>
          </>
        }
        actions={
          <>
            <ExportMenu datasetId={dataset.id} decoded />
            <Button variant="primary" icon={<Binary />} onClick={() => navigate("/decoder")}>
              Open decoder
            </Button>
          </>
        }
      />

      <Stagger className="space-y-5">
        <StaggerItem>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total rows processed" value={s.total_rows} sub={`${int(s.reviewed)} manually reviewed`} />
            <StatCard label="Safe predictions" value={s.counts.SAFE} status="SAFE" sub={`${pct(s.counts.SAFE / total)} decoded automatically`} href="/decoder?status=SAFE" />
            <StatCard label="Uncertain predictions" value={s.counts.UNCERTAIN} status="UNCERTAIN" sub={`${pct(s.counts.UNCERTAIN / total)} of rows`} href="/decoder?status=UNCERTAIN" />
            <StatCard label="Ambiguous predictions" value={s.counts.AMBIGUOUS} status="AMBIGUOUS" sub={`${pct(s.counts.AMBIGUOUS / total)} near ties`} href="/decoder?status=AMBIGUOUS" />
            <StatCard label="Rejected predictions" value={s.counts.REJECTED} status="REJECTED" sub={`${pct(s.counts.REJECTED / total)} below threshold`} href="/decoder?status=REJECTED" />
            <StatCard
              label="Average confidence"
              value={s.average_confidence ?? 0}
              format={(v) => pct(v)}
              sub={`median ${pct(s.median_confidence)}`}
            />
            <StatCard
              label="Confidence threshold"
              value={config?.confidence_threshold ?? 0}
              format={(v) => v.toFixed(2)}
              sub={config ? `${MODE_META[config.mode].label} mode · top-${config.top_k}` : undefined}
            />
            <StatCard label="Near-tie threshold" value={config?.near_tie_threshold ?? 0} format={(v) => v.toFixed(3)} sub="minimum top-1 − top-2 gap" />
          </div>
        </StaggerItem>

        {s.needs_review > 0 && (
          <StaggerItem>
            <Link
              to="/review"
              className="group flex flex-wrap items-center gap-3 rounded-card border border-accent/25 bg-accent-soft/60 px-4 py-3 transition-colors hover:bg-accent-soft"
            >
              <Inbox className="size-4 text-accent-ink" />
              <span className="text-[13.5px] text-accent-ink">
                <span className="num font-semibold">{int(s.needs_review)}</span> predictions need a human decision before they enter the pipeline.
              </span>
              <span className="ml-auto flex items-center gap-1 text-[13px] font-medium text-accent-ink">
                Open review queue <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </StaggerItem>
        )}

        <StaggerItem>
          <div className="grid gap-5 lg:grid-cols-12">
            <Card className="lg:col-span-5">
              <CardHeader title="Prediction status distribution" description="Current status of every decoded row" />
              <CardBody>
                <StatusDonut counts={s.counts} total={s.total_rows} />
              </CardBody>
            </Card>
            <Card className="lg:col-span-7">
              <CardHeader
                title="Argmax vs ambiguity-safe decoding"
                description="Original values treated as ground truth"
                actions={
                  <Button size="xs" variant="ghost" onClick={() => navigate("/analytics?tab=evaluation")}>
                    Full evaluation <ArrowRight />
                  </Button>
                }
              />
              <CardBody>
                {evaluation.data ? (
                  <>
                    <div className="mb-6 grid grid-cols-3 gap-3">
                      <div>
                        <div className="num text-[24px] leading-none text-accent-ink">
                          <AnimatedNumber value={evaluation.data.comparison.unsafe_predictions_prevented} />
                        </div>
                        <div className="mt-1 text-[12px] text-ink-3">unsafe predictions prevented</div>
                      </div>
                      <div>
                        <div className="num text-[24px] leading-none text-ink">
                          <AnimatedNumber value={evaluation.data.safe.selective_accuracy ?? 0} format={(v) => pct(v)} />
                        </div>
                        <div className="mt-1 text-[12px] text-ink-3">
                          accuracy of accepted <span className="text-ink-4">vs {pct(evaluation.data.argmax.accuracy)}</span>
                        </div>
                      </div>
                      <div>
                        <div className="num text-[24px] leading-none text-ink">
                          <AnimatedNumber value={evaluation.data.safe.coverage ?? 0} format={(v) => pct(v)} />
                        </div>
                        <div className="mt-1 text-[12px] text-ink-3">rows decoded automatically</div>
                      </div>
                    </div>
                    <OutcomeBars evaluation={evaluation.data} />
                  </>
                ) : evaluation.isError ? (
                  <ErrorState error={evaluation.error} />
                ) : (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-2/3" />
                    <Skeleton className="h-3.5" />
                    <Skeleton className="h-3.5" />
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader
              title="Recent decoding activity"
              description="Latest manual decisions first, then rows from the most recent run"
              actions={
                <Button size="xs" variant="ghost" onClick={() => navigate("/decoder")}>
                  View all rows <ArrowRight />
                </Button>
              }
            />
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-ink-3">
                    {["Row", "Prediction", "Confidence", "Status", "Top alternative", "Gap"].map((h) => (
                      <th key={h} className="border-y border-line bg-sunken/60 px-3 py-2 font-medium first:pl-5 last:pr-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.recent.map((row, i) => (
                    <motion.tr
                      key={row.row_id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.03 }}
                      className="transition-colors hover:bg-hover/40"
                    >
                      <td className="border-b border-line px-3 py-2.5 pl-5">
                        <span className="num text-ink-3">#{row.row_id}</span>
                        <span className="ml-2 hidden text-ink-3 xl:inline">{rowContextLabel(row, s.target_column)}</span>
                      </td>
                      <td className="border-b border-line px-3 py-2.5 font-medium text-ink">
                        {row.final_value ?? <span className="font-normal italic text-ink-4">{row.manually_reviewed ? "rejected" : "abstained"}</span>}
                      </td>
                      <td className="border-b border-line px-3 py-2.5">
                        <ConfidenceMeter value={row.confidence} threshold={config?.confidence_threshold ?? 0.75} status={row.computed_status} />
                      </td>
                      <td className="border-b border-line px-3 py-2.5">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="border-b border-line px-3 py-2.5 text-ink-2">
                        {row.top_2 ?? "—"} <span className="num text-ink-3">{pct(row.top_2_probability)}</span>
                      </td>
                      <td className="num border-b border-line px-3 py-2.5 pr-5 text-ink-2">{pct(row.gap)}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </StaggerItem>
      </Stagger>
    </>
  );
}

function DashboardSkeleton() {
  const [showWakingNotice, setShowWakingNotice] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowWakingNotice(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-5">
      {showWakingNotice && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-accent/25 bg-accent-soft/40 px-4 py-3 text-xs text-accent-ink shadow-sm"
        >
          <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
          <div>
            <span className="font-semibold">Connecting to backend at {getApiBase()}...</span>{" "}
            <span className="text-ink-3">
              Render free tier backend instances take ~30–45s to wake up on initial visit. Automatically establishing connection...
            </span>
          </div>
        </motion.div>
      )}
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Card key={i} className="space-y-3 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </Card>
        ))}
      </div>
      <Card className="h-72" />
    </div>
  );
}

export function DashboardPage() {
  const { active, datasets, isLoading, isError } = useActiveDataset();

  if (isLoading) return <DashboardSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 pt-6">
        <div className="flex flex-col gap-3 rounded-xl border border-rejected/25 bg-rejected-soft/30 p-4 text-xs text-ink sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-rejected-ink">
              Could not reach backend at <code className="num rounded bg-sunken px-1.5 py-0.5">{getApiBase()}</code>
            </p>
            <p className="mt-1 text-ink-3">
              If the Render instance is waking up from sleep, retry in a few seconds or verify the URL below.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.location.reload()}
            icon={<RefreshCw className="size-3.5" />}
          >
            Retry Connection
          </Button>
        </div>

        <ApiConnector />

        <Card>
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <ServerCrash className="mb-3 size-6 text-rejected-ink" />
            <h2 className="text-[15px] font-semibold text-ink">Running Locally?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              If running on your machine, start the FastAPI server in the terminal:
            </p>
            <code className="num mt-3 rounded-lg bg-sunken px-3 py-2 text-[12.5px] text-ink">
              cd backend && uvicorn app.main:app --reload
            </code>
          </div>
        </Card>
      </div>
    );
  }
  if (datasets.length === 0) return <Landing />;
  if (!active) return <DashboardSkeleton />;
  if (!active.pipeline.has_results) {
    return (
      <>
        <PageHeader title="Dashboard" description={`${active.name} isn't decoded yet.`} />
        <PipelineIncompleteState dataset={active} />
      </>
    );
  }
  return <DecodedDashboard key={active.id} dataset={active} />;
}
