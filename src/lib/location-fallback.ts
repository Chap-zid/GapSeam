import { districtTokens, sidoShort } from "./district.ts";
import type { Coordinates } from "./types";

// Regional representative points, not building locations or measured boundary centroids.
// Representative points: https://www.findlatlng.org/place/ (Daejeon districts).
const LOCAL_POINTS: Record<string, [number, number]> = {
  "대전": [36.35, 127.385],
  "대전 동구": [36.31178, 127.45480],
  "대전 중구": [36.323889, 127.420833],
  "대전 서구": [36.35550, 127.38379],
  "대전 유성구": [36.36229, 127.35626],
  "대전 대덕구": [36.34671, 127.41556],
  "세종": [36.48, 127.289],
  "충남 공주시": [36.455556, 127.124722],
  "충남 논산시": [36.187247, 127.098744],
  "충북 청주시": [36.637222, 127.489722],
};
const DISTRICTS: Record<string, string[]> = {
  "대전": ["동구", "중구", "서구", "유성구", "대덕구"],
  "충남": ["천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시", "당진시", "금산군", "부여군", "서천군", "청양군", "홍성군", "예산군", "태안군"],
  "충북": ["청주시", "충주시", "제천시", "보은군", "옥천군", "영동군", "증평군", "진천군", "괴산군", "음성군", "단양군"],
};
const REGION_BOUNDS: Record<string, [number, number, number, number]> = {
  "대전": [36.1, 36.6, 127.2, 127.6],
  "세종": [36.3, 36.9, 127.1, 127.5],
  "충남": [35.9, 37.1, 125.8, 127.8],
  "충북": [35.9, 37.3, 127.2, 128.7],
};

export function localDistrictPoint(address: string): Coordinates | null {
  const tokens = districtTokens(address);
  const sido = sidoShort(tokens[0] || "");
  const key = sido === "세종" ? sido : tokens[1] ? `${sido} ${tokens[1]}` : sido;
  const point = LOCAL_POINTS[key];
  if (!point) return null;
  const [latitude, longitude] = point;
  return { latitude, longitude, precision: "district", source: "local-centroid", label: `${key} 대표점` };
}

export function hasRecognizableRegion(address: string) {
  const tokens = districtTokens(address);
  const sido = sidoShort(tokens[0] || "");
  if (sido === "세종") return !tokens[1] || !/(시|군|구)$/.test(tokens[1]);
  if (sido === "대전" && !tokens[1]) return true;
  return Boolean(DISTRICTS[sido]?.includes(tokens[1]));
}

export function isKoreanCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && latitude >= 33 && latitude <= 39 && Number.isFinite(longitude) && longitude >= 124 && longitude <= 132;
}

export function isUnmaskedDetailedAddress(address: string) {
  return !/[*＊]/.test(address) && /(?:^|\s)(?:산\s*)?\d+(?:-\d+)?(?:번지)?(?:\s|$|[,(])/.test(address.split(/\s+/).slice(2).join(" "));
}

export function validateAiCoordinate(address: string, value: unknown): Coordinates | null {
  if (!hasRecognizableRegion(address) || !value || typeof value !== "object") return null;
  const item = value as { latitude?: unknown; longitude?: unknown; confidence?: unknown };
  const bounds = REGION_BOUNDS[sidoShort(districtTokens(address)[0] || "")];
  if (!bounds) return null;
  if (typeof item.latitude !== "number" || !Number.isFinite(item.latitude) || item.latitude < 33 || item.latitude > 39 ||
      typeof item.longitude !== "number" || !Number.isFinite(item.longitude) || item.longitude < 124 || item.longitude > 132 ||
      item.latitude < bounds[0] || item.latitude > bounds[1] || item.longitude < bounds[2] || item.longitude > bounds[3] ||
      typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0.7 || item.confidence > 1) return null;
  return { latitude: item.latitude, longitude: item.longitude, confidence: item.confidence, precision: "ai-estimate", source: "openai", label: "AI 저정밀 추정 위치 · 확인 필요" };
}
