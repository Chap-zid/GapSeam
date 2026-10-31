import type { Analysis, Space } from "./types";
import { auth } from "./firebase";
import { assessConfidence, type Confidence } from "./safety";
import { getBrowserLocationEvidence } from "./vworld-browser";

export type AgentRun = {
  analysis: Analysis | null;
  // unavailable은 근거 부족이 아니라 분석 서버·인증 오류로 결과를 받지 못한 경우입니다.
  blocked: "low-confidence" | "unavailable" | null;
  confidence: Confidence | null;
  source: "openai" | "fallback";
  locationSource: "vworld" | "openai" | "fallback";
};

export async function runSpaceAgent(space: Space, acknowledgeLowConfidence = false): Promise<AgentRun> {
  try {
    const token = await auth?.currentUser?.getIdToken() || "";
    // 로컬 데모 모드는 서버가 토큰 없이도 체험 세션으로 처리합니다.
    if (!token && process.env.NEXT_PUBLIC_DEMO_MODE !== "true") throw new Error("Authentication required");
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
    const result = await response.json() as { analysis?: Analysis; blocked?: string; confidence?: Confidence; source?: "openai" | "fallback"; locationSource?: "vworld" | "openai" | "fallback" };
    const locationSource = result.locationSource === "vworld" ? "vworld" as const : result.locationSource === "openai" ? "openai" as const : "fallback" as const;
    if (result.blocked === "low-confidence") {
      return { analysis: null, blocked: "low-confidence", confidence: result.confidence ?? preflight, source: "fallback", locationSource };
    }
    if (!result.analysis || !Array.isArray(result.analysis.suggestedUses)) throw new Error("Invalid analysis response");
    return { analysis: result.analysis, blocked: null, confidence: result.confidence ?? preflight, source: result.source === "fallback" ? "fallback" : "openai", locationSource };
  } catch {
    return { analysis: null, blocked: "unavailable", confidence: assessConfidence(space, false), source: "fallback", locationSource: "fallback" };
  }
}
