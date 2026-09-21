import { Ban, Scale, ShieldCheck, TriangleAlert, UserCheck, type LucideIcon } from "lucide-react";
import type { DecodeStatus, DecodingMode, StatusFilter } from "@/types/api";

export interface StatusMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  /** Hex used by SVG charts (mirrors the CSS tokens in index.css). */
  color: string;
  badge: string;
  text: string;
  soft: string;
  dot: string;
}

export const STATUS_ORDER: DecodeStatus[] = ["SAFE", "UNCERTAIN", "AMBIGUOUS", "REJECTED", "MANUALLY_REVIEWED"];

export const STATUS_META: Record<DecodeStatus, StatusMeta> = {
  SAFE: {
    label: "Safe",
    description: "Confidence and gap both pass - decoded automatically.",
    icon: ShieldCheck,
    color: "#23865e",
    badge: "bg-safe-soft text-safe-ink",
    text: "text-safe-ink",
    soft: "bg-safe-soft",
    dot: "bg-safe",
  },
  UNCERTAIN: {
    label: "Uncertain",
    description: "A category is returned but flagged because a check failed.",
    icon: TriangleAlert,
    color: "#d08b16",
    badge: "bg-uncertain-soft text-uncertain-ink",
    text: "text-uncertain-ink",
    soft: "bg-uncertain-soft",
    dot: "bg-uncertain",
  },
  AMBIGUOUS: {
    label: "Ambiguous",
    description: "The top two categories are too close to call.",
    icon: Scale,
    color: "#7b56b8",
    badge: "bg-ambiguous-soft text-ambiguous-ink",
    text: "text-ambiguous-ink",
    soft: "bg-ambiguous-soft",
    dot: "bg-ambiguous",
  },
  REJECTED: {
    label: "Rejected",
    description: "Confidence is below the threshold - no category returned.",
    icon: Ban,
    color: "#c24438",
    badge: "bg-rejected-soft text-rejected-ink",
    text: "text-rejected-ink",
    soft: "bg-rejected-soft",
    dot: "bg-rejected",
  },
  MANUALLY_REVIEWED: {
    label: "Reviewed",
    description: "A person made the final decision; recorded in the audit log.",
    icon: UserCheck,
    color: "#2c6bc0",
    badge: "bg-reviewed-soft text-reviewed-ink",
    text: "text-reviewed-ink",
    soft: "bg-reviewed-soft",
    dot: "bg-reviewed",
  },
};

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "SAFE", label: "Safe" },
  { value: "UNCERTAIN", label: "Uncertain" },
  { value: "AMBIGUOUS", label: "Ambiguous" },
  { value: "REJECTED", label: "Rejected" },
  { value: "MANUALLY_REVIEWED", label: "Reviewed" },
];

export interface ModeMeta {
  label: string;
  verb: string;
  description: string;
}

export const MODE_META: Record<DecodingMode, ModeMeta> = {
  strict: {
    label: "Strict",
    verb: "Abstain",
    description:
      "Accept only when both checks pass. Otherwise return no category: near ties become AMBIGUOUS, low confidence becomes REJECTED.",
  },
  soft: {
    label: "Soft",
    verb: "Hedge",
    description:
      "Return the top category, but mark any row that fails a check as UNCERTAIN and include the top-k alternatives.",
  },
  advisory: {
    label: "Advisory",
    verb: "Warn",
    description:
      "Always return the top category and attach a warning. Near ties show as AMBIGUOUS, low confidence as UNCERTAIN.",
  },
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  ACCEPT_TOP: "Accepted top prediction",
  CHOOSE_ALTERNATIVE: "Chose alternative",
  CHOOSE_OTHER: "Chose another category",
  REJECT: "Rejected",
  REVERT: "Reverted decision",
};

export const CHART_INK = {
  ink: "#1e1d1a",
  ink2: "#55524b",
  ink3: "#847f75",
  ink4: "#b3ada2",
  line: "#e6e1d7",
  sunken: "#f0ede6",
  surface: "#fffdf9",
  accent: "#c4622d",
  accentSoft: "#f6e8dd",
};
