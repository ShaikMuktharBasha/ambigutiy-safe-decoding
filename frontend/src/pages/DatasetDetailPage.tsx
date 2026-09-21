import { ArrowRight, Binary, ChevronLeft, Inbox, Play } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ColumnPicker } from "@/components/datasets/ColumnPicker";
import { DataPreviewTable } from "@/components/datasets/DataPreviewTable";
import { EncodingTable } from "@/components/datasets/EncodingTable";
import { PipelineSteps } from "@/components/datasets/PipelineSteps";
import { ProbabilitySourcePanel } from "@/components/datasets/ProbabilitySourcePanel";
import { ExportMenu } from "@/components/decoding/ExportMenu";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AnimatedNumber, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader, Stagger, StaggerItem } from "@/components/ui/Layout";
import { useDecodeDataset } from "@/hooks/mutations";
import { useDataset, useSettings, useSummary } from "@/hooks/queries";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { cn } from "@/lib/cn";
import { humanize, int, relativeTime } from "@/lib/format";
import { MODE_META, STATUS_ORDER } from "@/lib/status";
import type { DatasetDetail } from "@/types/api";

function Step({ n, title, description, children, disabled, actions }: { n: number; title: string; description?: string; children: ReactNode; disabled?: boolean; actions?: ReactNode }) {
  return (
    <Card className={cn("transition-opacity", disabled && "opacity-60")}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="num flex size-5 items-center justify-center rounded-md bg-sunken text-[11px] text-ink-2">{n}</span>
            {title}
          </span>
        }
        description={description}
        actions={actions}
      />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">{children}</p>;
}

