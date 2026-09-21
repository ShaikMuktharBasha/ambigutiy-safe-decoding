import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Database, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadDropzone } from "@/components/datasets/UploadDropzone";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader, Stagger, StaggerItem } from "@/components/ui/Layout";
import { Dialog } from "@/components/ui/Overlay";
import { useDeleteDataset, useLoadDemo } from "@/hooks/mutations";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { cn } from "@/lib/cn";
import { int, relativeTime } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/rows";
import type { DatasetSummary } from "@/types/api";

export function DatasetsPage() {
  const navigate = useNavigate();
  const { datasets, activeId, setActiveId, isLoading } = useActiveDataset();
  const loadDemo = useLoadDemo();
  const remove = useDeleteDataset();
  const [pendingDelete, setPendingDelete] = useState<DatasetSummary | null>(null);

  return (
    <>
      <PageHeader
        title="Datasets"
        description="Upload categorical data as CSV or XLSX, or load the synthetic product catalogue to explore the full pipeline."
        actions={
          <Button
            variant="primary"
            icon={<Sparkles />}
            loading={loadDemo.isPending}
            onClick={() => loadDemo.mutate({}, { onSuccess: (d) => navigate(`/datasets/${d.id}`) })}
          >
            Load demo
          </Button>
        }
      />

      <Stagger className="space-y-6">
        <StaggerItem>
          <UploadDropzone onUploaded={(id) => navigate(`/datasets/${id}`)} />
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader title="Your datasets" description={`${datasets.length} dataset${datasets.length === 1 ? "" : "s"} in this workspace`} />
            {isLoading ? (
              <div className="space-y-3 px-5 pb-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : datasets.length === 0 ? (
              <EmptyState
                icon={<Database />}
                title="No datasets yet"
                description="Drop a file above, or load the demo to see safe decoding end to end."
              />
            ) : (
              <ul className="border-t border-line">
                <AnimatePresence initial={false}>
                  {datasets.map((dataset) => {
                    const isActive = dataset.id === activeId;
                    return (
                      <motion.li
                        key={dataset.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden border-b border-line last:border-b-0"
                      >
                        <div
                          className={cn(
                            "flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-hover/40",
                            isActive && "bg-accent-soft/25",
                          )}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => navigate(`/datasets/${dataset.id}`)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-[14px] font-medium text-ink">{dataset.name}</span>
                              <Badge tone={dataset.source === "demo" ? "accent" : "neutral"}>
                                {dataset.source === "demo" ? "Demo" : "Upload"}
                              </Badge>
                              {isActive && <Badge tone="outline">Active</Badge>}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-2 text-[12.5px] text-ink-3">
                              <span className="num">
                                {int(dataset.row_count)} × {int(dataset.column_count)}
                              </span>
                              {dataset.target_column && (
                                <>
                                  <span>·</span>
                                  <span>
                                    {dataset.target_column} ({dataset.category_count} categories)
                                  </span>
                                </>
                              )}
                              <span>·</span>
                              <span>{STAGE_LABEL[dataset.pipeline.stage]}</span>
                              <span>·</span>
                              <span>added {relativeTime(dataset.created_at)}</span>
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5">
                            {!isActive && (
                              <Button size="sm" variant="ghost" onClick={() => setActiveId(dataset.id)}>
                                Set active
                              </Button>
                            )}
                            <Button size="sm" variant="secondary" onClick={() => navigate(`/datasets/${dataset.id}`)}>
                              Open <ArrowRight />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="danger"
                              aria-label={`Delete ${dataset.name}`}
                              onClick={() => setPendingDelete(dataset)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </Card>
        </StaggerItem>
      </Stagger>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete dataset?"
        description={
          <>
            <span className="font-medium text-ink">{pendingDelete?.name}</span> and its probability vectors, results and
            audit log will be permanently removed. Export anything you need first.
          </>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-rejected hover:bg-rejected-ink"
              loading={remove.isPending}
              onClick={() =>
                pendingDelete && remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })
              }
            >
              Delete dataset
            </Button>
          </>
        }
      />
    </>
  );
}
