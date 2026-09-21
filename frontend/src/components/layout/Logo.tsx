import { cn } from "@/lib/cn";

/** Three probability bars - two nearly tied - under a threshold line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1e1d1a" />
      <rect x="7" y="18" width="4" height="7" rx="1" fill="#847f75" />
      <rect x="14" y="9" width="4" height="16" rx="1" fill="#f6f4ef" />
      <rect x="21" y="10" width="4" height="15" rx="1" fill="#c4622d" />
      <rect x="5.5" y="13" width="21" height="1.4" rx="0.7" fill="#c4622d" opacity="0.85" />
    </svg>
  );
}
