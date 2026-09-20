import type { Analysis, Space } from "./types";

// 이 파일은 에이전트의 판단이 곧바로 가격·매칭·계약으로 이어지지 않도록 막는 장치를 모은 곳입니다.
// 1) Confidence Threshold  근거가 부족하면 결과를 만들지 않습니다.
// 2) Rule-based Safety Filter  인허가가 필요하거나 위험한 활용안을 걸러냅니다.
// 3) Output Guard  모델이 돌려준 값의 개수와 범위를 강제합니다.
// 4) Retry  일시적인 외부 오류는 자동으로 다시 시도합니다.

/* ── 1. 신뢰도 평가 ─────────────────────────────────────── */

export type ConfidenceSignal = { key: string; label: string; ok: boolean; weight: number; detail: string };
export type ConfidenceLevel = "high" | "medium" | "low";
export type Confidence = { score: number; level: ConfidenceLevel; signals: ConfidenceSignal[]; missing: string[] };

export const CONFIDENCE_FLOOR = 45;

export function assessConfidence(space: Pick<Space, "imageUrls" | "address" | "description" | "facilities">, locationResolved: boolean): Confidence {
  const images = (space.imageUrls || []).filter((url) => url && !url.startsWith("/images/")).length;
  const description = (space.description || "").trim();
  const facilities = (space.facilities || []).length;
  // 건물번호나 지번까지 있어야 주변 환경을 실제로 조회할 수 있습니다.
  const addressDetailed = /\d/.test((space.address || "").split(/\s+/).slice(2).join(" "));

  const signals: ConfidenceSignal[] = [
    { key: "images", label: "공간 사진", ok: images >= 2, weight: 30, detail: images >= 2 ? `사진 ${images}장으로 상태를 확인했습니다.` : images === 1 ? "사진이 1장뿐이라 내부 상태를 확인하기 어렵습니다." : "사진이 없어 공간 상태를 확인할 수 없습니다." },
    { key: "location", label: "주변 환경 데이터", ok: locationResolved, weight: 30, detail: locationResolved ? "VWorld 주변 환경 조회에 성공했습니다." : "주소로 주변 환경을 조회하지 못했습니다." },
    { key: "address", label: "주소 구체성", ok: addressDetailed, weight: 15, detail: addressDetailed ? "건물번호까지 입력되어 있습니다." : "건물번호나 지번이 없어 위치를 특정할 수 없습니다." },
    { key: "description", label: "공간 설명", ok: description.length >= 20, weight: 15, detail: description.length >= 20 ? "공간 설명이 충분합니다." : "공간 설명이 너무 짧습니다." },
    { key: "facilities", label: "시설 정보", ok: facilities >= 1, weight: 10, detail: facilities >= 1 ? `시설 정보 ${facilities}건이 입력되어 있습니다.` : "전기·수도 등 시설 정보가 없습니다." },
  ];

  const score = signals.reduce((total, signal) => total + (signal.ok ? signal.weight : 0), 0);
  // high는 모든 핵심 근거가 갖춰진 경우로 한정하고, 분석 자체를 막는 기준은 CONFIDENCE_FLOOR입니다.
  const level: ConfidenceLevel = score >= 85 ? "high" : score >= CONFIDENCE_FLOOR ? "medium" : "low";
  return { score, level, signals, missing: signals.filter((signal) => !signal.ok).map((signal) => signal.label) };
}

/* ── 2. 규칙 기반 활용안 필터 ───────────────────────────── */

// 소유자가 임의로 제공하면 법적 문제가 생기는 용도입니다. 추천에서 제외합니다.
const BLOCKED = [
  { pattern: /주거|거주|원룸|셰어하우스|고시원|하숙/, reason: "주거 용도는 용도변경과 건축 기준 확인이 필요해 추천에서 제외했습니다." },
  { pattern: /숙박|민박|게스트하우스|에어비앤비|펜션|호스텔/, reason: "숙박업은 별도 영업 신고가 필요해 추천에서 제외했습니다." },
  { pattern: /유흥|주점|술집|바\b|클럽|도박|성인/, reason: "유흥·사행 관련 용도는 이 서비스의 중개 범위를 벗어나 제외했습니다." },
  { pattern: /위험물|화학|인화|폐기물|고물상|도축/, reason: "위험물·폐기물 취급은 별도 허가 대상이라 추천에서 제외했습니다." },
];

