import { regionAffinity } from "./region";
import type { Space, SpaceRequest } from "./types";

export type MatchFactorKey = "region" | "budget" | "area" | "purpose";
export type MatchFactor = {
  key: MatchFactorKey;
  label: string;
  points: number;
  max: number;
  membership: number;
  ok: boolean;
  summary: string;
  detail: string;
};

export type MatchResult = {
  score: number;
  factors: MatchFactor[];
  reason: string;
  eligible: boolean;
  fitLevel: "high" | "good" | "possible" | "low";
  warnings: string[];
  algorithmVersion: "fuzzy-mcda-v2";
};

const PURPOSE_GROUPS = [
  ["공방", "도자기", "목공", "가죽", "공예", "메이커", "작업실"],
  ["교육", "교실", "강의", "클래스", "학습", "연습실"],
  ["커뮤니티", "모임", "회의", "주민", "동아리", "공유"],
  ["사무실", "업무", "창업", "오피스", "스튜디오", "작업실"],
  ["전시", "갤러리", "팝업", "촬영", "스튜디오"],
  ["카페", "음식", "주방", "베이커리"],
  ["창고", "보관", "물류"],
] as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function parseMonthlyBudget(text?: string) {
  if (!text || !text.includes("만")) return null;
  const values = [...text.matchAll(/\d[\d,]*/g)]
    .map((entry) => Number(entry[0].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values), midpoint: values.reduce((sum, value) => sum + value, 0) / values.length };
}

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/).filter((word) => word.length >= 2));
}

function purposeMembership(space: Space, request: SpaceRequest) {
  const needText = `${request.purpose} ${request.description}`.toLowerCase();
  const supplyText = [space.description, space.buildingType, ...(space.analysis?.suggestedUses || []).flatMap((use) => [use.name, ...use.reasons])].join(" ").toLowerCase();
  const needTokens = tokens(needText);
  const supplyTokens = tokens(supplyText);
  const overlap = [...needTokens].filter((word) => [...supplyTokens].some((target) => target.includes(word) || word.includes(target))).length;
  const tokenScore = needTokens.size ? overlap / needTokens.size : 0;
  const sameGroups = PURPOSE_GROUPS.filter((group) => group.some((word) => needText.includes(word)) && group.some((word) => supplyText.includes(word))).length;
  const categoryScore = sameGroups ? 0.9 : 0.25;
  const topUse = space.analysis?.suggestedUses?.[0]?.name || "";
  const topBonus = [...needTokens].some((word) => topUse.includes(word) || word.includes(topUse)) ? 0.08 : 0;
  return clamp(categoryScore * 0.72 + tokenScore * 0.28 + topBonus);
}

function makeFactor(key: MatchFactorKey, label: string, max: number, membership: number, summary: string, detail: string, okAt = 0.72): MatchFactor {
  const normalized = clamp(membership);
  return { key, label, max, membership: normalized, points: Math.round(max * normalized), ok: normalized >= okAt, summary, detail };
}

function regionFactor(space: Space, request: SpaceRequest) {
  const affinity = regionAffinity(space.region, request.region);
  if (affinity === "exact") return makeFactor("region", "지역", 30, 1, "희망 지역과 같은 생활권입니다.", `${space.region}과 ${request.region}이 일치합니다.`);
  if (affinity === "sido") return makeFactor("region", "지역", 30, 0.65, "같은 시·도 안의 인접 후보입니다.", "희망 시·도는 같지만 시·군·구가 다릅니다.");
  return makeFactor("region", "지역", 30, 0.15, "희망 지역과 거리가 있습니다.", `${space.region}과 ${request.region}은 다른 생활권입니다.`);
}

