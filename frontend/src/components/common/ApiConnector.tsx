import { Globe, Loader2, RefreshCw, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getApiBase, getCustomApiBase, resetCustomApiBase, setCustomApiBase } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Controls";

interface ApiConnectorProps {
  onConnected?: () => void;
  compact?: boolean;
}

export function ApiConnector({ onConnected, compact }: ApiConnectorProps) {
  const [urlInput, setUrlInput] = useState(() => getCustomApiBase());
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function handleConnect(overrideUrl?: string) {
    const targetUrl = (overrideUrl ?? urlInput).trim();
    setTesting(true);
    setStatusMsg("Testing connection... (Render free instances may take ~30-45s to wake up)");

    try {
      // Clean base url
      const clean = targetUrl.replace(/\/+$/, "");
      const baseWithProtocol = clean
        ? clean.startsWith("http://") || clean.startsWith("https://")
          ? clean
          : `https://${clean}`
        : "";

      const testEndpoint = baseWithProtocol
        ? `${baseWithProtocol.endsWith("/api") ? baseWithProtocol : `${baseWithProtocol}/api`}/health`
        : "/api/health";

      const res = await fetch(testEndpoint, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(45000),
      });

      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }

      const data = await res.json();
      if (data && data.status === "ok") {
        setCustomApiBase(clean);
        toast.success(`Connected to API (v${data.version || "1.0.0"})!`);
        setStatusMsg(null);
        if (onConnected) {
          onConnected();
        } else {
          window.location.reload();
        }
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err: any) {
      toast.error(`Connection failed: ${err.message || "Cannot reach server"}`);
      setStatusMsg(`Connection failed: ${err.message || "Make sure the backend is active."}`);
    } finally {
      setTesting(false);
    }
  }

  function handleReset() {
    resetCustomApiBase();
    setUrlInput("");
    toast.info("Reset API URL to default");
    window.location.reload();
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="e.g. https://asid-backend.onrender.com"
            className="flex-1 text-xs"
          />
          <Button
            size="sm"
            variant="primary"
            loading={testing}
            onClick={() => handleConnect()}
            icon={testing ? <Loader2 className="animate-spin" /> : <Globe />}
          >
            Connect
          </Button>
        </div>
        {statusMsg && <p className="text-xs text-ink-3">{statusMsg}</p>}
      </div>
    );
  }

  return (
    <Card className="border-line shadow-card">
      <CardHeader
        title="Connect Backend API"
        description="Set the Render Web Service URL for your FastAPI backend"
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <Server className="size-3.5" />
            Current: <code className="num rounded bg-sunken px-1.5 py-0.5">{getApiBase()}</code>
          </span>
        }
      />
      <CardBody className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink">
            FastAPI Backend URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://asid-backend.onrender.com"
              className="flex-1"
              disabled={testing}
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                loading={testing}
                onClick={() => handleConnect()}
                icon={testing ? <Loader2 className="animate-spin" /> : <Globe />}
              >
                Connect API
              </Button>
              {urlInput && (
                <Button variant="ghost" disabled={testing} onClick={handleReset} icon={<RefreshCw />}>
                  Reset
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Copy the Web Service URL from your Render dashboard (e.g. <code className="num text-ink-2">https://asid-backend-xxxx.onrender.com</code>) and paste it above.
          </p>
        </div>

        {statusMsg && (
          <div className="rounded-lg border border-line bg-sunken/60 p-3 text-xs text-ink-2">
            {statusMsg}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
