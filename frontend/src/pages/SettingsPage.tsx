import { CircleCheck, CircleX, Eye, EyeOff, RotateCcw, Save, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiConnector } from "@/components/common/ApiConnector";
import { DecodeControls } from "@/components/decoding/DecodeControls";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Controls";
import { Skeleton } from "@/components/ui/Feedback";
import { PageHeader, Stagger, StaggerItem } from "@/components/ui/Layout";
import { useApplySettings, useUpdateGeminiConfig } from "@/hooks/mutations";
import { useGeminiStatus, useHealth, useSettings } from "@/hooks/queries";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { cn } from "@/lib/cn";
import { int } from "@/lib/format";
import { sameSettings } from "@/lib/rows";
import type { DecodeSettings, GeminiStatus } from "@/types/api";

const CUSTOM_MODEL = "__custom__";

function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2 text-[13px] last:border-b-0">
      <span className="text-ink-3">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  );
}

function GeminiSettingsCard() {
  const gemini = useGeminiStatus();
  const updateConfig = useUpdateGeminiConfig();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelInput, setModelInput] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState(false);

  const data = gemini.data;

  useEffect(() => {
    if (data && modelInput === null) {
      setModelInput(data.model);
      setCustomModel(!data.model_choices.includes(data.model));
    }
  }, [data, modelInput]);

  function syncFrom(status: GeminiStatus) {
    setApiKeyInput("");
    setModelInput(status.model);
    setCustomModel(!status.model_choices.includes(status.model));
  }

  if (!data) {
    return (
      <Card>
        <CardHeader title="Gemini API" description="Optional provider for demo classification" />
        <CardBody className="space-y-3">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </CardBody>
      </Card>
    );
  }

  const effectiveModel = modelInput ?? data.model;
  const modelChanged = effectiveModel.trim() !== "" && effectiveModel.trim() !== data.model;
  const keyDirty = apiKeyInput.trim().length > 0;
  const canSave = keyDirty || modelChanged;

  function save() {
    const payload: { api_key?: string; model?: string } = {};
    if (keyDirty) payload.api_key = apiKeyInput.trim();
    if (modelChanged) payload.model = effectiveModel.trim();
    updateConfig.mutate(payload, { onSuccess: syncFrom });
  }

  return (
    <Card>
      <CardHeader
        title="Gemini API"
        description="Optional provider for demo classification. Set a key here, or via GEMINI_API_KEY in backend/.env."
        actions={
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium",
              data.configured ? "bg-safe-soft text-safe-ink" : "bg-sunken text-ink-3",
            )}
          >
            {data.configured ? <CircleCheck className="size-3" /> : <CircleX className="size-3" />}
            {data.configured ? "Configured" : "Not configured"}
          </span>
        }
      />
      <CardBody className="space-y-4">
        <Field
          label="API key"
          hint={
            data.key_preview
              ? `Currently ${data.key_preview} (${data.source === "settings" ? "set here" : "from backend/.env"}). Paste a new key to replace it.`
              : "No key configured. The Gemini buttons elsewhere in the app are shown as unavailable until one is set."
          }
        >
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="Paste your Gemini API key"
              autoComplete="off"
              spellCheck={false}
              className="pr-9"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowKey((value) => !value)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 transition-colors hover:text-ink"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Field label="Model">
          <Select
            value={customModel ? CUSTOM_MODEL : effectiveModel}
            onChange={(event) => {
              if (event.target.value === CUSTOM_MODEL) {
                setCustomModel(true);
              } else {
                setCustomModel(false);
                setModelInput(event.target.value);
              }
            }}
          >
            {data.model_choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
            {!data.model_choices.includes(effectiveModel) && effectiveModel && (
              <option value={effectiveModel}>{effectiveModel} (current)</option>
            )}
            <option value={CUSTOM_MODEL}>Custom</option>
          </Select>
          {customModel && (
            <Input
              className="mt-2"
              value={effectiveModel}
              onChange={(event) => setModelInput(event.target.value)}
              placeholder="e.g. gemini-2.5-pro"
            />
          )}
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={updateConfig.isPending || data.source !== "settings"}
              onClick={() => updateConfig.mutate({ api_key: "" }, { onSuccess: syncFrom })}
            >
              Clear key
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={updateConfig.isPending || !data.model_is_custom}
              onClick={() => updateConfig.mutate({ model: "" }, { onSuccess: syncFrom })}
            >
              Reset model to default
            </Button>
          </div>
          <Button variant="primary" size="sm" icon={<Save />} loading={updateConfig.isPending} disabled={!canSave} onClick={save}>
            Save
          </Button>
        </div>

        {data.source === "environment" && (
          <p className="text-xs leading-relaxed text-ink-3">
            Currently using the key from <code className="num rounded bg-sunken px-1 py-px">GEMINI_API_KEY</code> in
            backend/.env. Saving a key above overrides it for this app. Clear key only removes a key set here, not the
            environment one.
          </p>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-[12.5px]">
          <span className="text-ink-3">Max rows per request</span>
          <span className="num text-right text-ink">{data.max_rows}</span>
          <span className="text-ink-3">Batch size</span>
          <span className="num text-right text-ink">{data.batch_size}</span>
        </div>
      </CardBody>
    </Card>
  );
}

export function SettingsPage() {
  const { active } = useActiveDataset();
  const settings = useSettings();
  const health = useHealth();
  const apply = useApplySettings();
  const [draft, setDraft] = useState<DecodeSettings | null>(null);

  useEffect(() => {
    if (settings.data && draft === null) setDraft(settings.data.decode);
  }, [settings.data, draft]);

  const dirty = Boolean(draft && settings.data && !sameSettings(draft, settings.data.decode));
  const canDecode = Boolean(active?.pipeline.has_probabilities);

  return (
    <>
      <PageHeader title="Settings" description="Defaults used by the decoder, the simulator and every dataset decode." />
      <Stagger className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <StaggerItem>
          <Card>
            <CardHeader title="Decoder" description="Confidence threshold, near-tie threshold, top-k and decoding mode" />
            <CardBody>
              {draft && settings.data ? (
                <>
                  <DecodeControls value={draft} onChange={setDraft} maxTopK={settings.data.limits.max_top_k} />
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <Button variant="ghost" icon={<RotateCcw />} onClick={() => setDraft(settings.data.defaults)}>
                      Restore defaults
                    </Button>
                    <div className="flex items-center gap-3">
                      {canDecode && dirty && (
                        <span className="text-[12px] text-ink-3">Also re-decodes {active?.name}</span>
                      )}
                      <Button
                        variant="primary"
                        icon={<Save />}
                        loading={apply.isPending}
                        disabled={!dirty}
                        onClick={() => apply.mutate({ settings: draft, datasetId: canDecode ? active?.id : null, notify: true })}
                      >
                        Save settings
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              )}
            </CardBody>
          </Card>
        </StaggerItem>

        <StaggerItem className="space-y-5">
          <GeminiSettingsCard />

          <Card>
            <CardHeader
              title="API"
              actions={
                <span className={cn("inline-flex items-center gap-1.5 text-[12px]", health.isSuccess ? "text-safe-ink" : "text-rejected-ink")}>
                  <Server className="size-3.5" />
                  {health.isSuccess ? "Online" : health.isError ? "Offline" : "Checking"}
                </span>
              }
            />
            <CardBody>
              <KeyValue label="Version">
                <span className="num">{health.data?.version ?? "—"}</span>
              </KeyValue>
              <KeyValue label="Environment">{health.data?.environment ?? "—"}</KeyValue>
              <KeyValue label="Datasets loaded">
                <span className="num">{health.data ? int(health.data.datasets) : "—"}</span>
              </KeyValue>
              {settings.data && (
                <>
                  <KeyValue label="Upload limit">
                    <span className="num">{settings.data.limits.max_upload_mb} MB</span>
                  </KeyValue>
                  <KeyValue label="Max rows / columns">
                    <span className="num">
                      {int(settings.data.limits.max_rows)} / {int(settings.data.limits.max_columns)}
                    </span>
                  </KeyValue>
                  <KeyValue label="Max categories">
                    <span className="num">{settings.data.limits.max_categories}</span>
                  </KeyValue>
                  <KeyValue label="Sum tolerance">
                    <span className="num">±{settings.data.limits.probability_sum_tolerance}</span>
                  </KeyValue>
                </>
              )}
              <div className="border-t border-line pt-3">
                <div className="mb-2 text-[12.5px] font-medium text-ink">Backend Connection</div>
                <ApiConnector compact />
              </div>
              <a
                href="/api/docs"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[12.5px] text-accent-ink underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
              >
                Open interactive API docs
              </a>
            </CardBody>
          </Card>
        </StaggerItem>
      </Stagger>
    </>
  );
}