function DecodeStep({ dataset }: { dataset: DatasetDetail }) {
  const settings = useSettings();
  const decode = useDecodeDataset(dataset.id);
  const summary = useSummary(dataset.pipeline.has_results ? dataset.id : null);
  const navigate = useNavigate();
  const config = settings.data?.decode;

  if (!dataset.pipeline.has_probabilities) return <Placeholder>Generate probability vectors to enable decoding.</Placeholder>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-canvas/60 px-4 py-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink-2">
          <span>
            Mode <span className="font-medium text-ink">{config ? MODE_META[config.mode].label : "—"}</span>
          </span>
          <span>
            τ <span className="num text-ink">{config?.confidence_threshold.toFixed(2)}</span>
          </span>
          <span>
            δ <span className="num text-ink">{config?.near_tie_threshold.toFixed(3)}</span>
          </span>
          <span>
            top-k <span className="num text-ink">{config?.top_k}</span>
          </span>
          <Link to="/settings" className="text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
            change
          </Link>
        </div>
        <Button variant="primary" icon={<Play />} loading={decode.isPending} disabled={!config} onClick={() => config && decode.mutate(config)}>
          {dataset.pipeline.has_results ? "Re-run safe decoding" : "Run safe decoding"}
        </Button>
      </div>

      {summary.data && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {STATUS_ORDER.map((status) => (
            <span key={status} className="flex items-center gap-2">
              <StatusBadge status={status} />
              <span className="num text-[15px] text-ink">
                <AnimatedNumber value={summary.data.counts[status]} />
              </span>
            </span>
          ))}
          <div className="ml-auto flex gap-2">
            <Button size="sm" icon={<Inbox />} onClick={() => navigate("/review")}>
              Review queue
            </Button>
            <Button size="sm" variant="primary" icon={<Binary />} onClick={() => navigate("/decoder")}>
              Open decoder
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DatasetDetailPage() {
  const { datasetId = "" } = useParams();
  const query = useDataset(datasetId);
  const { activeId, setActiveId } = useActiveDataset();
  const navigate = useNavigate();
  const dataset = query.data;

  useEffect(() => {
    if (dataset && activeId !== dataset.id) setActiveId(dataset.id);
  }, [dataset, activeId, setActiveId]);

  if (query.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-72" />
        <Card className="h-24" />
        <Card className="h-64" />
      </div>
    );
  }
  if (query.isError || !dataset) {
    return (
      <ErrorState
        error={query.error}
        action={
          <Button size="sm" onClick={() => navigate("/datasets")}>
            Back to datasets
          </Button>
        }
      />
    );
  }

  const p = dataset.pipeline;
  const stats = [
    { label: "Rows", value: dataset.row_count },
    { label: "Columns", value: dataset.column_count },
    { label: "Categorical columns", value: dataset.categorical_columns.length },
    { label: "Categories", value: dataset.encoding?.categories.length ?? 0 },
  ];

  return (
    <>
      <PageHeader
        meta={
          <>
            <Link to="/datasets" className="inline-flex items-center gap-0.5 hover:text-ink">
              <ChevronLeft className="size-3.5" /> Datasets
            </Link>
            <Badge tone={dataset.source === "demo" ? "accent" : "neutral"}>{dataset.source === "demo" ? "Demo" : "Upload"}</Badge>
            {dataset.filename && <span className="num">{dataset.filename}</span>}
            <span>added {relativeTime(dataset.created_at)}</span>
          </>
        }
        title={dataset.name}
        description="Pick the categorical column, inspect its one-hot encoding, attach probability vectors, then run the safe decoder."
        actions={
          <>
            <ExportMenu datasetId={dataset.id} decoded={p.has_results} />
            {p.has_results && (
              <Button variant="primary" icon={<Binary />} onClick={() => navigate("/decoder")}>
                Open decoder
              </Button>
            )}
          </>
        }
      />

      <Stagger className="space-y-5">
        <StaggerItem>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="px-4 py-3">
                <div className="text-[12px] text-ink-3">{stat.label}</div>
                <div className="num mt-1 text-[22px] leading-none text-ink">
                  <AnimatedNumber value={stat.value} />
                </div>
              </Card>
            ))}
          </div>
        </StaggerItem>

        <StaggerItem>
          <Card className="px-5 py-4">
            <PipelineSteps dataset={dataset} />
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Step n={1} title="Select the categorical column" description="Columns are profiled automatically; low-cardinality text columns are suggested.">
            <ColumnPicker key={`${dataset.target_column}-${dataset.encoding?.order}`} dataset={dataset} />
          </Step>
        </StaggerItem>

        <StaggerItem>
          <Step
            n={2}
            title="One-hot encoding"
            description={dataset.encoding ? `Category → index → vector mapping for "${dataset.target_column}"` : undefined}
            disabled={!dataset.encoding}
          >
            {dataset.encoding ? <EncodingTable encoding={dataset.encoding} /> : <Placeholder>Encode a column to see its mapping.</Placeholder>}
          </Step>
        </StaggerItem>

        <StaggerItem>
          <Step
            n={3}
            title="Probability vectors"
            description={
              p.has_probabilities
                ? `Current source: ${humanize(p.probability_source)} · generated ${relativeTime(p.probability_meta.generated_at)}`
                : "Simulate realistic vectors, import them from numeric columns, or score rows with Gemini."
            }
            disabled={!p.has_encoding}
          >
            {p.has_encoding ? (
              <ProbabilitySourcePanel key={dataset.target_column ?? "none"} dataset={dataset} />
            ) : (
              <Placeholder>Encode a column before attaching probability vectors.</Placeholder>
            )}
          </Step>
        </StaggerItem>

        <StaggerItem>
          <Step n={4} title="Safe decoding" description="Confidence check, near-tie check and ranking for every row." disabled={!p.has_probabilities}>
            <DecodeStep dataset={dataset} />
          </Step>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader
              title="Data preview"
              description={`First ${Math.min(dataset.preview.length, dataset.row_count)} of ${int(dataset.row_count)} rows`}
              actions={
                p.has_results ? (
                  <Button size="xs" variant="ghost" onClick={() => navigate("/decoder")}>
                    Decoded results <ArrowRight />
                  </Button>
                ) : null
              }
            />
            <CardBody>
              <DataPreviewTable dataset={dataset} />
            </CardBody>
          </Card>
        </StaggerItem>
      </Stagger>
    </>
  );
}
