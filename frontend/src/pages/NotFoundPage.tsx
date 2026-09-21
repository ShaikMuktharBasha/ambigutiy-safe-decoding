import { Compass } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <EmptyState
        icon={<Compass />}
        title="Page not found"
        description="This address doesn't match any page in the app."
        actions={
          <Button variant="primary" onClick={() => navigate("/dashboard")}>
            Go to dashboard
          </Button>
        }
      />
    </Card>
  );
}
