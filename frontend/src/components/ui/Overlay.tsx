import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

/* -------------------------------------------------------------------- Popover */
/**
 * Menu anchored to its trigger. The panel is portalled to <body> with fixed
 * positioning so scrolling tables and animated containers never clip it; it
 * flips above the trigger when there is not enough room below.
 */
export function Popover({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const side = below < 240 && above > below ? "top" : "bottom";
    setPlacement(side);
    setStyle({
      position: "fixed",
      top: side === "bottom" ? rect.bottom + 6 : undefined,
      bottom: side === "top" ? window.innerHeight - rect.top + 6 : undefined,
      left: align === "start" ? Math.max(8, rect.left) : undefined,
      right: align === "end" ? Math.max(8, window.innerWidth - rect.right) : undefined,
      maxHeight: Math.max(160, side === "bottom" ? below : above),
    });
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return (
    <div ref={anchorRef} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {createPortal(
        <AnimatePresence>
          {open && style && (
            <motion.div
              ref={panelRef}
              style={style}
              initial={{ opacity: 0, y: placement === "bottom" ? -4 : 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: placement === "bottom" ? -4 : 4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "scrollbar-thin z-[90] min-w-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop",
                placement === "bottom" ? "origin-top" : "origin-bottom",
                className,
              )}
            >
              {children(close)}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  icon,
  disabled,
  className,
  trailing,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 transition-colors",
        "hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:text-ink-3",
        className,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      {trailing}
    </button>
  );
}

/* --------------------------------------------------------------------- Dialog */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-pop"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
                {description && <div className="mt-1 text-sm leading-relaxed text-ink-2">{description}</div>}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close dialog">
                <X />
              </Button>
            </div>
            {children && <div className="mt-4">{children}</div>}
            {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
