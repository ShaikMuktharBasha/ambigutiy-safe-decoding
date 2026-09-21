import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { STATUS_META } from "@/lib/status";
import type { DecodeStatus } from "@/types/api";

export function StatusBadge({ status, className }: { status: DecodeStatus; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-[3px] text-[10.5px] font-semibold uppercase leading-none tracking-[0.04em]",
        meta.badge,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.4} aria-hidden />
      {meta.label}
    </span>
  );
}

type Tone = "neutral" | "accent" | "outline";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
  outline: "border border-line text-ink-3",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
