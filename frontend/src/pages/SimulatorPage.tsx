import { AnimatePresence, motion } from "motion/react";
import { Code, Database, Dices, Equal, KeyRound, Plus, Scale, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProbabilityRuler } from "@/components/decoding/ProbabilityRuler";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, SegmentedControl } from "@/components/ui/Controls";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { PageHeader, Stagger, StaggerItem } from "@/components/ui/Layout";
import { useExampleVector, useGeminiClassify, useLoadDemo, useNormalizeVector } from "@/hooks/mutations";
import { useCompareModes, useDataset, useGeminiStatus, useSettings } from "@/hooks/queries";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";
import { MODE_META } from "@/lib/status";
import type { DecodeResponse, DecodeSettings, DecodingMode } from "@/types/api";

const DEFAULT_CATEGORIES = ["Electronics", "Furniture", "Clothing"];
const MAX_CATEGORIES = 10;

/** A near-tie starting vector (0.48 / 0.47 / rest) so the page opens on an interesting case. */
function startingVector(k: number): number[] {
  if (k === 2) return [0.52, 0.48];
  const rest = Math.round((0.05 / (k - 2)) * 10000) / 10000;
  const vector = [0.48, 0.47, ...Array(k - 2).fill(rest)];
  const drift = Math.round((1 - vector.reduce((a, b) => a + b, 0)) * 10000) / 10000;
  vector[k - 1] = Math.round((vector[k - 1] + drift) * 10000) / 10000;
  return vector;
}

