import { AnimatePresence, motion } from "motion/react";
import { Dices, KeyRound, Sparkles, TableProperties, WandSparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Field, Input, SegmentedControl, Select, Slider, Switch } from "@/components/ui/Controls";
import { useGeminiDataset, useImportProbabilityColumns, useSimulateDataset } from "@/hooks/mutations";
import { useGeminiStatus } from "@/hooks/queries";
import { pct } from "@/lib/format";
import { SCENARIO_LABEL } from "@/lib/rows";
import type { DatasetDetail, Scenario } from "@/types/api";

type Source = "simulate" | "columns" | "gemini";

const DEFAULT_MIX: Record<Scenario, number> = {
  confident: 0.55,
  moderate: 0.12,
  near_tie: 0.18,
  low_confidence: 0.1,
  overconfident_error: 0.05,
};

const SCENARIO_HINT: Record<Scenario, string> = {
  confident: "True category clearly wins, e.g. 0.91 / 0.06 / 0.03.",
  moderate: "True category wins with a clear gap, but below the threshold.",
  near_tie: "Top two within a few points; sometimes the wrong one is on top.",
  low_confidence: "A diffuse, almost uniform vector.",
  overconfident_error: "A wrong category with high confidence. No confidence check can catch these.",
};

function SimulatePanel({ dataset }: { dataset: DatasetDetail }) {
  const simulate = useSimulateDataset(dataset.id);
  const meta = dataset.pipeline.probability_meta;
  const [mix, setMix] = useState<Record<Scenario, number>>({ ...DEFAULT_MIX, ...(meta.mix ?? {}) });
  const [seed, setSeed] = useState<string>(meta.seed !== undefined ? String(meta.seed) : "42");
  const total = Object.values(mix).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        {(Object.keys(DEFAULT_MIX) as Scenario[]).map((scenario) => (
          <Slider
            key={scenario}
            label={SCENARIO_LABEL[scenario]}
            value={mix[scenario]}
            onChange={(value) => setMix((m) => ({ ...m, [scenario]: value }))}
            format={() => (total > 0 ? pct(mix[scenario] / total, 0) : "0%")}
            ticks={[]}
            hint={SCENARIO_HINT[scenario]}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <Field label="Random seed" className="w-40">
          <Input
            type="number"
            min={0}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
            className="num"
          />
        </Field>
        <Button variant="ghost" icon={<Dices />} onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000)))}>
          Shuffle seed
        </Button>
        <Button variant="ghost" onClick={() => setMix(DEFAULT_MIX)}>
          Default mix
        </Button>
        <Button
          variant="primary"
          className="ml-auto"
          icon={<WandSparkles />}
          loading={simulate.isPending}
          disabled={total <= 0}
          onClick={() => simulate.mutate({ seed: seed === "" ? null : Number(seed), mix })}
        >
          {dataset.pipeline.has_probabilities ? "Regenerate vectors" : "Generate probability vectors"}
        </Button>
      </div>
    </div>
  );
}

function ColumnsPanel({ dataset }: { dataset: DatasetDetail }) {
  const importColumns = useImportProbabilityColumns(dataset.id);
  const categories = dataset.encoding?.categories ?? [];
  const [mapping, setMapping] = useState<Record<string, string>>({ ...dataset.suggested_probability_columns });
  const [normalize, setNormalize] = useState(false);
  const complete = categories.every((c) => mapping[c]);

  if (dataset.numeric_columns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-6 text-sm leading-relaxed text-ink-3">
        This file has no numeric columns. To supply your own vectors, add one probability column per category, for example{" "}
        <code className="num rounded bg-sunken px-1 text-ink-2">p_{categories[0] ?? "Category"}</code>, and upload it again.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink-3">
        Map one numeric column to each category. Every row is validated: values must be between 0 and 1 and sum to 1.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((category) => (
          <Field key={category} label={category}>
            <Select value={mapping[category] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [category]: e.target.value }))}>
              <option value="">Choose a column…</option>
              {dataset.numeric_columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Switch checked={normalize} onChange={setNormalize} label="Normalise rows that don't sum to 1" />
        <Button
          variant="primary"
          icon={<TableProperties />}
          loading={importColumns.isPending}
          disabled={!complete}
          onClick={() => importColumns.mutate({ mapping, normalize })}
        >
          Import probability columns
        </Button>
      </div>
    </div>
  );
}

function GeminiPanel({ dataset }: { dataset: DatasetDetail }) {
  const navigate = useNavigate();
  const status = useGeminiStatus();
  const run = useGeminiDataset(dataset.id);
  const textColumns = dataset.text_columns.filter((c) => c !== dataset.target_column);
  const [column, setColumn] = useState(textColumns.find((c) => /name|title|desc/i.test(c)) ?? textColumns[0] ?? "");
  const [rows, setRows] = useState<string>("");

  if (!status.data?.configured) {
    return (
      <div className="rounded-xl border border-line bg-sunken/50 p-4">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-ink-3" />
          <div className="text-[13px] leading-relaxed text-ink-2">
            <p className="font-medium text-ink">Gemini is not configured (unavailable)</p>
            <p className="mt-1">
              Add an API key in Settings, or set <code className="num rounded bg-surface px-1">GEMINI_API_KEY</code> in
              backend/.env. Everything else in the app works with simulated vectors.
            </p>
          </div>
        </div>
        <Button className="mt-4" variant="secondary" onClick={() => navigate("/settings")}>
          Add a key in Settings
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-ink-3">
        Gemini scores each row's text against the categories. Its scores are converted to probability vectors and then
        pass through the same local safety checks. Gemini never makes the final decision.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Text column to classify">
          <Select value={column} onChange={(e) => setColumn(e.target.value)}>
            {textColumns.length === 0 && <option value="">No text columns</option>}
            {textColumns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rows to score" hint={`Up to ${status.data.max_rows}; remaining rows use simulated vectors.`}>
          <Input type="number" min={1} max={status.data.max_rows} value={rows} placeholder={String(status.data.max_rows)} onChange={(e) => setRows(e.target.value)} className="num" />
        </Field>
      </div>
      <div className="flex justify-end border-t border-line pt-4">
        <Button
          variant="primary"
          icon={<Sparkles />}
          loading={run.isPending}
          disabled={!column}
          onClick={() => run.mutate({ text_column: column, max_rows: rows ? Number(rows) : null })}
        >
          Generate predictions with Gemini
        </Button>
      </div>
    </div>
  );
}

export function ProbabilitySourcePanel({ dataset }: { dataset: DatasetDetail }) {
  const initial: Source =
    dataset.pipeline.probability_source === "uploaded"
      ? "columns"
      : dataset.pipeline.probability_source === "gemini" || dataset.pipeline.probability_source === "mixed"
        ? "gemini"
        : "simulate";
  const [source, setSource] = useState<Source>(initial);

  return (
    <div>
      <SegmentedControl<Source>
        ariaLabel="Probability source"
        value={source}
        onChange={setSource}
        options={[
          { value: "simulate", label: "Simulate" },
          { value: "columns", label: "From columns" },
          { value: "gemini", label: "Gemini" },
        ]}
      />
      <div className="mt-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={source}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {source === "simulate" && <SimulatePanel dataset={dataset} />}
            {source === "columns" && <ColumnsPanel dataset={dataset} />}
            {source === "gemini" && <GeminiPanel dataset={dataset} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
