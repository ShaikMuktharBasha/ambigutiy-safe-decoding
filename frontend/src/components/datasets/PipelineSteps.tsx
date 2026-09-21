import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { humanize, relativeTime } from "@/lib/format";
import { MODE_META } from "@/lib/status";
import type { DatasetDetail } from "@/types/api";

export function PipelineSteps({ dataset }: { dataset: DatasetDetail }) {
  const p = dataset.pipeline;
  const steps = [
    { label: "Categorical column", done: p.has_encoding, detail: dataset.target_column ?? "Not selected" },
    {
      label: "One-hot encoding",
      done: p.has_encoding,
      detail: dataset.encoding ? `${dataset.encoding.categories.length} categories` : "Waiting for column",
    },
    {
      label: "Probability vectors",
      done: p.has_probabilities,
      detail: p.has_probabilities
        ? `${humanize(p.probability_source)}${p.probability_meta.seed !== undefined ? ` · seed ${p.probability_meta.seed}` : ""}`
        : "Not generated",
    },
    {
      label: "Safe decoding",
      done: p.has_results,
      detail: p.has_results && p.decode_config ? `${MODE_META[p.decode_config.mode].label} · ${relativeTime(p.decoded_at)}` : "Not run",
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <ol className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
      {steps.map((step, index) => {
        const isCurrent = index === current;
        return (
          <li key={step.label} className="relative flex items-start gap-3">
            {index < steps.length - 1 && (
              <div className="absolute left-[34px] right-2 top-[13px] hidden h-px bg-line md:block">
                <motion.div
                  className="h-full bg-ink-3"
                  initial={{ width: 0 }}
                  animate={{ width: step.done ? "100%" : "0%" }}
                  transition={{ duration: 0.6, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            )}
            <motion.span
              initial={false}
              animate={{ scale: isCurrent ? [1, 1.08, 1] : 1 }}
              transition={{ duration: 1.6, repeat: isCurrent ? Infinity : 0, ease: "easeInOut" }}
              className={cn(
                "relative z-10 flex size-[26px] shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                step.done && "border-ink bg-ink text-canvas",
                isCurrent && "border-accent bg-accent-soft text-accent-ink",
                !step.done && !isCurrent && "border-line bg-surface text-ink-4",
              )}
            >
              {step.done ? <Check className="size-3.5" strokeWidth={3} /> : <span className="num">{index + 1}</span>}
            </motion.span>
            <div className="min-w-0 bg-surface pr-2">
              <div className={cn("text-[13px] font-medium", step.done || isCurrent ? "text-ink" : "text-ink-3")}>{step.label}</div>
              <div className="truncate text-[12px] text-ink-3">{step.detail}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
