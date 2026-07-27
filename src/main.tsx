import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { RedesignPreview } from "./ui/RedesignPreview";
import { registerSafeRouteServiceWorker } from "./pwa/registerServiceWorker";
import "./ui/styles.css";
import "./ui/redesign.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    {window.location.pathname.startsWith("/design-preview") ? (
      <RedesignPreview />
    ) : (
      <App />
    )}
  </StrictMode>,
);

void registerSafeRouteServiceWorker();
