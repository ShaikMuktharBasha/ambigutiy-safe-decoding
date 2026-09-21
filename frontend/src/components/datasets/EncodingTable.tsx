import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { int } from "@/lib/format";
import type { EncodingOut } from "@/types/api";

export function OneHotVector({ vector, delay = 0 }: { vector: number[]; delay?: number }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={`[${vector.join(", ")}]`}>
      {vector.map((bit, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + i * 0.025, duration: 0.25 }}
          className={cn(
            "num flex size-[19px] items-center justify-center rounded-[4px] text-[10.5px]",
            bit ? "bg-ink text-canvas" : "bg-sunken text-ink-4",
          )}
        >
          {bit}
        </motion.span>
      ))}
    </span>
  );
}

export function EncodingTable({ encoding }: { encoding: EncodingOut }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[420px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-3">
              <th className="border-b border-line bg-sunken/60 px-3 py-2 font-medium">Category</th>
              <th className="border-b border-line bg-sunken/60 px-3 py-2 font-medium">Index</th>
              <th className="border-b border-line bg-sunken/60 px-3 py-2 font-medium">One-hot vector</th>
              <th className="border-b border-line bg-sunken/60 px-3 py-2 text-right font-medium">Rows</th>
            </tr>
          </thead>
          <tbody>
            {encoding.mapping.map((entry, index) => (
              <tr key={entry.category} className="transition-colors hover:bg-hover/40">
                <td className="border-b border-line px-3 py-2 font-medium text-ink">{entry.category}</td>
                <td className="num border-b border-line px-3 py-2 text-ink-2">{entry.index}</td>
                <td className="border-b border-line px-3 py-2">
                  <OneHotVector vector={entry.one_hot} delay={index * 0.04} />
                </td>
                <td className="num border-b border-line px-3 py-2 text-right text-ink-2">{int(entry.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="mb-2 text-[12px] font-medium text-ink-3">First rows as vectors</div>
        <ul className="space-y-1.5">
          {encoding.vectors_preview.map((row, index) => (
            <li key={row.row_id} className="flex items-center gap-3 text-[12.5px]">
              <span className="num w-8 text-ink-4">#{row.row_id}</span>
              <span className="w-28 truncate text-ink-2">{row.value ?? "—"}</span>
              <OneHotVector vector={row.one_hot} delay={0.2 + index * 0.03} />
            </li>
          ))}
        </ul>
        {encoding.unencoded_rows > 0 && (
          <p className="mt-3 text-xs text-ink-3">
            {int(encoding.unencoded_rows)} empty value{encoding.unencoded_rows === 1 ? "" : "s"} encoded as all-zero vectors.
          </p>
        )}
      </div>
    </div>
  );
}
