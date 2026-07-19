export async function registerSafeRouteServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  const enableForTest = new URLSearchParams(window.location.search).has("pwa-test");
  if (!import.meta.env.PROD && !enableForTest) return null;

  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.warn("SafeRoute app shell을 등록하지 못했습니다.", error);
    return null;
  }
}
