import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { errorMessage, errorTitle } from "@/lib/notify";
import { Card } from "./Card";

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex flex-col items-center px-6 py-14 text-center", className)}
    >
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-line bg-sunken text-ink-3 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-3">{description}</p>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </motion.div>
  );
}

export function ErrorState({ error, action }: { error: unknown; action?: ReactNode }) {
  return (
    <Card className="border-rejected/25 bg-rejected-soft/40">
      <div className="px-5 py-4">
        <p className="text-sm font-semibold text-rejected-ink">{errorTitle(error)}</p>
        <p className="mt-0.5 text-sm text-ink-2">{errorMessage(error)}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} />;
}

/** Counts up to a value with a soft ease; respects reduced motion. */
export function AnimatedNumber({
  value,
  format = (v) => Math.round(v).toLocaleString("en-US"),
  className,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const reduce = useReducedMotion();
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = formatRef.current(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = formatRef.current(latest);
      },
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