function budgetFactor(space: Space, request: SpaceRequest) {
  const budget = Number(request.maxBudget) || 0;
  const price = parseMonthlyBudget(space.analysis?.estimatedPrice);
  if (!budget || !price) return makeFactor("budget", "예산", 25, 0.55, "이용료 확정 후 예산 적합도를 다시 계산합니다.", "비교 가능한 예상 이용료가 없어 중립값을 적용했습니다.");
  const ratio = budget / price.midpoint;
  const membership = ratio >= 1 ? 1 : ratio >= 0.85 ? 0.78 + (ratio - 0.85) * 1.47 : ratio >= 0.65 ? 0.35 + (ratio - 0.65) * 2.15 : clamp(ratio * 0.5, 0.08, 0.35);
  const summary = price.max <= budget ? "희망 예산 안에서 이용 가능합니다." : price.min <= budget ? "가격 범위 일부가 희망 예산에 들어옵니다." : "예상 이용료가 희망 예산을 넘습니다.";
  return makeFactor("budget", "예산", 25, membership, summary, `예상 이용료 ${space.analysis?.estimatedPrice}, 희망 예산 월 ${budget}만 원을 연속 비율로 비교했습니다.`);
}

function areaFactor(space: Space, request: SpaceRequest) {
  const min = Math.max(1, Number(request.minArea) || 1);
  const max = Number(request.maxArea) || 0;
  const inRange = space.area >= min && (!max || space.area <= max);
  const membership = inRange ? 1 : space.area < min ? clamp(space.area / min) : clamp(max / space.area);
  const summary = inRange ? "필요한 면적 범위를 충족합니다." : space.area < min ? "희망 최소 면적보다 작습니다." : "희망 범위보다 넓은 공간입니다.";
  return makeFactor("area", "면적", 20, membership, summary, `${space.area}㎡와 희망 면적 ${min}${max ? `~${max}` : " 이상"}㎡를 비율로 비교했습니다.`);
}

function purposeFactor(space: Space, request: SpaceRequest) {
  const membership = purposeMembership(space, request);
  const summary = membership >= 0.82 ? "희망 활동과 추천 활용이 매우 유사합니다." : membership >= 0.6 ? "일부 공간 활용 특성이 희망 목적과 맞습니다." : "희망 목적과 추천 활용의 차이를 확인해야 합니다.";
  return makeFactor("purpose", "활용 목적", 25, membership, summary, "희망 목적·설명과 공간의 추천 활용·특징을 용도군 및 핵심어로 비교했습니다.", 0.6);
}

export function matchingTool(space: Space, request: SpaceRequest): MatchResult {
  const factors = [regionFactor(space, request), budgetFactor(space, request), areaFactor(space, request), purposeFactor(space, request)];
  const at = (key: MatchFactorKey) => factors.find((factor) => factor.key === key)!;
  const warnings: string[] = [];
  let penalty = 1;
  if (at("region").membership < 0.6) { penalty *= 0.78; warnings.push("희망 생활권과 다른 지역입니다."); }
  if (at("area").membership < 0.7) { penalty *= 0.72; warnings.push("필요 면적과 차이가 큽니다."); }
  if (at("budget").membership < 0.45) { penalty *= 0.75; warnings.push("예상 이용료가 예산을 크게 넘을 수 있습니다."); }
  const raw = factors.reduce((total, factor) => total + factor.points, 0);
  const score = Math.round(clamp(raw * penalty, 0, 100));
  const eligible = at("region").membership >= 0.6 && at("area").membership >= 0.7 && at("budget").membership >= 0.45;
  const fitLevel = score >= 85 ? "high" : score >= 70 ? "good" : score >= 55 ? "possible" : "low";
  return {
    score,
    factors,
    eligible,
    fitLevel,
    warnings,
    algorithmVersion: "fuzzy-mcda-v2",
    reason: factors.map((factor) => `· ${factor.summary}`).concat(warnings.map((warning) => `· 확인 필요: ${warning}`)).join("\n"),
  };
}

export function isGoodMatch(match: MatchResult) {
  return match.eligible && match.score >= 65;
}
