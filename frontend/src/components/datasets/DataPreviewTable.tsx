import { cn } from "@/lib/cn";
import { stringifyCell } from "@/lib/format";
import type { DatasetDetail } from "@/types/api";

export function DataPreviewTable({ dataset }: { dataset: DatasetDetail }) {
  const columns = dataset.columns.map((c) => c.name);
  return (
    <div className="scrollbar-thin max-h-[420px] overflow-auto rounded-xl border border-line">
      <table className="min-w-full border-separate border-spacing-0 text-[12.5px]">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="border-b border-line bg-sunken px-3 py-2 text-left font-medium text-ink-4">#</th>
            {columns.map((column) => (
              <th
                key={column}
                className={cn(
                  "whitespace-nowrap border-b border-line bg-sunken px-3 py-2 text-left font-medium text-ink-3",
                  column === dataset.target_column && "bg-accent-soft text-accent-ink",
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataset.preview.map((row, index) => (
            <tr key={index} className="transition-colors hover:bg-hover/40">
              <td className="num border-b border-line px-3 py-1.5 text-ink-4">{index + 1}</td>
              {columns.map((column) => {
                const value = stringifyCell(row[column]);
                return (
                  <td
                    key={column}
                    className={cn(
                      "max-w-[16rem] truncate whitespace-nowrap border-b border-line px-3 py-1.5 text-ink-2",
                      column === dataset.target_column && "bg-accent-soft/35 font-medium text-ink",
                    )}
                  >
                    {value || <span className="text-ink-4">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
