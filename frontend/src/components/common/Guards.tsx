import { ArrowRight, Binary, Database, Sparkles, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { useDecodeDataset, useLoadDemo } from "@/hooks/mutations";
import { useSettings } from "@/hooks/queries";
import type { DatasetSummary } from "@/types/api";

export function NoDatasetState() {
  const loadDemo = useLoadDemo();
  const navigate = useNavigate();
  return (
    <Card>
      <EmptyState
        icon={<Database />}
        title="No dataset selected"
        description="Load the demo product catalogue or upload your own CSV / XLSX file to start decoding."
        actions={
          <>
            <Button variant="primary" icon={<Sparkles />} loading={loadDemo.isPending} onClick={() => loadDemo.mutate({})}>
              Load demo
            </Button>
            <Button icon={<Upload />} onClick={() => navigate("/datasets")}>
              Upload dataset
            </Button>
          </>
        }
      />
    </Card>
  );
}

export function PipelineIncompleteState({ dataset }: { dataset: DatasetSummary }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const decode = useDecodeDataset(dataset.id);
  const readyToDecode = dataset.pipeline.has_probabilities && !dataset.pipeline.has_results;

  const description = readyToDecode
    ? `Probability vectors for ${dataset.name} are ready. Run the safe decoder to classify each row as safe, uncertain, ambiguous or rejected.`
    : dataset.pipeline.has_encoding
      ? `Generate or import probability vectors for ${dataset.name} before decoding.`
      : `Select the categorical column of ${dataset.name} and generate probability vectors first.`;

  return (
    <Card>
      <EmptyState
        icon={<Binary />}
        title={readyToDecode ? "Ready to decode" : "Finish preparing this dataset"}
        description={description}
        actions={
          <>
            {readyToDecode && (
              <Button
                variant="primary"
                loading={decode.isPending}
                disabled={!settings.data}
                onClick={() => settings.data && decode.mutate(settings.data.decode)}
              >
                Run safe decoding
              </Button>
            )}
            <Button icon={<ArrowRight />} onClick={() => navigate(`/datasets/${dataset.id}`)}>
              Open dataset
            </Button>
          </>
        }
      />
    </Card>
  );
}
