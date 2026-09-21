import { Check, ChevronsUpDown, Database, Menu, Settings, Sparkles, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { MenuItem, Popover } from "@/components/ui/Overlay";
import { useLoadDemo } from "@/hooks/mutations";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { cn } from "@/lib/cn";
import { int } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/rows";
import type { PipelineStage } from "@/types/api";

const STAGE_DOT: Record<PipelineStage, string> = {
  uploaded: "bg-ink-4",
  column_selected: "bg-uncertain",
  probabilities_ready: "bg-accent",
  decoded: "bg-safe",
};

function DatasetSwitcher() {
  const { datasets, active, setActiveId } = useActiveDataset();
  const loadDemo = useLoadDemo();
  const navigate = useNavigate();

  return (
    <Popover
      align="end"
      className="w-[19rem]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            "flex h-9 max-w-[15rem] items-center gap-2 rounded-lg border border-line bg-surface pl-2.5 pr-2 text-[13px] shadow-card transition-colors hover:border-line-strong sm:max-w-[18rem]",
            open && "border-line-strong",
          )}
        >
          <Database className="size-3.5 shrink-0 text-ink-3" />
          <span className="truncate text-ink">{active ? active.name : "Select dataset"}</span>
          {active && (
            <span
              className={cn("size-1.5 shrink-0 rounded-full", STAGE_DOT[active.pipeline.stage])}
              title={STAGE_LABEL[active.pipeline.stage]}
            />
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-ink-4">Datasets</div>
          <div className="scrollbar-thin max-h-72 overflow-y-auto">
            {datasets.length === 0 && <p className="px-2.5 py-3 text-[13px] text-ink-3">No datasets yet.</p>}
            {datasets.map((dataset) => (
              <MenuItem
                key={dataset.id}
                onClick={() => {
                  setActiveId(dataset.id);
                  close();
                }}
                trailing={dataset.id === active?.id ? <Check className="!text-accent" /> : null}
              >
                <div className="truncate text-ink">{dataset.name}</div>
                <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                  <span className={cn("size-1.5 rounded-full", STAGE_DOT[dataset.pipeline.stage])} />
                  {int(dataset.row_count)} rows · {STAGE_LABEL[dataset.pipeline.stage]}
                </div>
              </MenuItem>
            ))}
          </div>
          <div className="my-1 h-px bg-line" />
          <MenuItem
            icon={<Sparkles />}
            disabled={loadDemo.isPending}
            onClick={() => loadDemo.mutate({}, { onSuccess: () => close() })}
          >
            {loadDemo.isPending ? "Loading demo…" : "Load demo dataset"}
          </MenuItem>
          <MenuItem
            icon={<Upload />}
            onClick={() => {
              close();
              navigate("/datasets");
            }}
          >
            Upload dataset
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenMenu} aria-label="Open navigation">
          <Menu />
        </Button>
        <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium tracking-[-0.005em] text-ink">
          <span className="hidden sm:inline">Ambiguity-Safe Inverse Decoding</span>
          <span className="sm:hidden">ASI</span>
        </div>
        <DatasetSwitcher />
        <Button variant="secondary" size="icon" onClick={() => navigate("/settings")} aria-label="Settings">
          <Settings />
        </Button>
      </div>
    </header>
  );
}
