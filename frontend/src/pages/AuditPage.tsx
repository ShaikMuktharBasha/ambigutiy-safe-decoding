import { motion } from "motion/react";
import { ArrowRight, Download, Inbox, ScrollText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NoDatasetState } from "@/components/common/Guards";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Controls";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/Layout";
import { useExportCsv } from "@/hooks/mutations";
import { useAudit } from "@/hooks/queries";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { cn } from "@/lib/cn";
import { dateTime, humanize, int, pct } from "@/lib/format";
import { AUDIT_ACTION_LABELS, STATUS_META } from "@/lib/status";
import type { DatasetSummary, DecodeStatus } from "@/types/api";

const ACTION_TONE: Record<string, string> = {
  ACCEPT_TOP: "bg-safe-soft text-safe-ink",
  CHOOSE_ALTERNATIVE: "bg-reviewed-soft text-reviewed-ink",
  CHOOSE_OTHER: "bg-ambiguous-soft text-ambiguous-ink",
  REJECT: "bg-rejected-soft text-rejected-ink",
  REVERT: "bg-sunken text-ink-2",
};

function StatusText({ status }: { status: string }) {
  const meta = STATUS_META[status as DecodeStatus];
  return <span className={cn("text-[12px] font-medium", meta?.text ?? "text-ink-2")}>{meta?.label ?? humanize(status)}</span>;
}

function AuditView({ dataset }: { dataset: DatasetSummary }) {
  const navigate = useNavigate();
  const audit = useAudit(dataset.id);
  const exportCsv = useExportCsv();
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (audit.data?.items ?? []).filter(
      (record) =>
        (action === "all" || record.action === action) &&
        (!q ||
          String(record.row_id) === q.replace("#", "") ||
          [record.original_prediction, record.selected_category, record.note, record.original_value]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))),
    );
  }, [audit.data, action, search]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const record of audit.data?.items ?? []) result[record.action] = (result[record.action] ?? 0) + 1;
    return result;
  }, [audit.data]);

  return (
    <>
      <PageHeader
        title="Audit log"
        meta={<span className="font-medium text-ink-2">{dataset.name}</span>}
        description="Every manual decision is recorded with the decoder's original output, the chosen category and the status change."
        actions={
          <Button icon={<Download />} loading={exportCsv.isPending} onClick={() => exportCsv.mutate({ datasetId: dataset.id, kind: "audit" })}>
            Export audit CSV
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="px-4 py-3">
          <div className="text-[12px] text-ink-3">Decisions</div>
          <div className="num mt-1 text-[22px] leading-none text-ink">{int(audit.data?.total ?? 0)}</div>
        </Card>
        {Object.keys(AUDIT_ACTION_LABELS).map((key) => (
          <Card key={key} className="px-4 py-3">
            <div className="truncate text-[12px] text-ink-3">{AUDIT_ACTION_LABELS[key]}</div>
            <div className="num mt-1 text-[22px] leading-none text-ink">{int(counts[key] ?? 0)}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Row number, category or note" className="h-8 pl-8 text-[13px]" />
          </div>
          <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-56 [&_select]:h-8 [&_select]:text-[13px]">
            <option value="all">All actions</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {audit.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : audit.isError ? (
          <div className="p-5">
            <ErrorState error={audit.error} />
          </div>
        ) : (audit.data?.total ?? 0) === 0 ? (
          <EmptyState
            icon={<ScrollText />}
            title="No manual decisions yet"
            description="Resolve a flagged prediction in the review queue and it will appear here with a timestamp."
            actions={
              <Button icon={<Inbox />} onClick={() => navigate("/review")}>
                Open review queue
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState icon={<Search />} title="No decisions match" description="Try a different action filter or search term." />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-3">
                  {["Timestamp", "Row", "Action", "Decoder output", "Selected category", "Status change", "Confidence", "Gap", "Mode", "Note"].map((h) => (
                    <th key={h} className="whitespace-nowrap border-b border-line bg-sunken/60 px-3 py-2 font-medium first:pl-4 last:pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((record, index) => (
                  <motion.tr
                    key={record.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(index * 0.015, 0.25) }}
                    className="hover:bg-hover/40"
                  >
                    <td className="whitespace-nowrap border-b border-line px-3 py-2.5 pl-4 text-ink-2">{dateTime(record.timestamp)}</td>
                    <td className="num border-b border-line px-3 py-2.5 text-ink-3">#{record.row_id}</td>
                    <td className="border-b border-line px-3 py-2.5">
                      <span className={cn("whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium", ACTION_TONE[record.action] ?? "bg-sunken text-ink-2")}>
                        {AUDIT_ACTION_LABELS[record.action] ?? humanize(record.action)}
                      </span>
                    </td>
                    <td className="border-b border-line px-3 py-2.5 text-ink-2">
                      {record.original_prediction ?? "—"}
                      {record.decoder_prediction === null && <span className="ml-1 text-[11.5px] italic text-ink-4">(abstained)</span>}
                    </td>
                    <td className="border-b border-line px-3 py-2.5 font-medium text-ink">
                      {record.action === "REVERT" ? "—" : (record.selected_category ?? <span className="font-normal italic text-ink-4">none</span>)}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-3 py-2.5">
                      <StatusText status={record.previous_status} />
                      <ArrowRight className="mx-1.5 inline size-3 text-ink-4" />
                      <StatusText status={record.new_status} />
                    </td>
                    <td className="num border-b border-line px-3 py-2.5 text-ink-2">{pct(record.confidence)}</td>
                    <td className="num border-b border-line px-3 py-2.5 text-ink-2">{pct(record.gap)}</td>
                    <td className="border-b border-line px-3 py-2.5 text-ink-2">{humanize(record.mode)}</td>
                    <td className="max-w-[14rem] truncate border-b border-line px-3 py-2.5 pr-4 text-ink-3" title={record.note ?? undefined}>
                      {record.note ?? "—"}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export function AuditPage() {
  const { active } = useActiveDataset();
  if (!active) {
    return (
      <>
        <PageHeader title="Audit log" description="History of manual decisions." />
        <NoDatasetState />
      </>
    );
  }
  return <AuditView key={active.id} dataset={active} />;
}
