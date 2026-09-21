import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ExpandedState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select } from "@/components/ui/Controls";
import { EmptyState } from "@/components/ui/Feedback";
import { useBulkReview } from "@/hooks/mutations";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import { int, pct } from "@/lib/format";
import { STATUS_FILTERS } from "@/lib/status";
import type { BulkReviewAction, ResultsPage, ResultsQuery, RowResult, SortField } from "@/types/api";
import { ConfidenceMeter } from "./ProbabilityRuler";
import { RowDetail } from "./RowDetail";

const helper = createColumnHelper<RowResult>();

const SORTABLE: Record<string, SortField> = {
  row_id: "row_id",
  original_value: "original_value",
  prediction: "prediction",
  confidence: "confidence",
  gap: "gap",
  status: "status",
};

export function ResultsTable({
  datasetId,
  page,
  isLoading,
  isFetching,
  query,
  onQueryChange,
  targetColumn,
  threshold,
  nearTie,
  toolbarExtra,
}: {
  datasetId: string;
  page: ResultsPage | undefined;
  isLoading: boolean;
  isFetching: boolean;
  query: ResultsQuery;
  onQueryChange: (patch: Partial<ResultsQuery>) => void;
  targetColumn: string | null;
  threshold: number;
  nearTie: number;
  toolbarExtra?: React.ReactNode;
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [search, setSearch] = useState(query.search);
  const debouncedSearch = useDebouncedValue(search, 300);
  const bulk = useBulkReview(datasetId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState<number>();

  // Expanded rows are pinned to the visible width so they never need horizontal scrolling.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth));
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (debouncedSearch !== query.search) onQueryChange({ search: debouncedSearch, page: 1 });
  }, [debouncedSearch, query.search, onQueryChange]);

  useEffect(() => {
    setRowSelection({});
    setExpanded({});
  }, [query.status, query.search, datasetId]);

  const categories = page?.categories ?? [];

  const columns = useMemo(
    () => [
      helper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows on this page"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomePageRowsSelected();
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select row ${row.original.row_id}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      }),
      helper.accessor("row_id", {
        header: "Row",
        cell: (info) => <span className="num text-ink-3">#{info.getValue()}</span>,
      }),
      helper.accessor("original_value", {
        header: () => <span title={targetColumn ? `Value of "${targetColumn}"` : undefined}>Original value</span>,
        cell: (info) => <span className="text-ink-2">{info.getValue() ?? "—"}</span>,
      }),
      helper.accessor("final_value", {
        id: "prediction",
        header: "Prediction",
        cell: ({ row }) => {
          const r = row.original;
          if (r.final_value === null) {
            return <span className="text-[12.5px] italic text-ink-4">{r.manually_reviewed ? "rejected" : "abstained"}</span>;
          }
          return (
            <span className={cn("font-medium", r.warning ? "text-uncertain-ink" : "text-ink")}>
              {r.final_value}
              {r.warning && <span className="ml-1 text-[11px]" title={r.warning}>⚠</span>}
            </span>
          );
        },
      }),
      helper.accessor("confidence", {
        header: "Confidence",
        cell: ({ row }) => (
          <ConfidenceMeter value={row.original.confidence} threshold={threshold} status={row.original.computed_status} />
        ),
      }),
      helper.accessor("top_2", {
        header: "Top-2",
        cell: ({ row }) =>
          row.original.top_2 ? (
            <span className="whitespace-nowrap text-ink-2">
              {row.original.top_2} <span className="num text-ink-3">{pct(row.original.top_2_probability)}</span>
            </span>
          ) : (
            "—"
          ),
      }),
      helper.accessor("gap", {
        header: "Gap",
        cell: (info) => (
          <span className={cn("num", info.getValue() < nearTie ? "text-ambiguous-ink" : "text-ink-2")}>
            {pct(info.getValue())}
          </span>
        ),
      }),
      helper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      helper.accessor("reason_label", {
        header: "Reason",
        cell: ({ row }) => (
          <span className="block max-w-[8.5rem] truncate text-ink-2" title={row.original.reason}>
            {row.original.reason_label}
          </span>
        ),
      }),
      helper.display({
        id: "action",
        header: () => <span className="sr-only">Action</span>,
        cell: ({ row }) => (
          <Button
            size="xs"
            variant={row.getIsExpanded() ? "secondary" : "ghost"}
            onClick={row.getToggleExpandedHandler()}
            aria-expanded={row.getIsExpanded()}
          >
            {row.original.requires_review ? "Review" : "Inspect"}
            <ChevronDown className={cn("!size-3.5 transition-transform duration-200", row.getIsExpanded() && "rotate-180")} />
          </Button>
        ),
      }),
    ],
    [threshold, nearTie, targetColumn],
  );

  const table = useReactTable({
    data: page?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.row_id),
    getRowCanExpand: () => true,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: page?.pages ?? 1,
    state: { rowSelection, expanded },
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]).map(Number);
  const runBulk = (action: BulkReviewAction) =>
    bulk.mutate({ row_ids: selectedIds, action }, { onSuccess: () => setRowSelection({}) });

  const toggleSort = (columnId: string) => {
    const field = SORTABLE[columnId];
    if (!field) return;
    if (query.sort_by === field) onQueryChange({ sort_dir: query.sort_dir === "asc" ? "desc" : "asc", page: 1 });
    else onQueryChange({ sort_by: field, sort_dir: field === "row_id" ? "asc" : "asc", page: 1 });
  };

  const from = page && page.total ? (page.page - 1) * page.page_size + 1 : 0;
  const to = page ? Math.min(page.page * page.page_size, page.total) : 0;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rows, categories, products…"
              className="h-8 pl-8 text-[13px]"
              aria-label="Search results"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">{toolbarExtra}</div>
        </div>
        <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
          {STATUS_FILTERS.map((filter) => {
            const active = query.status === filter.value;
            const count =
              filter.value === "all"
                ? undefined
                : filter.value === "needs_review"
                  ? undefined
                  : page?.counts[filter.value as keyof ResultsPage["counts"]];
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => onQueryChange({ status: filter.value, page: 1 })}
                className={cn(
                  "relative isolate flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors",
                  active ? "text-canvas" : "text-ink-2 hover:bg-hover hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`status-filter-${datasetId}`}
                    className="absolute inset-0 -z-10 rounded-md bg-ink"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                {filter.label}
                {count !== undefined && (
                  <span className={cn("num text-[11px]", active ? "text-canvas/70" : "text-ink-4")}>{int(count)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk actions */}
      <AnimatePresence initial={false}>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-line bg-accent-soft/50"
          >
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
              <span className="font-medium text-accent-ink">{selectedIds.length} selected</span>
              <span className="text-ink-4">·</span>
              <Button size="xs" variant="secondary" icon={<Check />} loading={bulk.isPending} onClick={() => runBulk("accept")}>
                Accept top prediction
              </Button>
              <Button size="xs" variant="secondary" icon={<Ban />} disabled={bulk.isPending} onClick={() => runBulk("reject")}>
                Reject
              </Button>
              <Button size="xs" variant="ghost" icon={<Undo2 />} disabled={bulk.isPending} onClick={() => runBulk("revert")}>
                Revert decisions
              </Button>
              <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setRowSelection({})}>
                Clear selection
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="relative">
        <AnimatePresence>
          {isFetching && !isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden"
            >
              <div className="h-full w-1/3 animate-[shimmer_1.1s_linear_infinite] bg-accent/70" style={{ backgroundSize: "200% 100%" }} />
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={scrollRef} className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-[13px]">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const field = SORTABLE[header.column.id];
                    const sorted = field && query.sort_by === field ? query.sort_dir : null;
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "border-b border-line bg-sunken/60 px-3 py-2 text-left text-[12px] font-medium text-ink-3 first:w-10 first:pl-4 last:pr-4",
                          header.column.id === "action" && "w-28",
                        )}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      >
                        {field ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(header.column.id)}
                            className="inline-flex items-center gap-1 rounded hover:text-ink"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3 text-ink" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="size-3 text-ink" />
                            ) : (
                              <ArrowUpDown className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {columns.map((_, j) => (
                      <td key={j} className="border-b border-line px-3 py-3 first:pl-4">
                        <div className="skeleton h-3.5" style={{ width: `${40 + ((i + j) % 4) * 15}%` }} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading &&
                table.getRowModel().rows.map((row, index) => (
                  <Fragment key={row.id}>
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.25, delay: Math.min(index * 0.012, 0.2) }}
                      onClick={(event) => {
                        // Clicking anywhere on the row expands it, except on its own controls.
                        if ((event.target as HTMLElement).closest("button, input, a, [role=menu]")) return;
                        row.toggleExpanded();
                      }}
                      className={cn(
                        "cursor-pointer transition-colors duration-150 hover:bg-hover/45",
                        row.getIsSelected() && "bg-accent-soft/35",
                        row.getIsExpanded() && "bg-hover/40",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="border-b border-line px-3 py-2.5 align-middle first:pl-4 last:pr-4">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </motion.tr>
                    <AnimatePresence initial={false}>
                      {row.getIsExpanded() && (
                        <tr key={`${row.id}-detail`}>
                          <td colSpan={columns.length} className="border-b border-line bg-canvas/70 p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                              className="@container sticky left-0 overflow-hidden"
                              style={{ width: viewportWidth }}
                            >
                              <RowDetail
                                row={row.original}
                                datasetId={datasetId}
                                categories={categories}
                                threshold={threshold}
                                nearTie={nearTie}
                              />
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
        {!isLoading && page && page.items.length === 0 && (
          <EmptyState
            icon={<Search />}
            title="No rows match"
            description={
              query.search
                ? `Nothing matches "${query.search}" with the current status filter.`
                : "No rows have this status with the current decoder settings."
            }
            actions={
              <Button size="sm" onClick={() => { setSearch(""); onQueryChange({ status: "all", search: "", page: 1 }); }}>
                Clear filters
              </Button>
            }
          />
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-ink-3">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select
            value={query.page_size}
            onChange={(e) => onQueryChange({ page_size: Number(e.target.value), page: 1 })}
            className="w-[4.5rem] [&_select]:h-7 [&_select]:text-[12.5px]"
            aria-label="Rows per page"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="num">
            {int(from)}–{int(to)} of {int(page?.total ?? 0)}
          </span>
          <div className="flex gap-1">
            <Button
              size="icon-sm"
              variant="secondary"
              className="size-7"
              aria-label="Previous page"
              disabled={!page || page.page <= 1}
              onClick={() => onQueryChange({ page: query.page - 1 })}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              className="size-7"
              aria-label="Next page"
              disabled={!page || page.page >= page.pages}
              onClick={() => onQueryChange({ page: query.page + 1 })}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