function ModeCard({ mode, result, current }: { mode: DecodingMode; result: DecodeResponse; current: boolean }) {
  return (
    <motion.div layout className={cn("rounded-xl border bg-surface p-4", current ? "border-ink/60 shadow-card" : "border-line")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{MODE_META[mode].label}</span>
        {current && <span className="rounded bg-sunken px-1.5 py-0.5 text-[10.5px] font-medium text-ink-3">current</span>}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${result.status}-${result.prediction}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="mt-3"
        >
          <StatusBadge status={result.status} />
          <div className={cn("mt-2 text-[15px] font-medium", result.prediction ? "text-ink" : "italic text-ink-4")}>
            {result.prediction ?? "No category"}
          </div>
          <div className="mt-1 min-h-[18px] text-[12px] text-ink-3">
            {result.warning ? (
              <span className="text-uncertain-ink">⚠ {result.warning}</span>
            ) : result.prediction === null ? (
              "Abstains - sent to review"
            ) : result.status === "SAFE" ? (
              "Decoded"
            ) : (
              "Flagged for review"
            )}
          </div>
          {mode === "soft" && result.alternatives.length > 0 && result.status !== "SAFE" && (
            <div className="mt-2 text-[11.5px] text-ink-3">
              Alternatives:{" "}
              {result.alternatives.map((a) => `${a.category} ${pct(a.probability, 0)}`).join(", ")}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function GeminiCard({ categories, settings }: { categories: string[]; settings: DecodeSettings | undefined }) {
  const navigate = useNavigate();
  const status = useGeminiStatus();
  const classify = useGeminiClassify();
  const [text, setText] = useState("Gaming chair with built-in speakers");
  const configured = status.data?.configured;
  const result = classify.data;

  return (
    <Card>
      <CardHeader
        title="Generate predictions with Gemini"
        description="Optional. Gemini's scores are converted to a probability vector, then the local detector decides."
      />
      <CardBody>
        {!configured ? (
          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-sunken/50 p-4 text-[13px] text-ink-2">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <div className="flex-1">
              <p>
                <span className="font-medium text-ink">Unavailable:</span> no Gemini API key is configured. The simulator
                above works fully offline.
              </p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => navigate("/settings")}>
                Add a key in Settings
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Describe an item to classify" />
              <Button
                variant="primary"
                icon={<Sparkles />}
                loading={classify.isPending}
                disabled={!text.trim()}
                onClick={() => classify.mutate({ text, categories, ...(settings ?? {}) })}
              >
                Classify
              </Button>
            </div>
            {result && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <StatusBadge status={result.decode.status} />
                  <span className="font-medium text-ink">{result.decode.prediction ?? "No category"}</span>
                  <span className="text-ink-3">· {result.decode.reason}</span>
                </div>
                <ProbabilityRuler
                  entries={result.decode.top_k}
                  top1={{ category: result.decode.top_1, probability: result.decode.top_1_probability }}
                  top2={result.decode.top_2 ? { category: result.decode.top_2, probability: result.decode.top_2_probability ?? 0 } : null}
                  threshold={result.decode.threshold}
                  nearTie={result.decode.near_tie_threshold}
                  nearTieFlagged={result.decode.flags.includes("NEAR_TIE")}
                  status={result.decode.status}
                  gap={result.decode.gap}
                />
                <div className="text-[11.5px] text-ink-3">
                  Raw Gemini scores:{" "}
                  <span className="num">
                    {Object.entries(result.raw_scores)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ") || "none returned (uniform vector used)"}
                  </span>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function SimulatorPage() {
  const navigate = useNavigate();
  const { active } = useActiveDataset();
  const dataset = useDataset(active?.pipeline.has_encoding ? active.id : null);
  const settings = useSettings();
  const example = useExampleVector();
  const normalize = useNormalizeVector();
  const loadDemo = useLoadDemo();

  const datasetCategories = dataset.data?.encoding?.categories;
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [vector, setVector] = useState<number[]>(startingVector(3));
  const [customized, setCustomized] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [demoRows, setDemoRows] = useState<"100" | "300" | "500">("300");
  const [showRequest, setShowRequest] = useState(false);

  const datasetKey = datasetCategories?.join("|");
  useEffect(() => {
    if (!customized && datasetCategories && datasetCategories.length <= MAX_CATEGORIES) {
      setCategories(datasetCategories);
      setVector(startingVector(datasetCategories.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey, customized]);

  const decodeSettings = settings.data?.decode;
  const payload = useMemo(
    () => (decodeSettings ? { categories, probabilities: vector, ...decodeSettings } : null),
    [categories, vector, decodeSettings],
  );
  const debouncedPayload = useDebouncedValue(payload, 180);
  const compare = useCompareModes(debouncedPayload);
  const sum = vector.reduce((a, b) => a + b, 0);
  const tolerance = settings.data?.limits.probability_sum_tolerance ?? 0.001;
  const sumOk = Math.abs(sum - 1) <= tolerance;
  const strict = compare.data?.strict;

  const updateValue = (index: number, value: number) => {
    const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    setVector((v) => v.map((p, i) => (i === index ? Math.round(clamped * 10000) / 10000 : p)));
  };

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name || categories.includes(name) || categories.length >= MAX_CATEGORIES) return;
    setCustomized(true);
    setCategories((c) => [...c, name]);
    setVector((v) => [...v, 0]);
    setNewCategory("");
  };

  const removeCategory = (index: number) => {
    if (categories.length <= 2) return;
    setCustomized(true);
    setCategories((c) => c.filter((_, i) => i !== index));
    setVector((v) => v.filter((_, i) => i !== index));
  };

  const preset = (scenario: "safe" | "near_tie" | "low_confidence" | "random") =>
    example.mutate({ categories, scenario }, { onSuccess: (r) => setVector(r.probabilities) });

  return (
    <>
      <PageHeader
        title="Probability simulator"
        description="Build a probability vector by hand or from a preset and watch how standard argmax and each safe decoding mode respond."
      />

      <Stagger className="space-y-5">
        <StaggerItem>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <Card>
              <CardHeader
                title="Probability vector"
                description={
                  datasetCategories && !customized ? `Categories from ${active?.name}` : "Custom categories"
                }
                actions={
                  datasetCategories && customized ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={<Database />}
                      onClick={() => {
                        setCustomized(false);
                      }}
                    >
                      Use dataset categories
                    </Button>
                  ) : null
                }
              />
              <CardBody className="space-y-5">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" icon={<ShieldCheck />} onClick={() => preset("safe")} disabled={example.isPending}>
                    Safe
                  </Button>
                  <Button size="sm" icon={<Scale />} onClick={() => preset("near_tie")} disabled={example.isPending}>
                    Near tie
                  </Button>
                  <Button size="sm" icon={<TriangleAlert />} onClick={() => preset("low_confidence")} disabled={example.isPending}>
                    Low confidence
                  </Button>
                  <Button size="sm" icon={<Dices />} onClick={() => preset("random")} disabled={example.isPending}>
                    Random
                  </Button>
                </div>

                <ul className="space-y-3">
                  <AnimatePresence initial={false}>
                    {categories.map((category, index) => (
                      <motion.li
                        key={category}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid grid-cols-[minmax(0,7rem)_1fr_4.75rem_1.75rem] items-center gap-3"
                      >
                        <span className="truncate text-[13px] text-ink" title={category}>
                          {category}
                        </span>
                        <div className="relative h-5">
                          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line">
                            <motion.div
                              className={cn("h-full rounded-full", strict?.top_1 === category ? "bg-ink" : "bg-ink-3")}
                              animate={{ width: `${vector[index] * 100}%` }}
                              transition={{ type: "spring", stiffness: 300, damping: 32 }}
                            />
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={vector[index]}
                            aria-label={`${category} probability`}
                            onChange={(e) => updateValue(index, Number(e.target.value))}
                            className="asid-range absolute inset-0 h-5 w-full"
                          />
                        </div>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={vector[index]}
                          onChange={(e) => updateValue(index, Number(e.target.value))}
                          className="num h-8 px-2 text-right text-[12.5px]"
                          aria-label={`${category} value`}
                        />
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="size-7"
                          disabled={categories.length <= 2}
                          onClick={() => removeCategory(index)}
                          aria-label={`Remove ${category}`}
                        >
                          <X />
                        </Button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="text-ink-3">Sum</span>
                    <span className={cn("num rounded-md px-1.5 py-0.5", sumOk ? "bg-safe-soft text-safe-ink" : "bg-uncertain-soft text-uncertain-ink")}>
                      {sum.toFixed(4)}
                    </span>
                    {!sumOk && <span className="text-[12px] text-uncertain-ink">not a valid distribution</span>}
                  </div>
                  <Button size="sm" variant={sumOk ? "secondary" : "accent"} icon={<Equal />} loading={normalize.isPending} onClick={() => normalize.mutate(vector, { onSuccess: (r) => setVector(r.probabilities) })}>
                    Normalize to 1
                  </Button>
                </div>

                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCategory();
                  }}
                >
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder={categories.length >= MAX_CATEGORIES ? "Maximum of 10 categories" : "Add a category"}
                    disabled={categories.length >= MAX_CATEGORIES}
                    className="h-8 text-[13px]"
                  />
                  <Button type="submit" size="sm" icon={<Plus />} disabled={!newCategory.trim() || categories.includes(newCategory.trim())}>
                    Add
                  </Button>
                </form>
              </CardBody>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader
                  title="Safe decoding result"
                  description={
                    decodeSettings
                      ? `τ ${decodeSettings.confidence_threshold.toFixed(2)} · δ ${decodeSettings.near_tie_threshold.toFixed(3)} · top-${decodeSettings.top_k} (from Settings)`
                      : undefined
                  }
                  actions={
                    <Button size="xs" variant="ghost" icon={<Code />} onClick={() => setShowRequest((v) => !v)}>
                      {showRequest ? "Hide" : "API"} request
                    </Button>
                  }
                />
                <CardBody className="space-y-5">
                  <AnimatePresence initial={false}>
                    {showRequest && payload && (
                      <motion.pre
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="scrollbar-thin num overflow-auto rounded-lg bg-ink px-4 py-3 text-[11.5px] leading-relaxed text-canvas/90"
                      >
                        {`POST /api/decode\n${JSON.stringify({ ...payload, mode: decodeSettings?.mode }, null, 2)}`}
                      </motion.pre>
                    )}
                  </AnimatePresence>

                  {compare.isError ? (
                    <ErrorState
                      error={compare.error}
                      action={
                        <Button size="sm" icon={<Equal />} onClick={() => normalize.mutate(vector, { onSuccess: (r) => setVector(r.probabilities) })}>
                          Normalize vector
                        </Button>
                      }
                    />
                  ) : strict && compare.data ? (
                    <>
                      <div className={cn("transition-opacity", compare.isFetching && "opacity-70")}>
                        <ProbabilityRuler
                          entries={categories.map((c, i) => ({ category: c, probability: strict.probabilities[i] ?? vector[i] }))}
                          top1={{ category: strict.top_1, probability: strict.top_1_probability }}
                          top2={strict.top_2 ? { category: strict.top_2, probability: strict.top_2_probability ?? 0 } : null}
                          threshold={strict.threshold}
                          nearTie={strict.near_tie_threshold}
                          nearTieFlagged={strict.flags.includes("NEAR_TIE")}
                          status={strict.status}
                          gap={strict.gap}
                        />
                        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{strict.reason}</p>
                      </div>

                      <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-4">
                        <div className="rounded-xl border border-dashed border-line-strong bg-canvas/60 p-4">
                          <div className="text-[13px] font-semibold text-ink">Standard argmax</div>
                          <div className="mt-3 inline-flex rounded-md bg-sunken px-1.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                            Always decodes
                          </div>
                          <div className="mt-2 text-[15px] font-medium text-ink">{compare.data.argmax.prediction}</div>
                          <div className="mt-1 text-[12px] text-ink-3">at {pct(compare.data.argmax.confidence)}, no questions asked</div>
                        </div>
                        {(["strict", "soft", "advisory"] as DecodingMode[]).map((mode) => (
                          <ModeCard key={mode} mode={mode} result={compare.data[mode]} current={decodeSettings?.mode === mode} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <Skeleton className="h-16" />
                      <Skeleton className="h-24" />
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Generate demo dataset"
                description="A synthetic product catalogue with confident predictions, near ties, diffuse vectors and overconfident errors, decoded immediately."
              />
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-ink-3">Rows</span>
                  <SegmentedControl
                    size="sm"
                    ariaLabel="Demo rows"
                    value={demoRows}
                    onChange={setDemoRows}
                    options={[
                      { value: "100", label: "100" },
                      { value: "300", label: "300" },
                      { value: "500", label: "500" },
                    ]}
                  />
                </div>
                <Button
                  variant="primary"
                  icon={<Sparkles />}
                  loading={loadDemo.isPending}
                  onClick={() =>
                    loadDemo.mutate(
                      { rows: Number(demoRows), seed: Math.floor(Math.random() * 1_000_000) },
                      { onSuccess: () => navigate("/dashboard") },
                    )
                  }
                >
                  Generate Demo Dataset
                </Button>
              </CardBody>
            </Card>
            <GeminiCard categories={categories} settings={decodeSettings} />
          </div>
        </StaggerItem>
      </Stagger>
    </>
  );
}
