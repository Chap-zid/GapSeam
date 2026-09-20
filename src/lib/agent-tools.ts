import type { Analysis, Space, SpaceRequest } from "./types";
import { auth } from "./firebase";
import { regionAffinity } from "./region";
import { assessConfidence, reviewUses, type Confidence } from "./safety";
import { getBrowserLocationEvidence } from "./vworld-browser";

// 각 함수는 외부 API로 교체할 수 있는 에이전트 Tool 경계입니다.
// 현재 해커톤 데모는 네트워크 실패에도 같은 스키마를 반환합니다.
export async function visionTool(imageUrls: string[]) {
  void imageUrls;
  return { condition: "외관 노후도 보통 · 부분 정비 필요", features: ["독립된 1층", "자연광 확보", "마당 활용 가능"] };
}

export async function locationTool(address: string) {
  void address;
  // VWorld 연동 지점: 실패 시 이 데이터를 그대로 사용합니다.
  return { summary: "주거지역 · 학교 420m · 버스정류장 170m · 편의점 230m", transit: "보통", facilities: ["학교 420m", "버스정류장 170m", "편의점 230m"] };
}

export async function usagePlanningTool(space: Space) {
  return [
    { name: "소규모 공방", score: 92, reasons: ["독립된 1층 공간", "작업 공간 확보 가능", "인근 주거 수요 존재"] },
    { name: "공유 작업실", score: 86, reasons: [`${space.area}㎡의 유연한 평면`, "대중교통 접근 가능"] },
    { name: "지역 커뮤니티 공간", score: 78, reasons: ["학교와 주거지 인접", "소규모 모임에 적합"] },
  ];
}

export async function costTool(space: Space) {
  void space;
  // 실서비스에서는 면적 × 정비 단가 × 상태 계수를 사용합니다.
  return { estimatedRepairCost: "450~650만 원", estimatedPrice: "월 35~45만 원", estimatedIncome: "약 480만 원", paybackPeriod: "약 14개월" };
}

// 앞 단어의 받침 유무에 따라 조사를 고릅니다.
function josa(word: string, withBatchim: string, withoutBatchim: string) {
  const code = String(word).trim().slice(-1).charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return withoutBatchim;
  return (code - 0xac00) % 28 ? withBatchim : withoutBatchim;
}

// summary는 화면에 보여줄 한 줄, detail은 계산 근거를 풀어 쓴 문장입니다.
export type MatchFactor = { key: "region" | "budget" | "area" | "purpose"; label: string; points: number; max: number; ok: boolean; summary: string; detail: string };
export type MatchResult = { score: number; factors: MatchFactor[]; reason: string };

