import type { Analysis, Space } from "./types";
import { auth } from "./firebase";
import { assessConfidence, type Confidence } from "./safety";
import { getBrowserLocationEvidence } from "./vworld-browser";

export type AgentRun = {
  analysis: Analysis | null;
  blocked: "low-confidence" | null;
  confidence: Confidence | null;
  source: "openai" | "fallback";
  locationSource: "vworld" | "openai" | "fallback";
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
    const result = await response.json() as { analysis?: Analysis; blocked?: string; confidence?: Confidence; source?: "openai" | "fallback"; locationSource?: "vworld" | "openai" | "fallback" };
    const locationSource = result.locationSource === "vworld" ? "vworld" as const : result.locationSource === "openai" ? "openai" as const : "fallback" as const;
    if (result.blocked === "low-confidence") {
      return { analysis: null, blocked: "low-confidence", confidence: result.confidence ?? preflight, source: "fallback", locationSource };
    }
    if (!result.analysis || !Array.isArray(result.analysis.suggestedUses)) throw new Error("Invalid analysis response");
    return { analysis: result.analysis, blocked: null, confidence: result.confidence ?? preflight, source: result.source === "fallback" ? "fallback" : "openai", locationSource };
  } catch {
    return { analysis: null, blocked: "low-confidence", confidence: assessConfidence(space, false), source: "fallback", locationSource: "fallback" };
  }
}
