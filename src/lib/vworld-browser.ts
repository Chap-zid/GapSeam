import type { LocationEvidence } from "./types";

type JsonRecord = Record<string, unknown>;
type Coordinate = { longitude: number; latitude: number; refinedAddress: string };

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonp(url: string, params: URLSearchParams) {
  return new Promise<unknown>((resolve, reject) => {
    const callback = `__spaceEumVWorld${Date.now()}${Math.random().toString(36).slice(2)}`;
    const registry = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error("VWorld browser request timed out")), 7_000);
    const finish = (error?: Error, value?: unknown) => {
      window.clearTimeout(timeout);
      script.remove();
      delete registry[callback];
      if (error) reject(error); else resolve(value);
    };
    registry[callback] = (value: unknown) => finish(undefined, value);
    params.set("callback", callback);
    script.src = `${url}?${params}`;
    script.async = true;
    script.onerror = () => finish(new Error("VWorld browser request failed"));
    document.head.appendChild(script);
  });
}

async function geocode(address: string, key: string, type: "ROAD" | "PARCEL") {
  const params = new URLSearchParams({ service: "address", request: "getCoord", version: "2.0", crs: "EPSG:4326", address, refine: "true", simple: "false", format: "json", errorFormat: "json", type, key });
  const response = asRecord(asRecord(await jsonp("https://api.vworld.kr/req/address", params)).response);
  if (response.status !== "OK") throw new Error(`VWorld ${type} address not found`);
  const point = asRecord(asRecord(response.result).point);
  const refined = asRecord(response.refined);
  const longitude = Number(point.x);
  const latitude = Number(point.y);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw new Error("VWorld returned invalid coordinates");
  return { longitude, latitude, refinedAddress: typeof refined.text === "string" ? refined.text : address } satisfies Coordinate;
}

function bbox(origin: Coordinate) {
  const latitudeDelta = 2 / 111.32;
  const longitudeDelta = 2 / (111.32 * Math.max(Math.cos(origin.latitude * Math.PI / 180), 0.2));
  return [origin.longitude - longitudeDelta, origin.latitude - latitudeDelta, origin.longitude + longitudeDelta, origin.latitude + latitudeDelta].join(",");
}

function distanceMeters(origin: Coordinate, longitude: number, latitude: number) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(latitude - origin.latitude);
  const longitudeDelta = toRadians(longitude - origin.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(origin.latitude)) * Math.cos(toRadians(latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function nearestPlace(origin: Coordinate, key: string, category: string) {
  const params = new URLSearchParams({ service: "search", request: "search", version: "2.0", crs: "EPSG:4326", size: "20", page: "1", query: category, type: "PLACE", bbox: bbox(origin), format: "json", errorFormat: "json", key });
  const response = asRecord(asRecord(await jsonp("https://api.vworld.kr/req/search", params)).response);
  if (response.status !== "OK") return null;
  const items = asArray(asRecord(response.result).items).flatMap((raw) => {
    const item = asRecord(raw);
    const point = asRecord(item.point);
    const longitude = Number(point.x);
    const latitude = Number(point.y);
    const name = typeof item.title === "string" ? item.title.replace(/<[^>]+>/g, "").trim() : "";
    if (!name || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
    return [{ category, name, distanceMeters: distanceMeters(origin, longitude, latitude) }];
  });
  return items.sort((left, right) => left.distanceMeters - right.distanceMeters)[0] || null;
}

async function landUse(origin: Coordinate, key: string, domain: string, id: string, fallback: string) {
  const params = new URLSearchParams({ service: "data", request: "GetFeature", version: "2.0", data: id, geomFilter: `POINT(${origin.longitude} ${origin.latitude})`, geometry: "false", size: "10", page: "1", crs: "EPSG:4326", format: "json", errorFormat: "json", key, domain });
  const response = asRecord(asRecord(await jsonp("https://api.vworld.kr/req/data", params)).response);
  if (response.status !== "OK") return [];
  const features = asArray(asRecord(asRecord(response.result).featureCollection).features);
  return features.map((feature) => {
    const properties = asRecord(asRecord(feature).properties);
    return typeof properties.uname === "string" && properties.uname ? properties.uname : fallback;
  });
}

export async function getBrowserLocationEvidence(address: string, token: string): Promise<LocationEvidence | null> {
  if (typeof window === "undefined") return null;
  try {
    const configResponse = await fetch("/api/vworld/config", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!configResponse.ok) return null;
    const config = await configResponse.json() as { key?: string; domain?: string };
    if (!config.key) return null;
    let origin: Coordinate;
    try { origin = await geocode(address, config.key, "ROAD"); }
    catch { origin = await geocode(address, config.key, "PARCEL"); }
    const [facilityResults, landUseResults] = await Promise.all([
      Promise.all(["학교", "버스정류장", "편의점"].map((category) => nearestPlace(origin, config.key!, category).catch(() => null))),
      Promise.all([
        ["LT_C_UQ111", "도시지역"], ["LT_C_UQ112", "관리지역"], ["LT_C_UQ113", "농림지역"], ["LT_C_UQ114", "자연환경보전지역"],
      ].map(([id, label]) => landUse(origin, config.key!, config.domain || window.location.host, id, label).catch(() => []))),
    ]);
    const facilities = facilityResults.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const uses = [...new Set(landUseResults.flat())];
    const area = origin.refinedAddress.split(" ").filter(Boolean).slice(0, 3).join(" ");
    const summary = [uses[0] || area, ...facilities.map((facility) => `${facility.category} ${facility.distanceMeters.toLocaleString("ko-KR")}m`)].join(" · ");
    return { source: "vworld", refinedAddress: origin.refinedAddress, summary, facilities, landUse: uses };
  } catch {
    return null;
  }
}
