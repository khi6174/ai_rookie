const kakaoMapsSdkOrigin = "https://dapi.kakao.com";
const kakaoMapsScriptSelector = "script[data-saferoute-kakao-map]";

export type KakaoLatLng = object;

export type KakaoMapInstance = {
  relayout(): void;
  panTo(point: KakaoLatLng): void;
  setBounds(
    bounds: KakaoLatLngBounds,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number,
  ): void;
};

export type KakaoLatLngBounds = {
  extend(point: KakaoLatLng): void;
};

export type KakaoMapOverlay = {
  setMap(map: KakaoMapInstance | null): void;
};

export type KakaoCustomOverlay = KakaoMapOverlay & {
  setPosition(position: KakaoLatLng): void;
};

export type KakaoMapsNamespace = {
  load(callback: () => void): void;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMapInstance;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Polyline: new (options: {
    map: KakaoMapInstance;
    path: KakaoLatLng[];
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeStyle: string;
    zIndex?: number;
  }) => KakaoMapOverlay;
  CustomOverlay: new (options: {
    map: KakaoMapInstance;
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoCustomOverlay;
};

declare global {
  interface Window {
    kakao?: { maps?: KakaoMapsNamespace };
  }
}

let kakaoMapsPromise: Promise<KakaoMapsNamespace> | undefined;

export function createKakaoMapsScriptUrl(javaScriptKey: string) {
  const normalizedKey = javaScriptKey.trim();
  if (!normalizedKey) throw new Error("Kakao Maps JavaScript key is required");
  if (/\s/.test(normalizedKey)) {
    throw new Error("Kakao Maps JavaScript key cannot contain whitespace");
  }
  const url = new URL("/v2/maps/sdk.js", kakaoMapsSdkOrigin);
  url.searchParams.set("appkey", normalizedKey);
  url.searchParams.set("autoload", "false");
  return url.toString();
}

export function loadKakaoMapsSdk(
  javaScriptKey: string,
  timeoutMs = 10_000,
): Promise<KakaoMapsNamespace> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Kakao Maps SDK requires a browser"));
  }
  const existingMaps = window.kakao?.maps;
  if (existingMaps?.Map) return Promise.resolve(existingMaps);
  if (kakaoMapsPromise) return kakaoMapsPromise;

  kakaoMapsPromise = new Promise<KakaoMapsNamespace>((resolve, reject) => {
    const finish = () => {
      const maps = window.kakao?.maps;
      if (!maps) {
        kakaoMapsPromise = undefined;
        reject(new Error("Kakao Maps SDK loaded without a maps namespace"));
        return;
      }
      maps.load(() => resolve(maps));
    };
    const existingScript = document.querySelector<HTMLScriptElement>(
      kakaoMapsScriptSelector,
    );
    const script = existingScript ?? document.createElement("script");
    const timer = window.setTimeout(() => {
      kakaoMapsPromise = undefined;
      reject(new Error("Kakao Maps SDK load timed out"));
    }, timeoutMs);
    script.addEventListener("load", () => {
      window.clearTimeout(timer);
      finish();
    }, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(timer);
      kakaoMapsPromise = undefined;
      reject(new Error("Kakao Maps SDK failed to load"));
    }, { once: true });
    if (!existingScript) {
      script.async = true;
      script.dataset.saferouteKakaoMap = "true";
      script.src = createKakaoMapsScriptUrl(javaScriptKey);
      document.head.append(script);
    }
  });

  return kakaoMapsPromise;
}