// 운영은 가능하지만 인허가나 시설 기준을 먼저 확인해야 하는 용도입니다.
const CAUTION = [
  { pattern: /어린이집|유치원|돌봄|키즈/, reason: "아동 대상 시설은 설치 기준과 인가 확인이 필요합니다." },
  { pattern: /학원|교습소/, reason: "교습 시설은 면적 기준과 학원 등록 요건 확인이 필요합니다." },
  { pattern: /요양|병원|의원|한의원/, reason: "의료·요양 시설은 별도 개설 허가가 필요합니다." },
  { pattern: /식당|음식|카페|베이커리|주방/, reason: "식품 취급은 영업 신고와 위생 설비 기준 확인이 필요합니다." },
  { pattern: /공장|제조|가공|용접|도장/, reason: "제조·가공은 용도지역 제한과 소방 기준 확인이 필요합니다." },
];

// 이 용도지역에서는 영업 목적 활용에 제한이 있을 수 있습니다.
const RESTRICTED_LAND_USE = /농림지역|자연환경보전지역|보전관리지역|개발제한/;

export type UseVerdict = "allowed" | "caution" | "blocked";
export type ReviewedUse = { name: string; score: number; reasons: string[]; caution?: string };
export type UseReview = { kept: ReviewedUse[]; notes: string[] };

export function reviewUses(uses: { name: string; score: number; reasons: string[] }[], landUse: string[] = []): UseReview {
  const notes: string[] = [];
  const restricted = landUse.some((entry) => RESTRICTED_LAND_USE.test(entry));
  const kept: ReviewedUse[] = [];

  for (const use of uses) {
    const haystack = `${use.name} ${use.reasons.join(" ")}`;
    const blocked = BLOCKED.find((rule) => rule.pattern.test(haystack));
    if (blocked) {
      if (!notes.includes(blocked.reason)) notes.push(blocked.reason);
      continue;
    }
    const caution = CAUTION.find((rule) => rule.pattern.test(haystack));
    const landNote = restricted ? `${landUse.find((entry) => RESTRICTED_LAND_USE.test(entry))}에 해당해 영업 목적 활용 전 지자체 확인이 필요합니다.` : "";
    const merged = [caution?.reason, landNote].filter(Boolean).join(" ");
    kept.push(merged ? { ...use, caution: merged } : { ...use });
  }

  if (!kept.length) notes.push("현재 조건에서 바로 추천할 수 있는 활용 방안을 찾지 못했습니다. 현장 확인 후 다시 분석해주세요.");
  return { kept, notes };
}

/* ── 3. 모델 출력 범위 강제 ─────────────────────────────── */

const MAX_USES = 3;

function clampText(value: unknown, limit: number, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

// 모델이 개수나 범위를 어겨도 화면과 저장소에는 정해진 형태만 들어가게 합니다.
export function guardAnalysis(raw: unknown, landUse: string[] = []): { analysis: Analysis; notes: string[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const rawUses = Array.isArray(input.suggestedUses) ? input.suggestedUses : [];
  const normalized = rawUses.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const use = entry as Record<string, unknown>;
    const name = clampText(use.name, 40);
    if (!name) return [];
    const score = Math.max(0, Math.min(100, Math.round(Number(use.score)) || 0));
    const reasons = (Array.isArray(use.reasons) ? use.reasons : []).flatMap((reason) => {
      const text = clampText(reason, 120);
      return text ? [text] : [];
    }).slice(0, 4);
    return [{ name, score, reasons }];
  }).slice(0, MAX_USES);

  if (!normalized.length) return null;
  const review = reviewUses(normalized, landUse);

  return {
    analysis: {
      condition: clampText(input.condition, 200, "상태 정보를 확인하지 못했습니다."),
      surroundingEnvironment: clampText(input.surroundingEnvironment, 300, "주변 환경 정보를 확인하지 못했습니다."),
      suggestedUses: review.kept,
      estimatedRepairCost: clampText(input.estimatedRepairCost, 60, "산정 불가"),
      estimatedPrice: clampText(input.estimatedPrice, 60, "산정 불가"),
      estimatedIncome: clampText(input.estimatedIncome, 60, "산정 불가"),
      paybackPeriod: clampText(input.paybackPeriod, 60, "산정 불가"),
      safetyNotes: review.notes,
    },
    notes: review.notes,
  };
}

/* ── 4. 일시적 오류 자동 재시도 ─────────────────────────── */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 외부 API의 일시적인 실패는 한 번 더 시도하고, 그래도 안 되면 호출한 쪽의 fallback으로 넘깁니다.
export async function withRetry<T>(task: (attempt: number) => Promise<T>, attempts = 2, baseDelayMs = 400): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(baseDelayMs * attempt);
    }
  }
  throw lastError;
}

/* ── 5. 응답 없는 외부 호출 차단 ─────────────────────────── */

// Firestore나 네트워크가 응답하지 않을 때 화면이 영원히 로딩에 머물지 않게 합니다.
export function withTimeout<T>(task: Promise<T>, ms = 12_000, message = "요청이 시간 내에 완료되지 않았습니다."): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    task.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
