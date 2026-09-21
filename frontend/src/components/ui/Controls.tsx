import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ Segmented */
interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const layoutId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("relative inline-flex rounded-lg border border-line bg-sunken p-0.5", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-0 flex-1 whitespace-nowrap rounded-md font-medium transition-colors duration-150",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-md border border-line bg-surface shadow-card"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- Slider */
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format = (v) => v.toFixed(2),
  hint,
  ticks = [0, 0.25, 0.5, 0.75, 1],
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  hint?: ReactNode;
  ticks?: number[];
  disabled?: boolean;
}) {
  const id = useId();
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn(disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        <span className="num rounded-md bg-sunken px-1.5 py-0.5 text-[12px] text-ink">{format(value)}</span>
      </div>
      <div className="relative mt-2 h-5">
        <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-sunken ring-1 ring-line ring-inset" />
        <div
          className="absolute left-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-ink transition-[width] duration-100"
          style={{ width: `${percent}%` }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="asid-range absolute inset-0 h-5 w-full"
        />
      </div>
      <div className="relative mt-1 h-3">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="num absolute -translate-x-1/2 text-[10px] text-ink-4 first:translate-x-0 last:-translate-x-full"
            style={{ left: `${((tick - min) / (max - min)) * 100}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{hint}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------- Input */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-card",
        "placeholder:text-ink-4 transition-[border-color,box-shadow] duration-150",
        "focus:border-ink-3 focus:outline-none focus:ring-3 focus:ring-accent/15",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(
          "h-9 w-full appearance-none rounded-lg border border-line bg-surface pl-3 pr-8 text-sm text-ink shadow-card",
          "transition-[border-color,box-shadow] duration-150 focus:border-ink-3 focus:outline-none focus:ring-3 focus:ring-accent/15",
          "disabled:opacity-50",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-[13px] text-ink-2"
    >
      <span
        className={cn(
          "relative inline-flex h-[18px] w-8 items-center rounded-full transition-colors duration-200",
          checked ? "bg-ink" : "bg-line-strong",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 36 }}
          className={cn("size-3.5 rounded-full bg-surface shadow", checked ? "ml-[16px]" : "ml-[2px]")}
        />
      </span>
      {label}
    </button>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn("size-3.5 cursor-pointer rounded border-line-strong accent-ink", className)}
      {...props}
    />
  );
}
