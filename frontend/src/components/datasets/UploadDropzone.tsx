import { AnimatePresence, motion } from "motion/react";
import { FileUp } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/Spinner";
import { useUploadDataset } from "@/hooks/mutations";
import { useSettings } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { bytes } from "@/lib/format";

const ACCEPTED = [".csv", ".xlsx"];

export function UploadDropzone({ onUploaded }: { onUploaded?: (datasetId: string) => void }) {
  const upload = useUploadDataset();
  const settings = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const maxMb = settings.data?.limits.max_upload_mb ?? 10;

  const handleFile = (candidate: File | null | undefined) => {
    if (!candidate || upload.isPending) return;
    const extension = candidate.name.slice(candidate.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED.includes(extension)) {
      toast.error("Unsupported file type", { description: `"${candidate.name}" is not a .csv or .xlsx file.` });
      return;
    }
    if (candidate.size > maxMb * 1024 * 1024) {
      toast.error("File too large", { description: `${bytes(candidate.size)} exceeds the ${maxMb} MB upload limit.` });
      return;
    }
    setFile(candidate);
    upload.mutate(candidate, {
      onSuccess: (dataset) => onUploaded?.(dataset.id),
      onSettled: () => {
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      },
    });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <motion.div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
      animate={{ scale: dragging ? 1.008 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "relative flex min-h-[210px] flex-col items-center justify-center overflow-hidden rounded-card border-[1.5px] border-dashed px-6 py-10 text-center transition-colors duration-200",
        dragging ? "border-accent bg-accent-soft/40" : "border-line-strong bg-surface hover:border-ink-4",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
        aria-label="Upload a CSV or XLSX file"
      />
      <AnimatePresence mode="wait">
        {upload.isPending && file ? (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex w-full max-w-sm flex-col items-center"
          >
            <Spinner className="size-5 text-accent" />
            <p className="mt-3 text-sm font-medium text-ink">Parsing {file.name}</p>
            <p className="mt-0.5 text-xs text-ink-3">{bytes(file.size)} · detecting columns and categorical values</p>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-sunken">
              <motion.div
                className="h-full w-1/3 rounded-full bg-accent"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-col items-center"
          >
            <motion.div
              animate={dragging ? { y: -4, rotate: -4 } : { y: 0, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className={cn(
                "mb-4 flex size-12 items-center justify-center rounded-xl border transition-colors",
                dragging ? "border-accent/40 bg-surface text-accent" : "border-line bg-sunken text-ink-3",
              )}
            >
              <FileUp className="size-5" />
            </motion.div>
            <p className="text-[15px] font-medium text-ink">{dragging ? "Release to upload" : "Drop a CSV or Excel file here"}</p>
            <p className="mt-1 text-sm text-ink-3">
              or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-medium text-accent-ink underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
              >
                browse your computer
              </button>
            </p>
            <p className="mt-4 text-xs text-ink-4">.csv or .xlsx · up to {maxMb} MB · the first worksheet is used</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
