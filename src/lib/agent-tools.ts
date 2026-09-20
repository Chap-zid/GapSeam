import type { Analysis, Space } from "./types";
import { auth } from "./firebase";
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
  return { estimatedRepairCost: "450~650만 원", estimatedPrice: "월 35~45만 원", estimatedIncome: "약 480만 원", paybackPeriod: "약 14개월" };
}

async function fallbackSpaceAnalysis(space: Space): Promise<Analysis> {
  const build = async (images: string[], address: string) => {
    const [vision, location, uses, cost] = await Promise.all([visionTool(images), locationTool(address), usagePlanningTool(space), costTool(space)]);
    const review = reviewUses(uses);
    return { condition: vision.condition, surroundingEnvironment: location.summary, suggestedUses: review.kept, ...cost, safetyNotes: review.notes };
  };
  try { return await build(space.imageUrls, space.address); }
  catch { return await build([], ""); }
}

export type AgentRun = {
  analysis: Analysis | null;
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