// "월 35~45만 원"처럼 범위로 표현된 이용료에서 만 원 단위 하한과 상한을 읽습니다.
function parseMonthlyBudget(text?: string) {
  if (!text || !text.includes("만")) return null;
  const numbers = [...text.matchAll(/\d[\d,]*/g)].map((entry) => Number(entry[0].replace(/,/g, ""))).filter((value) => Number.isFinite(value) && value > 0);
  if (!numbers.length) return null;
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

function regionFactor(space: Space, request: SpaceRequest): MatchFactor {
  const affinity = regionAffinity(space.region, request.region);
  if (affinity === "exact") return { key: "region", label: "지역", points: 30, max: 30, ok: true, summary: "원하는 지역과 일치합니다.", detail: `희망 지역 ${request.region}${josa(request.region, "과", "와")} 같은 생활권입니다.` };
  if (affinity === "sido") return { key: "region", label: "지역", points: 18, max: 30, ok: false, summary: "같은 시·도이지만 희망 지역과 구·군이 다릅니다.", detail: `희망 지역 ${request.region}${josa(request.region, "과", "와")} 같은 시·도이지만 시군구가 다릅니다.` };
  return { key: "region", label: "지역", points: 6, max: 30, ok: false, summary: "희망 지역과는 거리가 있습니다.", detail: `희망 지역 ${request.region}${josa(request.region, "과", "와")}는 거리가 있습니다.` };
}

function budgetFactor(space: Space, request: SpaceRequest): MatchFactor {
  const budget = Number(request.maxBudget) || 0;
  const price = parseMonthlyBudget(space.analysis?.estimatedPrice);
  if (!budget || !price) return { key: "budget", label: "예산", points: 15, max: 25, ok: false, summary: "예상 이용료가 확정되면 예산 적합성을 다시 계산합니다.", detail: "예상 이용료가 아직 확정되지 않아 예산 적합성은 참고용입니다." };
  if (price.max <= budget) return { key: "budget", label: "예산", points: 25, max: 25, ok: true, summary: "희망 예산 안에서 이용 가능합니다.", detail: `예상 이용료 ${space.analysis?.estimatedPrice}${josa(space.analysis?.estimatedPrice || "", "이", "가")} 월 ${budget}만 원 예산 안에 들어옵니다.` };
  if (price.min <= budget) return { key: "budget", label: "예산", points: 18, max: 25, ok: false, summary: "예상 이용료 상한이 희망 예산을 조금 넘습니다.", detail: `예상 이용료 하한은 월 ${budget}만 원 예산에 맞지만 상한은 넘습니다.` };
  return { key: "budget", label: "예산", points: 6, max: 25, ok: false, summary: "예상 이용료가 희망 예산을 넘습니다.", detail: `예상 이용료가 월 ${budget}만 원 예산을 넘습니다.` };
}

function areaFactor(space: Space, request: SpaceRequest): MatchFactor {
  const minArea = Number(request.minArea) || 0;
  const maxArea = Number(request.maxArea) || 0;
  const range = maxArea ? `${minArea}~${maxArea}㎡` : `${minArea}㎡ 이상`;
  if (space.area >= minArea && (!maxArea || space.area <= maxArea)) return { key: "area", label: "면적", points: 20, max: 20, ok: true, summary: "필요한 면적 조건을 충족합니다.", detail: `${space.area}㎡로 희망 면적 ${range} 조건을 만족합니다.` };
  if (maxArea && space.area > maxArea) return { key: "area", label: "면적", points: 12, max: 20, ok: false, summary: "희망 면적보다 넓은 공간입니다.", detail: `${space.area}㎡로 희망 면적 ${range}보다 넓습니다.` };
  return { key: "area", label: "면적", points: 5, max: 20, ok: false, summary: "희망 최소 면적에 미치지 못합니다.", detail: `${space.area}㎡로 희망 면적 ${range}에 미치지 못합니다.` };
}

function purposeFactor(space: Space, request: SpaceRequest): MatchFactor {
  const purpose = request.purpose || "희망 용도";
  const keywords = purpose.split(/[\s,·/]+/).filter((word) => word.length >= 2);
  const uses = space.analysis?.suggestedUses || [];
  const index = uses.findIndex((use) => keywords.some((keyword) => use.name.includes(keyword) || keyword.includes(use.name)));
  if (index >= 0) {
    const points = [25, 22, 19][index] ?? 19;
    return { key: "purpose", label: "용도", points, max: 25, ok: true, summary: `${uses[index].name} 용도와 공간 특성이 유사합니다.`, detail: `추천 활용 ${index + 1}순위인 ${uses[index].name}${josa(uses[index].name, "이", "가")} 희망 용도 ${purpose}${josa(purpose, "과", "와")} 맞습니다.` };
  }
  if (/공방|작업|커뮤니티|교육|창업|전시|스튜디오/.test(purpose)) return { key: "purpose", label: "용도", points: 16, max: 25, ok: false, summary: "소규모 공간 활용에는 적합하지만 추천 용도와 다릅니다.", detail: `희망 용도 ${purpose}${josa(purpose, "은", "는")} 소규모 공간 활용에 적합하지만 추천 활용과는 다릅니다.` };
  return { key: "purpose", label: "용도", points: 10, max: 25, ok: false, summary: "희망 용도와 이 공간의 추천 활용이 다릅니다.", detail: `희망 용도 ${purpose}${josa(purpose, "은", "는")} 이 공간의 추천 활용과 차이가 있습니다.` };
}

// 후보로 셀지는 총점이 아니라 지역·면적·예산이라는 확정 조건의 충족 여부로 판단합니다.
// 용도 적합성은 소유자가 판단할 영역이므로 후보 집계에서 제외하지 않습니다.
export function isGoodMatch(match: MatchResult) {
  const at = (key: MatchFactor["key"]) => match.factors.find((factor) => factor.key === key);
  return (at("region")?.points ?? 0) >= 18 && (at("area")?.ok ?? false) && (at("budget")?.points ?? 0) >= 18;
}

export function matchingTool(space: Space, request: SpaceRequest): MatchResult {
  const factors = [regionFactor(space, request), budgetFactor(space, request), areaFactor(space, request), purposeFactor(space, request)];
  const score = Math.min(factors.reduce((total, factor) => total + factor.points, 0), 100);
  // 매칭 이유는 LLM 문장이 아니라 항목별 점수 계산 결과에서 그대로 만들어집니다.
  return { score, factors, reason: factors.map((factor) => `· ${factor.summary}`).join("\n") };
}

async function fallbackSpaceAnalysis(space: Space): Promise<Analysis> {
  const build = async (images: string[], address: string) => {
    const [vision, location, uses, cost] = await Promise.all([visionTool(images), locationTool(address), usagePlanningTool(space), costTool(space)]);
    // fallback 결과도 규칙 기반 필터를 그대로 통과시킵니다.
    const review = reviewUses(uses);
    return { condition: vision.condition, surroundingEnvironment: location.summary, suggestedUses: review.kept, ...cost, safetyNotes: review.notes };
  };
  try {
    return await build(space.imageUrls, space.address);
  } catch {
    // 외부 Tool 오류가 전체 데모를 중단시키지 않습니다.
    return await build([], "");
  }
}

export type AgentRun = {
  analysis: Analysis | null;
  // 근거가 부족해 분석을 멈춘 경우입니다.
  blocked: "low-confidence" | null;
  confidence: Confidence | null;
  source: "openai" | "fallback";
  locationSource: "vworld" | "fallback";
};

export async function runSpaceAgent(space: Space, acknowledgeLowConfidence = false): Promise<AgentRun> {
  try {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error("Authentication required");
    const location = await getBrowserLocationEvidence(space.address, token);

    // 서버를 부르기 전에 브라우저에서 먼저 근거를 확인합니다. 부족하면 모델을 호출하지 않습니다.
    const preflight = assessConfidence(space, Boolean(location));
    if (preflight.level === "low" && !acknowledgeLowConfidence) {
      return { analysis: null, blocked: "low-confidence", confidence: preflight, source: "fallback", locationSource: location ? "vworld" : "fallback" };
    }

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ space, location, acknowledgeLowConfidence }),
    });
    if (!response.ok) throw new Error(`Analysis endpoint ${response.status}`);
    const result = await response.json() as { analysis?: Analysis; blocked?: string; confidence?: Confidence; source?: "openai" | "fallback"; locationSource?: "vworld" | "fallback" };
    const locationSource = result.locationSource === "vworld" ? "vworld" as const : "fallback" as const;
    if (result.blocked === "low-confidence") {
      return { analysis: null, blocked: "low-confidence", confidence: result.confidence ?? preflight, source: "fallback", locationSource };
    }
    if (!result.analysis || !Array.isArray(result.analysis.suggestedUses)) throw new Error("Invalid analysis response");
    return { analysis: result.analysis, blocked: null, confidence: result.confidence ?? preflight, source: result.source === "fallback" ? "fallback" : "openai", locationSource };
  } catch {
    return { analysis: await fallbackSpaceAnalysis(space), blocked: null, confidence: assessConfidence(space, false), source: "fallback", locationSource: "fallback" };
  }
}
