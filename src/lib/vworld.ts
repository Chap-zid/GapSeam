import "server-only";

type JsonRecord = Record<string, unknown>;

export type NearbyFacility = {
  category: string;
  name: string;
  distanceMeters: number;
};

export type LocationContext = {
  source: "vworld" | "fallback";
  status: string;
  refinedAddress: string;
  summary: string;
  facilities: NearbyFacility[];
  landUse: string[];
};

type Coordinate = {
  longitude: number;
  latitude: number;
  refinedAddress: string;
};

const FALLBACK_SUMMARY = "주거지역 · 학교 420m · 버스정류장 170m · 편의점 230m";
const VWORLD_ENDPOINT = "https://api.vworld.kr/req";
const PLACE_QUERIES = [
  { category: "학교", query: "학교" },
  { category: "버스정류장", query: "버스정류장" },
  { category: "편의점", query: "편의점" },
] as const;
const LAND_USE_LAYERS = [
  { id: "LT_C_UQ111", label: "도시지역" },
  { id: "LT_C_UQ112", label: "관리지역" },
  { id: "LT_C_UQ113", label: "농림지역" },
  { id: "LT_C_UQ114", label: "자연환경보전지역" },
] as const;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function apiKey() {
  return process.env.VWORD_API_KEY || process.env.VWORLD_API_KEY || "";
}

function addSharedParams(params: URLSearchParams, includeDomain: boolean) {
  params.set("key", apiKey());
  const domain = process.env.VWORD_DOMAIN || process.env.VWORLD_DOMAIN || "";
  if (includeDomain && domain) params.set("domain", domain.replace(/^https?:\/\//, "").split("/")[0]);
  return params;
}

async function fetchJson(pathname: string, params: URLSearchParams, includeDomain = false) {
  const response = await fetch(`${VWORLD_ENDPOINT}/${pathname}?${addSharedParams(params, includeDomain)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(4_500),
  });
  if (!response.ok) throw new Error(`VWorld ${pathname} HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function requestCoordinate(address: string, type: "ROAD" | "PARCEL"): Promise<Coordinate> {
  const params = new URLSearchParams({
    service: "address",
    request: "getCoord",
    version: "2.0",
    crs: "EPSG:4326",
    address,
    refine: "true",
    simple: "false",
    format: "json",
    errorFormat: "json",
    type,
  });
  const root = asRecord(await fetchJson("address", params));
  const response = asRecord(root.response);
  if (response.status !== "OK") {
    const error = asRecord(response.error);
    throw new Error(typeof error.text === "string" ? error.text : `VWorld ${type} address not found`);
  }
  const point = asRecord(asRecord(response.result).point);
  const refined = asRecord(response.refined);
  const longitude = Number(point.x);
  const latitude = Number(point.y);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw new Error("VWorld returned invalid coordinates");
  return {
    longitude,
    latitude,
    refinedAddress: typeof refined.text === "string" ? refined.text : address,
  };
}

async function geocode(address: string) {
  try {
    return await requestCoordinate(address, "ROAD");
  } catch {
    return requestCoordinate(address, "PARCEL");
  }
}

function boundingBox(longitude: number, latitude: number, radiusKm = 2) {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeDelta = radiusKm / (111.32 * Math.max(Math.cos(latitude * Math.PI / 180), 0.2));
  return [
    longitude - longitudeDelta,
    latitude - latitudeDelta,
    longitude + longitudeDelta,
    latitude + latitudeDelta,
  ].join(",");
}

function distanceMeters(from: Coordinate, longitude: number, latitude: number) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(latitude - from.latitude);
  const longitudeDelta = toRadians(longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function cleanTitle(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, "").trim() : "";
}

async function nearestPlace(origin: Coordinate, category: string, query: string): Promise<NearbyFacility | null> {
  const params = new URLSearchParams({
    service: "search",
    request: "search",
    version: "2.0",
    crs: "EPSG:4326",
    size: "20",
    page: "1",
    query,
    type: "PLACE",
    bbox: boundingBox(origin.longitude, origin.latitude),
    format: "json",
    errorFormat: "json",
  });
  const root = asRecord(await fetchJson("search", params));
  const response = asRecord(root.response);
  if (response.status !== "OK") return null;
  const items = asArray(asRecord(response.result).items);
  const facilities = items.flatMap((raw) => {
    const item = asRecord(raw);
    const point = asRecord(item.point);
    const longitude = Number(point.x);
    const latitude = Number(point.y);
    const name = cleanTitle(item.title);
    if (!name || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
    return [{ category, name, distanceMeters: distanceMeters(origin, longitude, latitude) }];
  });
  return facilities.sort((left, right) => left.distanceMeters - right.distanceMeters)[0] || null;
}

function featureName(raw: unknown, fallback: string) {
  const properties = asRecord(asRecord(raw).properties);
  for (const key of ["uname", "name", "lclas_cl", "mnum"]) {
    if (typeof properties[key] === "string" && properties[key]) return properties[key] as string;
  }
  return fallback;
}

async function queryLandUse(origin: Coordinate, id: string, label: string) {
  const params = new URLSearchParams({
    service: "data",
    request: "GetFeature",
    version: "2.0",
    data: id,
    geomFilter: `POINT(${origin.longitude} ${origin.latitude})`,
    geometry: "false",
    size: "10",
    page: "1",
    crs: "EPSG:4326",
    format: "json",
    errorFormat: "json",
  });
  const root = asRecord(await fetchJson("data", params, true));
  const response = asRecord(root.response);
  if (response.status !== "OK") return [];
  const featureCollection = asRecord(asRecord(response.result).featureCollection);
  return asArray(featureCollection.features).map((feature) => featureName(feature, label));
}

function buildSummary(refinedAddress: string, landUse: string[], facilities: NearbyFacility[]) {
  const area = refinedAddress.split(" ").filter(Boolean).slice(0, 3).join(" ");
  const parts = [landUse[0] || area || "주변 환경 확인"];
  parts.push(...facilities.map((facility) => `${facility.category} ${facility.distanceMeters.toLocaleString("ko-KR")}m`));
  if (facilities.length === 0) parts.push("반경 2km 시설 검색 결과 없음");
  return parts.join(" · ");
}

export async function getLocationContext(address: string): Promise<LocationContext> {
  if (!apiKey()) {
    return { source: "fallback", status: "missing-key", refinedAddress: address, summary: FALLBACK_SUMMARY, facilities: [], landUse: [] };
  }
  try {
    const coordinate = await geocode(address);
    const [facilityResults, landUseResults] = await Promise.all([
      Promise.all(PLACE_QUERIES.map(({ category, query }) => nearestPlace(coordinate, category, query).catch(() => null))),
      Promise.all(LAND_USE_LAYERS.map(({ id, label }) => queryLandUse(coordinate, id, label).catch(() => []))),
    ]);
    const facilities = facilityResults.filter((item): item is NearbyFacility => Boolean(item));
    const landUse = [...new Set(landUseResults.flat())];
    return {
      source: "vworld",
      status: "ok",
      refinedAddress: coordinate.refinedAddress,
      summary: buildSummary(coordinate.refinedAddress, landUse, facilities),
      facilities,
      landUse,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("VWorld location lookup failed", message);
    return { source: "fallback", status: `lookup-failed:${message.slice(0, 120)}`, refinedAddress: address, summary: FALLBACK_SUMMARY, facilities: [], landUse: [] };
  }
}
