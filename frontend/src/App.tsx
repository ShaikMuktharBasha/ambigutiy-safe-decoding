import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { isApiError } from "@/api/client";
import { ActiveDatasetProvider } from "@/hooks/useActiveDataset";
import { AppLayout } from "@/layouts/AppLayout";
import { notifyError } from "@/lib/notify";

/** Code-split each page into its own chunk. */
function lazyPage<K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => loader().then((module) => ({ default: module[name] })));
}

const DashboardPage = lazyPage(() => import("@/pages/DashboardPage"), "DashboardPage");
const DatasetsPage = lazyPage(() => import("@/pages/DatasetsPage"), "DatasetsPage");
const DatasetDetailPage = lazyPage(() => import("@/pages/DatasetDetailPage"), "DatasetDetailPage");
const DecoderPage = lazyPage(() => import("@/pages/DecoderPage"), "DecoderPage");
const SimulatorPage = lazyPage(() => import("@/pages/SimulatorPage"), "SimulatorPage");
const ReviewPage = lazyPage(() => import("@/pages/ReviewPage"), "ReviewPage");
const AnalyticsPage = lazyPage(() => import("@/pages/AnalyticsPage"), "AnalyticsPage");
const AuditPage = lazyPage(() => import("@/pages/AuditPage"), "AuditPage");
const SettingsPage = lazyPage(() => import("@/pages/SettingsPage"), "SettingsPage");
const NotFoundPage = lazyPage(() => import("@/pages/NotFoundPage"), "NotFoundPage");

function page(element: ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="skeleton h-9 w-56" />
          <div className="skeleton h-40" />
        </div>
      }
    >
      {element}
    </Suspense>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 1,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Background queries surface failures inline; only unexpected server errors toast.
      if (query.meta?.silent) return;
      if (isApiError(error) && error.status >= 500) notifyError(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent) return;
      notifyError(error);
    },
  }),
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: page(<DashboardPage />) },
      { path: "datasets", element: page(<DatasetsPage />) },
      { path: "datasets/:datasetId", element: page(<DatasetDetailPage />) },
      { path: "decoder", element: page(<DecoderPage />) },
      { path: "simulator", element: page(<SimulatorPage />) },
      { path: "review", element: page(<ReviewPage />) },
      { path: "analytics", element: page(<AnalyticsPage />) },
      { path: "audit", element: page(<AuditPage />) },
      { path: "settings", element: page(<SettingsPage />) },
      { path: "*", element: page(<NotFoundPage />) },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveDatasetProvider>
        <MotionConfig reducedMotion="user">
          <RouterProvider router={router} />
          <Toaster
            position="bottom-right"
            gap={8}
            toastOptions={{
              classNames: {
                toast:
                  "!rounded-xl !border !border-line !bg-surface !text-ink !shadow-pop !font-sans !text-[13px]",
                description: "!text-ink-3",
                actionButton: "!bg-ink !text-canvas !rounded-md !font-medium",
                error: "[&_[data-icon]]:!text-rejected",
                success: "[&_[data-icon]]:!text-safe",
              },
            }}
          />
        </MotionConfig>
      </ActiveDatasetProvider>
    </QueryClientProvider>
  );
}
