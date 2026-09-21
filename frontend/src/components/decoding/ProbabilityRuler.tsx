import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";
import { STATUS_META } from "@/lib/status";
import type { DecodeStatus } from "@/types/api";

interface Point {
  category: string;
  probability: number;
}

const spring = { type: "spring", stiffness: 240, damping: 30, mass: 0.8 } as const;

function labelAlign(p: number) {
  if (p < 0.1) return "translate-x-0";
  if (p > 0.9) return "-translate-x-full";
  return "-translate-x-1/2";
}

/**
 * The signature visual: every category placed on a 0–1 scale, with the
 * confidence threshold (τ) and the near-tie window (δ below the top
 * probability) drawn in. It shows *why* a decision was made.
 */
export function ProbabilityRuler({
  entries,
  top1,
  top2,
  threshold,
  nearTie,
  nearTieFlagged,
  status,
  gap,
  showLegend = true,
  className,
}: {
  entries: Point[];
  top1: Point;
  top2: Point | null;
  threshold: number;
  nearTie: number;
  nearTieFlagged: boolean;
  status: DecodeStatus;
  gap: number;
  showLegend?: boolean;
  className?: string;
}) {
  const windowStart = Math.max(0, top1.probability - nearTie);
  const statusColor = STATUS_META[status].color;
  const others = entries.filter((e) => e.category !== top1.category && e.category !== top2?.category);

  return (
    <div className={cn("select-none", className)}>
      <div className="relative h-5">
        <motion.div
          className={cn("absolute top-0 whitespace-nowrap text-[12px] font-medium text-ink", labelAlign(top1.probability))}
          initial={{ left: "0%" }}
          animate={{ left: `${top1.probability * 100}%` }}
          transition={spring}
        >
          {top1.category} <span className="num font-normal text-ink-3">{pct(top1.probability)}</span>
        </motion.div>
      </div>

      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "absolute top-1/2 w-px -translate-y-1/2 bg-line-strong",
              i % 5 === 0 ? "h-3.5" : "h-2",
            )}
            style={{ left: `${i * 10}%` }}
          />
        ))}

        <motion.div
          className={cn(
            "hatch absolute top-1/2 h-5 -translate-y-1/2 rounded-[3px]",
            nearTieFlagged ? "bg-ambiguous-soft text-ambiguous/35" : "bg-sunken/60 text-ink-4/35",
          )}
          initial={{ left: "0%", width: "0%" }}
          animate={{ left: `${windowStart * 100}%`, width: `${(top1.probability - windowStart) * 100}%` }}
          transition={spring}
        />

        {others.map((entry) => (
          <motion.span
            key={entry.category}
            title={`${entry.category} ${pct(entry.probability)}`}
            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-4"
            initial={{ left: "0%" }}
            animate={{ left: `${entry.probability * 100}%` }}
            transition={spring}
          />
        ))}

        <motion.div
          className="absolute inset-y-0 w-0 border-l-[1.5px] border-accent"
          initial={false}
          animate={{ left: `${threshold * 100}%` }}
          transition={spring}
        >
          <span className="num absolute -top-1 left-1 text-[10px] font-semibold text-accent">τ</span>
        </motion.div>

        {top2 && (
          <motion.span
            title={`${top2.category} ${pct(top2.probability)}`}
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-2 bg-surface"
            initial={{ left: "0%" }}
            animate={{ left: `${top2.probability * 100}%` }}
            transition={spring}
          />
        )}
        <motion.span
          title={`${top1.category} ${pct(top1.probability)}`}
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[2.5px] ring-surface"
          style={{ backgroundColor: statusColor }}
          initial={{ left: "0%" }}
          animate={{ left: `${top1.probability * 100}%` }}
          transition={spring}
        />
      </div>

      <div className="relative h-5">
        {top2 && (
          <motion.div
            className={cn("absolute top-0.5 whitespace-nowrap text-[12px] text-ink-2", labelAlign(top2.probability))}
            initial={{ left: "0%" }}
            animate={{ left: `${top2.probability * 100}%` }}
            transition={spring}
          >
            {top2.category} <span className="num text-ink-3">{pct(top2.probability)}</span>
          </motion.div>
        )}
      </div>

      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0 border-l-[1.5px] border-accent" />
            Confidence threshold τ <span className="num text-ink-2">{threshold.toFixed(2)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "hatch h-2.5 w-4 rounded-[2px]",
                nearTieFlagged ? "bg-ambiguous-soft text-ambiguous/40" : "bg-sunken text-ink-4/50",
              )}
            />
            Near-tie window δ <span className="num text-ink-2">{nearTie.toFixed(2)}</span>
          </span>
          <span>
            Gap <span className="num text-ink-2">{pct(gap)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export function ConfidenceMeter({
  value,
  threshold,
  status,
}: {
  value: number;
  threshold: number;
  status: DecodeStatus;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-1.5 w-14 rounded-full bg-sunken ring-1 ring-inset ring-line">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: STATUS_META[status].color }}
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
        <span
          className="absolute -top-[3px] h-3 w-px bg-accent"
          style={{ left: `${threshold * 100}%` }}
          aria-hidden
        />
      </div>
      <span className="num text-[12.5px] text-ink">{pct(value)}</span>
    </div>
  );
}

export function ProbabilityList({
  items,
  highlight,
  secondary,
  ranked = false,
}: {
  items: Point[];
  highlight?: string | null;
  secondary?: string | null;
  ranked?: boolean;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => {
        const isTop = item.category === highlight;
        const isSecond = item.category === secondary;
        return (
          <li key={item.category} className="grid grid-cols-[minmax(0,7.5rem)_1fr_3.5rem] items-center gap-3 text-[12.5px]">
            <span className={cn("flex min-w-0 items-center gap-2 truncate", isTop ? "font-medium text-ink" : "text-ink-2")}>
              {ranked && <span className="num w-3 text-[11px] text-ink-4">{index + 1}</span>}
              <span className="truncate">{item.category}</span>
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-sunken">
              <motion.span
                className={cn("block h-full rounded-full", isTop ? "bg-ink" : isSecond ? "bg-ink-3" : "bg-line-strong")}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(item.probability * 100, 0.5)}%` }}
                transition={{ duration: 0.55, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="num text-right text-ink">{pct(item.probability)}</span>
          </li>
        );
      })}
    </ul>
  );
}
