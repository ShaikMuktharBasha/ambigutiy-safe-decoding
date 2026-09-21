import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Ban, Check, Scale, ShieldCheck, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";

/**
 * Illustration for the landing page. The three example vectors and their
 * outcomes are fixed teaching examples (strict mode, τ = 0.75, δ = 0.05);
 * real decisions are always made by the backend decoder.
 */
const CATEGORIES = ["Electronics", "Furniture", "Clothing"];
const EXAMPLES = [
  { key: "clear", label: "Clear winner", vector: [0.91, 0.06, 0.03], confidencePass: true, gapPass: true, gap: 0.85, outcome: "SAFE" },
  { key: "tie", label: "Near tie", vector: [0.48, 0.47, 0.05], confidencePass: false, gapPass: false, gap: 0.01, outcome: "AMBIGUOUS" },
  { key: "low", label: "Low confidence", vector: [0.58, 0.3, 0.12], confidencePass: false, gapPass: true, gap: 0.28, outcome: "REJECTED" },
] as const;

function Connector({ active }: { active: boolean }) {
  return (
    <div className="ml-[15px] h-5 w-px">
      <svg width="2" height="20" className="overflow-visible">
        <line
          x1="1"
          y1="0"
          x2="1"
          y2="20"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          className={cn("transition-colors duration-300", active ? "animate-flow stroke-ink-3" : "stroke-line-strong")}
        />
      </svg>
    </div>
  );
}

function Verdict({ pass, visible }: { pass: boolean; visible: boolean }) {
  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.span
          key={String(pass)}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
            pass ? "bg-safe-soft text-safe-ink" : "bg-rejected-soft text-rejected-ink",
          )}
        >
          {pass ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
          {pass ? "Pass" : "Fail"}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function Node({
  state,
  title,
  formula,
  children,
}: {
  state: "idle" | "pass" | "fail";
  title: string;
  formula?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-[31px] shrink-0 items-center justify-center rounded-full border text-[11px] transition-all duration-300",
          state === "idle" && "border-line bg-surface text-ink-4",
          state === "pass" && "border-safe/30 bg-safe-soft text-safe-ink",
          state === "fail" && "border-rejected/30 bg-rejected-soft text-rejected-ink",
        )}
      >
        {state === "pass" ? <Check className="size-3.5" strokeWidth={2.6} /> : state === "fail" ? <X className="size-3.5" strokeWidth={2.6} /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-ink">{title}</span>
          {formula && <span className="num text-[11.5px] text-ink-3">{formula}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function DecisionFlow() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(1);
  const [step, setStep] = useState(3);
  const [paused, setPaused] = useState(false);
  const example = EXAMPLES[index];

  useEffect(() => {
    if (reduce) {
      setStep(3);
      return;
    }
    setStep(0);
    const timers = [700, 1300, 1900].map((delay, i) => window.setTimeout(() => setStep(i + 1), delay));
    return () => timers.forEach(window.clearTimeout);
  }, [index, reduce]);

  useEffect(() => {
    if (reduce || paused) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % EXAMPLES.length), 5200);
    return () => window.clearTimeout(timer);
  }, [index, paused, reduce]);

  const safe = example.outcome === "SAFE";

  return (
    <Card
      className="relative overflow-hidden p-5 sm:p-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">How a vector is decoded</span>
        <div className="flex gap-1" role="tablist" aria-label="Example vectors">
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.key}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                "rounded-md px-2 py-1 text-[11.5px] transition-colors",
                i === index ? "bg-ink text-canvas" : "text-ink-3 hover:bg-hover hover:text-ink",
              )}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      <Node state={step >= 1 ? "pass" : "idle"} title="Probability vector" formula={`argmax → ${CATEGORIES[0]}`}>
        <ul className="mt-2.5 space-y-1.5">
          {example.vector.map((p, i) => (
            <li key={CATEGORIES[i]} className="grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-2.5 text-[12px]">
              <span className={i === 0 ? "text-ink" : "text-ink-2"}>{CATEGORIES[i]}</span>
              <span className="h-2 overflow-hidden rounded-full bg-sunken">
                <motion.span
                  className={cn("block h-full rounded-full", i === 0 ? "bg-ink" : i === 1 ? "bg-ink-3" : "bg-line-strong")}
                  animate={{ width: `${p * 100}%` }}
                  transition={{ type: "spring", stiffness: 140, damping: 20 }}
                />
              </span>
              <span className="num text-right text-ink">{p.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </Node>
      <Connector active={step >= 1} />
      <Node
        state={step >= 1 ? (example.confidencePass ? "pass" : "fail") : "idle"}
        title="Confidence check"
        formula="max(p) ≥ 0.75"
      >
        <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-3">
          max(p) = <span className="num text-ink">{example.vector[0].toFixed(2)}</span>
          <Verdict pass={example.confidencePass} visible={step >= 1} />
        </div>
      </Node>
      <Connector active={step >= 2} />
      <Node state={step >= 2 ? (example.gapPass ? "pass" : "fail") : "idle"} title="Near-tie check" formula="p₁ − p₂ ≥ 0.05">
        <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-3">
          gap = <span className="num text-ink">{pct(example.gap, 0)}</span>
          <Verdict pass={example.gapPass} visible={step >= 2} />
        </div>
      </Node>
      <Connector active={step >= 3} />

      <div className="relative h-[58px]">
        <AnimatePresence mode="wait">
          {step >= 3 ? (
            <motion.div
              key={example.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 py-3",
                safe ? "border-safe/25 bg-safe-soft/70" : example.outcome === "AMBIGUOUS" ? "border-ambiguous/25 bg-ambiguous-soft/70" : "border-rejected/25 bg-rejected-soft/70",
              )}
            >
              {safe ? (
                <ShieldCheck className="size-5 text-safe-ink" />
              ) : example.outcome === "AMBIGUOUS" ? (
                <Scale className="size-5 text-ambiguous-ink" />
              ) : (
                <Ban className="size-5 text-rejected-ink" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink">
                  {safe ? "Safe → Electronics" : "Sent to human review"}
                </div>
                <div className="text-[12px] text-ink-3">
                  {safe
                    ? "Both checks pass, the category is decoded."
                    : example.outcome === "AMBIGUOUS"
                      ? "AMBIGUOUS: argmax would silently pick Electronics."
                      : "REJECTED: confidence too low to trust argmax."}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="pending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full items-center rounded-xl border border-dashed border-line px-3.5 text-[12.5px] text-ink-4"
            >
              Safe / Review
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
