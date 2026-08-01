import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { registerSafeRouteServiceWorker } from "./pwa/registerServiceWorker";
import "./ui/styles.css";
import "./tokens/colors.css";
import "./tokens/typography.css";
import "./tokens/radii.css";
import "./ui/redesign.css";
import "./ui/operations.css";

const OperationsService = lazy(() =>
  import("./ui/OperationsService").then((module) => ({
    default: module.OperationsService,
  })),
);
const OperationsRiderService = lazy(() =>
  import("./ui/OperationsRiderService").then((module) => ({
    default: module.OperationsRiderService,
  })),
);
const RedesignPreview = lazy(() =>
  import("./ui/RedesignPreview").then((module) => ({
    default: module.RedesignPreview,
  })),
);
const OnePageDashboardDemo = lazy(() =>
  import("./ui/OnePageDashboardDemo").then((module) => ({
    default: module.OnePageDashboardDemo,
  })),
);

const root = document.getElementById("root");
const pathname = window.location.pathname;

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <Suspense
      fallback={
        <main className="app-loading" role="status" aria-live="polite">
          SafeRoute 화면을 불러오는 중입니다.
        </main>
      }
    >
      {pathname === "/" || pathname.startsWith("/dashboard-demo") ? (
        <OnePageDashboardDemo />
      ) : pathname.startsWith("/closed-loop-demo") ? (
        <App />
      ) : pathname.startsWith("/stage") ? (
        <App stageMode />
      ) : pathname.startsWith("/operations/rider") ? (
        <OperationsRiderService />
      ) : pathname.startsWith("/operations") ? (
        <OperationsService />
      ) : pathname.startsWith("/design-preview") ? (
        <RedesignPreview />
      ) : (
        <App />
      )}
    </Suspense>
  </StrictMode>,
);

void registerSafeRouteServiceWorker();
