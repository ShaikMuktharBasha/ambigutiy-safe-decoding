import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Overlay";
import { useSelectColumn } from "@/hooks/mutations";
import { cn } from "@/lib/cn";
import { int } from "@/lib/format";
import type { CategoryOrder, ColumnProfile, DatasetDetail } from "@/types/api";

function ColumnCard({
  column,
  selected,
  suggested,
  current,
  onSelect,
}: {
  column: ColumnProfile;
  selected: boolean;
  suggested: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      layout
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "relative w-full rounded-xl border bg-surface p-3.5 text-left transition-[border-color,box-shadow] duration-150",
        selected ? "border-ink shadow-[0_0_0_3px_rgb(30_29_26/0.06)]" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-ink">{column.name}</div>
          <div className="mt-0.5 text-[12px] text-ink-3">
            {column.dtype} · {int(column.unique_count)} distinct
            {column.null_count > 0 && ` · ${int(column.null_count)} empty`}
          </div>
        </div>
        <span
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
            selected ? "border-ink bg-ink" : "border-line-strong",
          )}
        >
          {selected && <motion.span layoutId="column-dot" className="size-1.5 rounded-full bg-canvas" />}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {column.sample_values.slice(0, 4).map((value) => (
          <span key={value} className="max-w-[9rem] truncate rounded-md bg-sunken px-1.5 py-0.5 text-[11px] text-ink-2">
            {value}
          </span>
        ))}
      </div>
      {(suggested || current) && (
        <div className="mt-2.5 flex gap-1">
          {current && <Badge tone="neutral">Encoded</Badge>}
          {suggested && !current && <Badge tone="accent">Suggested</Badge>}
        </div>
      )}
    </motion.button>
  );
}

export function ColumnPicker({ dataset }: { dataset: DatasetDetail }) {
  const select = useSelectColumn(dataset.id);
  const [column, setColumn] = useState(
    dataset.target_column ?? dataset.suggested_column ?? dataset.categorical_columns[0] ?? dataset.columns[0]?.name ?? "",
  );
  const [order, setOrder] = useState<CategoryOrder>(dataset.encoding?.order ?? "appearance");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showOther, setShowOther] = useState(false);

  const categorical = dataset.columns.filter((c) => c.is_categorical);
  const other = dataset.columns.filter((c) => !c.is_categorical);
  const unchanged = dataset.target_column === column && dataset.encoding?.order === order;

  const run = () => select.mutate({ column, order }, { onSettled: () => setConfirmOpen(false) });
  const submit = () => (dataset.pipeline.has_probabilities && !unchanged ? setConfirmOpen(true) : run());

  return (
    <div>
      {categorical.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">
          No categorical columns were detected automatically. Choose one of the columns below to try encoding it.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Categorical column" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {categorical.map((c) => (
            <ColumnCard
              key={c.name}
              column={c}
              selected={column === c.name}
              suggested={dataset.suggested_column === c.name}
              current={dataset.target_column === c.name}
              onSelect={() => setColumn(c.name)}
            />
          ))}
        </div>
      )}

      {other.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowOther((v) => !v)}
            className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", showOther && "rotate-180")} />
            {showOther ? "Hide" : "Show"} {other.length} non-categorical column{other.length === 1 ? "" : "s"}
          </button>
          <AnimatePresence initial={false}>
            {showOther && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 overflow-hidden rounded-lg border border-line"
              >
                {other.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-[12.5px] last:border-b-0">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="other-column"
                        className="accent-ink"
                        checked={column === c.name}
                        onChange={() => setColumn(c.name)}
                      />
                      <span className="truncate text-ink">{c.name}</span>
                      <span className="text-ink-4">{c.dtype}</span>
                    </label>
                    <span className="shrink-0 text-ink-3">{c.categorical_reason}</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-3">Category order</span>
          <Select value={order} onChange={(e) => setOrder(e.target.value as CategoryOrder)} className="w-52">
            <option value="appearance">First appearance</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="frequency">Most frequent first</option>
          </Select>
        </label>
        <Button variant="primary" onClick={submit} loading={select.isPending} disabled={!column || unchanged}>
          {dataset.target_column ? (unchanged ? "Column encoded" : "Re-encode column") : "Encode column"}
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Re-encode this dataset?"
        description="Changing the categorical column or category order discards the current probability vectors, decode results and manual decisions. The audit log is kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={select.isPending} onClick={run}>
              Re-encode
            </Button>
          </>
        }
      />
    </div>
  );
}
