import { ChevronDown, Download, FileSpreadsheet, ListFilter, ScrollText, Table } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MenuItem, Popover } from "@/components/ui/Overlay";
import { useExportCsv } from "@/hooks/mutations";
import type { ExportKind } from "@/types/api";

const OPTIONS: { kind: ExportKind; label: string; description: string; icon: typeof Table; needsResults: boolean }[] = [
  { kind: "results", label: "Full results", description: "Every row with top-k, gap, status and reason", icon: Table, needsResults: true },
  { kind: "corrected", label: "Corrected dataset", description: "Original columns plus the final decoded value", icon: FileSpreadsheet, needsResults: true },
  { kind: "ambiguous", label: "Flagged rows", description: "Rows the decoder did not mark safe", icon: ListFilter, needsResults: true },
  { kind: "audit", label: "Audit log", description: "Every manual decision with timestamps", icon: ScrollText, needsResults: false },
];

export function ExportMenu({
  datasetId,
  decoded,
  size = "sm",
}: {
  datasetId: string;
  decoded: boolean;
  size?: "sm" | "md";
}) {
  const exportCsv = useExportCsv();
  return (
    <Popover
      className="w-72"
      trigger={({ toggle, open }) => (
        <Button size={size} variant="secondary" icon={<Download />} loading={exportCsv.isPending} onClick={toggle} aria-expanded={open}>
          Export CSV
          <ChevronDown className="!size-3.5 text-ink-3" />
        </Button>
      )}
    >
      {(close) =>
        OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <MenuItem
              key={option.kind}
              icon={<Icon />}
              disabled={option.needsResults && !decoded}
              onClick={() => {
                close();
                exportCsv.mutate({ datasetId, kind: option.kind });
              }}
            >
              <div className="text-ink">{option.label}</div>
              <div className="text-[11.5px] text-ink-3">{option.description}</div>
            </MenuItem>
          );
        })
      }
    </Popover>
  );
}
