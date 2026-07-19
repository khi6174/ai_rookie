import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type PwaInstallStatus = "AVAILABLE" | "INSTALLED" | "UNAVAILABLE";

function isStandalone() {
  return typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
}

export function usePwaRuntime() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [shellReady, setShellReady] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then(() => setShellReady(true));
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const requestInstall = useCallback(async () => {
    if (!installEvent) return "UNAVAILABLE" as const;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
    return choice.outcome;
  }, [installEvent]);

  const installStatus: PwaInstallStatus = installed
    ? "INSTALLED"
    : installEvent
      ? "AVAILABLE"
      : "UNAVAILABLE";

  return { online, shellReady, installStatus, requestInstall };
}
