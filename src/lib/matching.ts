import type { Coordinates, MatchWeights, Space, SpaceRequest } from "./types";

export type MatchFactorKey = keyof MatchWeights;
export type MatchFactor = {
  key: MatchFactorKey;
  label: string;
  membership: number | null;
  weight: number;
  points: number | string;
  max: number;
  summary: string;
  detail: string;
};

export type MatchResult = {
  score: number | null;
  factors: MatchFactor[];
  reason: string;
  eligible: boolean;
  fitLevel: "high" | "good" | "possible" | "low";
  warnings: string[];
  algorithmVersion: "geometric-v3";
};

export const DEFAULT_WEIGHTS: MatchWeights = { region: 0.25, budget: 0.25, area: 0.25, purpose: 0.25 };
export const DISTANCE_SCALE_KM = 10;

export function normalizeWeights(weights: MatchWeights): MatchWeights {
  const values = Object.values(weights);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (values.some((value) => !Number.isFinite(value) || value < 0) || !Number.isFinite(total) || total <= 0) {
    throw new Error("중요도는 0 이상의 숫자이며 하나 이상은 0보다 커야 합니다.");
  }
  return { region: weights.region / total, budget: weights.budget / total, area: weights.area / total, purpose: weights.purpose / total };
}

export function monthlyPrice(text?: string): number | null {
  const value = String(text || "").replace(/,/g, "");
  const found = value.match(/월\s*(\d+(?:\.\d+)?)(?:\s*[~\-–]\s*(\d+(?:\.\d+)?))?\s*만\s*원/) ||
    (!/보증금|연\s*\d/.test(value) ? value.match(/(\d+(?:\.\d+)?)(?:\s*[~\-–]\s*(\d+(?:\.\d+)?))?\s*만\s*원/) : null);
  if (!found) return null;
  const first = Number(found[1]);
  const last = Number(found[2] || found[1]);
  return first > 0 && last >= first ? (first + last) / 2 : null;
}

function distanceKm(a: Coordinates, b: Coordinates) {
  const radians = (value: number) => value * Math.PI / 180;
  const lat = radians(b.latitude - a.latitude);
  const lon = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function validCoordinate(point?: Coordinates): point is Coordinates {
  return !!point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

function purposeTokens(text: string) {
  return new Set(text.toLowerCase().split(/[^0-9a-z가-힣]+/).filter(Boolean));
}

export function matchingTool(space: Space, request: SpaceRequest, locations: { space?: Coordinates; request?: Coordinates } = {}, priceText = space.analysis?.estimatedPrice): MatchResult {
  const weights = normalizeWeights(request.matchWeights || DEFAULT_WEIGHTS);
  const factors: MatchFactor[] = [];
  const add = (key: MatchFactorKey, label: string, membership: number | null, summary: string, detail: string) => {
    factors.push({ key, label, membership, weight: weights[key], points: membership === null ? "확인 필요" : Math.round(membership * 100), max: 100, summary, detail });
  };
  if (validCoordinate(locations.space) && validCoordinate(locations.request)) {
    const distance = distanceKm(locations.space, locations.request);
    add("region", "위치", Math.exp(-distance / DISTANCE_SCALE_KM), `직선거리 약 ${distance.toFixed(1)}km`, `거리 기준 ${DISTANCE_SCALE_KM}km로 계산했습니다.`);
  } else add("region", "위치", null, "위치 좌표를 확인할 수 없습니다.", "주소와 희망 지역의 좌표가 모두 필요합니다.");

  const price = monthlyPrice(priceText);
  const budget = Number(request.maxBudget);
  if (price && Number.isFinite(budget) && budget > 0) add("budget", "예산", Math.min(1, budget / price), `월 이용료 ${price}만 원과 예산 ${budget}만 원 비교`, "이용료 범위는 중간값을 사용합니다.");
  else add("budget", "예산", null, "월 이용료 또는 예산을 확인할 수 없습니다.", "월 이용료를 만 원 단위로 입력해주세요.");

  const min = Number(request.minArea);
  const max = Number(request.maxArea);
  const desired = max > 0 ? (min + max) / 2 : min;
  if (Number.isFinite(space.area) && space.area > 0 && Number.isFinite(desired) && desired > 0 && (!max || max >= min)) {
    add("area", "면적", Math.exp(-Math.abs(space.area - desired) / desired), `${space.area}㎡와 희망 기준 ${desired}㎡ 비교`, "희망 범위의 중간값을 사용합니다.");
  } else add("area", "면적", null, "면적 조건을 확인할 수 없습니다.", "공간 면적과 올바른 희망 면적이 필요합니다.");

  const desiredUses = purposeTokens(request.purpose || "");
  const possibleUses = purposeTokens((space.analysis?.suggestedUses || []).map((use) => use.name).join(" "));
  if (desiredUses.size && possibleUses.size) {
    const intersection = [...desiredUses].filter((token) => possibleUses.has(token)).length;
    const union = new Set([...desiredUses, ...possibleUses]).size;
    add("purpose", "활용 목적", intersection / union, `공통 목적 ${intersection}개 / 전체 목적 ${union}개`, "희망 목적과 추천 용도의 단어 집합으로 자카드 유사도를 계산합니다.");
  } else add("purpose", "활용 목적", null, "희망 목적 또는 추천 용도를 확인할 수 없습니다.", "분석 결과와 희망 목적이 필요합니다.");

  const missing = factors.filter((factor) => factor.weight > 0 && factor.membership === null);
  const score = missing.length ? null : Math.round(100 * factors.reduce((product, factor) => factor.weight === 0 ? product : product * Math.pow(factor.membership!, factor.weight), 1));
  const warnings = missing.map((factor) => `${factor.label}: ${factor.summary}`);
  return {
    score, factors, warnings, eligible: score !== null,
    fitLevel: score !== null && score >= 85 ? "high" : score !== null && score >= 70 ? "good" : score !== null && score >= 55 ? "possible" : "low",
    algorithmVersion: "geometric-v3",
    reason: factors.map((factor) => `· ${factor.label}: ${factor.summary}`).join("\n"),
  };
}

export function isGoodMatch(match: MatchResult) {
  return match.score !== null && match.score >= 65;
}
