import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/cn";
import { int, pct } from "@/lib/format";
import { CHART_INK, STATUS_META, STATUS_ORDER } from "@/lib/status";
import type { CategoryCount, DecodeStatus, EvaluationOut, HistogramBin, StatusCounts, SweepPoint } from "@/types/api";

const MONO = "Geist Mono Variable, ui-monospace, monospace";
const SANS = "Geist Variable, ui-sans-serif, system-ui, sans-serif";
const AXIS_TICK = { fontSize: 11, fill: CHART_INK.ink3, fontFamily: MONO };

interface TipDatum<T> {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: T }>;
}

function TooltipShell({ title, rows }: { title: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <div className="mb-1.5 font-medium text-ink">{title}</div>
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-5 text-ink-2">
            <span className="flex items-center gap-1.5">
              {row.color && <span className="size-2 rounded-[2px]" style={{ background: row.color }} />}
              {row.label}
            </span>
            <span className="num text-ink">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Status donut */
export function StatusDonut({ counts, total }: { counts: StatusCounts; total: number }) {
  const [hovered, setHovered] = useState<DecodeStatus | null>(null);
  const data = STATUS_ORDER.map((status) => ({
    status,
    name: STATUS_META[status].label,
    value: counts[status] ?? 0,
    color: STATUS_META[status].color,
  }));
  const visible = data.filter((d) => d.value > 0);
  const focus = hovered ? data.find((d) => d.status === hovered) : null;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative size-[196px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible}
              dataKey="value"
              nameKey="name"
              innerRadius={66}
              outerRadius={94}
              paddingAngle={visible.length > 1 ? 1.2 : 0}
              cornerRadius={4}
              stroke={CHART_INK.surface}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              animationDuration={850}
              animationEasing="ease-out"
              onMouseEnter={(_: unknown, index: number) => setHovered(visible[index]?.status ?? null)}
              onMouseLeave={() => setHovered(null)}
            >
              {visible.map((d) => (
                <Cell
                  key={d.status}
                  fill={d.color}
                  fillOpacity={hovered && hovered !== d.status ? 0.3 : 1}
                  style={{ transition: "fill-opacity 160ms ease" }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <motion.span key={focus?.status ?? "total"} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="num text-[26px] leading-none text-ink">
            {int(focus ? focus.value : total)}
          </motion.span>
          <span className="mt-1 text-[11px] text-ink-3">{focus ? focus.name : "rows"}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-0.5">
        {data.map((d) => {
          const Icon = STATUS_META[d.status].icon;
          return (
            <li
              key={d.status}
              onMouseEnter={() => setHovered(d.status)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                hovered === d.status ? "bg-hover" : "hover:bg-hover/60",
                d.value === 0 && "opacity-50",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
                <Icon className={cn("size-3.5 shrink-0", STATUS_META[d.status].text)} />
                <span className="truncate text-ink-2">{d.name}</span>
              </span>
              <span className="num shrink-0 text-ink">
                {int(d.value)} <span className="text-ink-3">{total ? pct(d.value / total, 0) : "—"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------- Confidence histogram */
export function ConfidenceHistogram({ bins, threshold, height = 230 }: { bins: HistogramBin[]; threshold: number; height?: number }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={bins} margin={{ top: 22, right: 10, bottom: 0, left: -14 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={CHART_INK.line} />
          <XAxis dataKey="label" hide />
          <XAxis
            xAxisId="scale"
            type="number"
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(v: number) => v.toFixed(2)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART_INK.line }}
          />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            cursor={{ fill: CHART_INK.sunken, fillOpacity: 0.7 }}
            content={(props) => {
              const { active, payload } = props as unknown as TipDatum<HistogramBin>;
              const bin = payload?.[0]?.payload;
              if (!active || !bin) return null;
              return (
                <TooltipShell
                  title={`Confidence ${bin.start.toFixed(2)}–${bin.end.toFixed(2)}`}
                  rows={[
                    { label: "Rows", value: int(bin.count) },
                    { label: "Relative to τ", value: bin.below_threshold ? "below" : "at / above" },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} animationDuration={700} animationEasing="ease-out">
            {bins.map((bin) => (
              <Cell key={bin.label} fill={bin.below_threshold ? "#d6cfc1" : CHART_INK.ink2} />
            ))}
          </Bar>
          <ReferenceLine
            xAxisId="scale"
            x={threshold}
            stroke={CHART_INK.accent}
            strokeWidth={1.5}
            label={{ value: `τ ${threshold.toFixed(2)}`, position: "top", fill: CHART_INK.accent, fontSize: 11, fontFamily: MONO }}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4 pl-2 text-[11.5px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-line-strong" /> Below confidence threshold
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-ink-2" /> At or above threshold
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Category counts */
export function CategoryBars({ data }: { data: CategoryCount[] }) {
  const sorted = [...data].sort((a, b) => b.count - a.count);
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 38)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }} barCategoryGap={9}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="category"
          width={104}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12.5, fill: CHART_INK.ink2, fontFamily: SANS }}
        />
        <Tooltip
          cursor={{ fill: CHART_INK.sunken, fillOpacity: 0.7 }}
          content={(props) => {
            const { active, payload } = props as unknown as TipDatum<CategoryCount>;
            const d = payload?.[0]?.payload;
            if (!active || !d) return null;
            return (
              <TooltipShell
                title={d.category}
                rows={[
                  { label: "Decoded (final)", value: int(d.count), color: CHART_INK.ink2 },
                  { label: "Argmax would give", value: int(d.argmax_count) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="count" fill={CHART_INK.ink2} radius={[0, 4, 4, 0]} animationDuration={700}>
          <LabelList dataKey="count" position="right" style={{ fontSize: 11.5, fill: CHART_INK.ink3, fontFamily: MONO }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------ Probability comparison */
export function ProbabilityBars({
  entries,
  threshold,
}: {
  entries: { category: string; probability: number }[];
  threshold: number;
}) {
  const sorted = [...entries].sort((a, b) => b.probability - a.probability);
  return (
    <ResponsiveContainer width="100%" height={Math.max(150, sorted.length * 36 + 30)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 18, right: 52, bottom: 0, left: 0 }} barCategoryGap={8}>
        <XAxis type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_INK.line }} />
        <YAxis
          type="category"
          dataKey="category"
          width={104}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12.5, fill: CHART_INK.ink2, fontFamily: SANS }}
        />
        <Bar dataKey="probability" radius={[0, 4, 4, 0]} animationDuration={650}>
          {sorted.map((entry, index) => (
            <Cell key={entry.category} fill={index === 0 ? CHART_INK.ink : index === 1 ? CHART_INK.ink3 : "#d6cfc1"} />
          ))}
          <LabelList
            dataKey="probability"
            position="right"
            formatter={(value: unknown) => pct(Number(value))}
            style={{ fontSize: 11.5, fill: CHART_INK.ink2, fontFamily: MONO }}
          />
        </Bar>
        <ReferenceLine
          x={threshold}
          stroke={CHART_INK.accent}
          strokeWidth={1.5}
          label={{ value: `τ ${threshold.toFixed(2)}`, position: "top", fill: CHART_INK.accent, fontSize: 11, fontFamily: MONO }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ----------------------------------------------------- Coverage vs accuracy */
export function CoverageChart({ sweep, current }: { sweep: SweepPoint[]; current: number }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded bg-ink-2" /> Coverage (rows auto-accepted)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded bg-accent" /> Accuracy of accepted rows
        </span>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={sweep} margin={{ top: 20, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={CHART_INK.line} />
          <XAxis
            dataKey="confidence_threshold"
            type="number"
            domain={[0.3, 0.95]}
            ticks={[0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]}
            tickFormatter={(v: number) => v.toFixed(2)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART_INK.line }}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: CHART_INK.ink4, strokeDasharray: "3 3" }}
            content={(props) => {
              const { active, payload } = props as unknown as TipDatum<SweepPoint>;
              const d = payload?.[0]?.payload;
              if (!active || !d) return null;
              return (
                <TooltipShell
                  title={`Confidence threshold ${d.confidence_threshold.toFixed(2)}`}
                  rows={[
                    { label: "Coverage", value: pct(d.coverage), color: CHART_INK.ink2 },
                    { label: "Accuracy of accepted", value: pct(d.selective_accuracy), color: CHART_INK.accent },
                    { label: "Errors let through", value: int(d.errors_let_through) },
                    { label: "Errors intercepted", value: int(d.errors_intercepted) },
                  ]}
                />
              );
            }}
          />
          <ReferenceLine
            x={current}
            stroke={CHART_INK.ink3}
            strokeDasharray="4 3"
            label={{ value: "current τ", position: "top", fill: CHART_INK.ink3, fontSize: 11, fontFamily: MONO }}
          />
          <Line
            type="monotone"
            dataKey="coverage"
            stroke={CHART_INK.ink2}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface }}
            animationDuration={800}
          />
          <Line
            type="monotone"
            dataKey="selective_accuracy"
            stroke={CHART_INK.accent}
            strokeWidth={2}
            dot={false}
            connectNulls
            activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface }}
            animationDuration={800}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* --------------------------------------------------------------- Outcome bars */
export function OutcomeBars({ evaluation }: { evaluation: EvaluationOut }) {
  const n = evaluation.evaluated_rows || 1;
  const { argmax, safe } = evaluation;
  const rows = [
    {
      label: "Standard argmax",
      caption: `${int(argmax.incorrect)} wrong categories accepted silently`,
      segments: [
        { key: "ok", value: argmax.correct, className: "bg-ink-2", title: "Correct, accepted" },
        { key: "bad", value: argmax.incorrect, className: "bg-rejected", title: "Wrong, accepted silently" },
      ],
    },
    {
      label: "Ambiguity-safe decoder",
      caption: `${int(safe.errors_intercepted)} of ${int(argmax.incorrect)} errors held for review`,
      segments: [
        { key: "ok", value: safe.correct_accepted, className: "bg-ink-2", title: "Correct, accepted" },
        { key: "bad", value: safe.incorrect_accepted, className: "bg-rejected", title: "Wrong, accepted" },
        { key: "held", value: safe.flagged, className: "hatch bg-sunken text-ink-4", title: "Held for review" },
      ],
    },
  ];
  return (
    <div className="space-y-5">
      {rows.map((row, r) => (
        <div key={row.label}>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-ink">{row.label}</span>
            <span className="text-[12px] text-ink-3">{row.caption}</span>
          </div>
          <div className="flex h-3.5 gap-[2px] overflow-hidden rounded-full bg-sunken">
            {row.segments.map((segment, i) =>
              segment.value > 0 ? (
                <motion.div
                  key={segment.key}
                  title={`${segment.title}: ${int(segment.value)}`}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", segment.className)}
                  initial={{ width: 0 }}
                  animate={{ width: `${(segment.value / n) * 100}%` }}
                  transition={{ duration: 0.8, delay: r * 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null,
            )}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-4 text-[11.5px] text-ink-3">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-ink-2" /> Correct, accepted</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-rejected" /> Wrong, accepted</span>
        <span className="flex items-center gap-1.5"><span className="hatch size-2.5 rounded-[3px] bg-sunken text-ink-4" /> Held for review</span>
      </div>
    </div>
  );
}
