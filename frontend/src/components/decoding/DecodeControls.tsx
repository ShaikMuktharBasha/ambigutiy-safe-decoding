import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl, Slider } from "@/components/ui/Controls";
import { MODE_META } from "@/lib/status";
import type { DecodeSettings, DecodingMode } from "@/types/api";

export function DecodeControls({
  value,
  onChange,
  maxTopK = 10,
}: {
  value: DecodeSettings;
  onChange: (value: DecodeSettings) => void;
  maxTopK?: number;
}) {
  const set = <K extends keyof DecodeSettings>(key: K, v: DecodeSettings[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-[13px] font-medium text-ink">Decoding mode</div>
        <SegmentedControl<DecodingMode>
          ariaLabel="Decoding mode"
          className="flex w-full"
          value={value.mode}
          onChange={(mode) => set("mode", mode)}
          options={(Object.keys(MODE_META) as DecodingMode[]).map((mode) => ({
            value: mode,
            label: MODE_META[mode].label,
            hint: MODE_META[mode].description,
          }))}
        />
        <div className="relative mt-2 min-h-[54px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={value.mode}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="text-xs leading-relaxed text-ink-3"
            >
              <span className="font-medium text-ink-2">{MODE_META[value.mode].verb}.</span>{" "}
              {MODE_META[value.mode].description}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <Slider
        label="Confidence threshold"
        value={value.confidence_threshold}
        onChange={(v) => set("confidence_threshold", v)}
        hint="Minimum top probability required to trust a prediction."
      />
      <Slider
        label="Near-tie threshold"
        value={value.near_tie_threshold}
        max={0.3}
        step={0.005}
        ticks={[0, 0.1, 0.2, 0.3]}
        format={(v) => v.toFixed(3)}
        onChange={(v) => set("near_tie_threshold", v)}
        hint="Minimum gap between the top two categories. Exact ties always fail."
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-ink">Top-k alternatives</div>
          <div className="text-xs text-ink-3">Ranked categories returned per row.</div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-sunken p-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label="Decrease top-k"
            disabled={value.top_k <= 1}
            onClick={() => set("top_k", value.top_k - 1)}
          >
            <Minus />
          </Button>
          <span className="num w-6 text-center text-[13px] text-ink">{value.top_k}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label="Increase top-k"
            disabled={value.top_k >= maxTopK}
            onClick={() => set("top_k", value.top_k + 1)}
          >
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  );
}
