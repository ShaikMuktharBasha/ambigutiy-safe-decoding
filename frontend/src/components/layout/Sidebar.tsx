import {
  Binary,
  ChartColumn,
  Database,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  ScrollText,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Link, NavLink } from "react-router-dom";
import { useGeminiStatus, useHealth, useSummary } from "@/hooks/queries";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { cn } from "@/lib/cn";
import { LogoMark } from "./Logo";

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavEntry[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/datasets", label: "Datasets", icon: Database },
  { to: "/decoder", label: "Decoder", icon: Binary },
  { to: "/simulator", label: "Simulator", icon: FlaskConical },
  { to: "/review", label: "Review", icon: Inbox },
  { to: "/analytics", label: "Analytics", icon: ChartColumn },
  { to: "/audit", label: "Audit", icon: ScrollText },
];

function NavItem({ entry, badge, onNavigate }: { entry: NavEntry; badge?: number; onNavigate?: () => void }) {
  const Icon = entry.icon;
  return (
    <NavLink
      to={entry.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative isolate flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors duration-150",
          isActive ? "font-medium text-ink" : "text-ink-2 hover:bg-hover/70 hover:text-ink",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-lg border border-line bg-surface shadow-card"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <Icon
            className={cn(
              "size-4 transition-colors",
              isActive ? "text-accent" : "text-ink-3 group-hover:text-ink-2",
            )}
            strokeWidth={isActive ? 2.2 : 1.9}
          />
          <span className="flex-1">{entry.label}</span>
          <AnimatePresence>
            {badge ? (
              <motion.span
                key={badge}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                className="num rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent-ink"
              >
                {badge}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { active } = useActiveDataset();
  const summary = useSummary(active?.pipeline.has_results ? active.id : null);
  const health = useHealth();
  const gemini = useGeminiStatus();
  const needsReview = active?.pipeline.has_results ? (summary.data?.needs_review ?? 0) : 0;

  return (
    <div className="flex h-full flex-col px-3 py-4">
      <Link to="/dashboard" onClick={onNavigate} className="mb-6 flex items-center gap-2.5 rounded-lg px-2 py-1">
        <LogoMark />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">ASI</div>
          <div className="text-[11px] text-ink-3">Ambiguity-safe decoding</div>
        </div>
      </Link>

      <nav className="flex flex-col gap-0.5" aria-label="Primary">
        {NAV.map((entry) => (
          <NavItem
            key={entry.to}
            entry={entry}
            badge={entry.to === "/review" ? needsReview : undefined}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mt-auto">
        <div className="mx-2 my-3 h-px bg-line" />
        <NavItem entry={{ to: "/settings", label: "Settings", icon: Settings }} onNavigate={onNavigate} />
        <div className="mt-4 space-y-1.5 px-2.5 text-[11.5px] text-ink-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-1.5">
              {health.isSuccess && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-safe opacity-40" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-1.5 rounded-full",
                  health.isSuccess ? "bg-safe" : health.isError ? "bg-rejected" : "bg-ink-4",
                )}
              />
            </span>
            {health.isSuccess ? `API online · v${health.data.version}` : health.isError ? "API offline" : "Connecting…"}
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-3" />
            {gemini.data?.configured ? `Gemini · ${gemini.data.model}` : "Gemini not configured"}
          </div>
        </div>
      </div>
    </div>
  );
}
