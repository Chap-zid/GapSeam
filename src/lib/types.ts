import type { CommerceEvidence, EvidenceItem, PriceEvidence } from "./evidence";
import type { PurposeTag } from "./purpose";

export type Role = "owner" | "seeker";
// precision이 district이면 정확한 주소가 아니라 읍·면·동 또는 시·군·구 중심점입니다.
export type Coordinates = { latitude: number; longitude: number; precision?: "address" | "district" | "ai-estimate"; source?: "vworld" | "local-centroid" | "openai"; label?: string; confidence?: number };
export type MatchWeights = { region: number; budget: number; area: number; purpose: number };
export type MatchStatus = "candidate" | "proposed" | "applied" | "accepted" | "rejected";
export type MatchInitiator = "owner" | "seeker";

export type UserProfile = { uid: string; name: string; role: Role; email?: string };

export type LocationEvidence = {
  source: "vworld";
  refinedAddress: string;
  summary: string;
  facilities: { category: string; name: string; distanceMeters: number }[];
  landUse: string[];
  coordinate?: { longitude: number; latitude: number };
};

export type SuggestedUse = {
  name: string;
  purposeTags?: PurposeTag[];
  score: number;
  reasons: string[];
  // caution은 규칙 기반 필터가 붙인 인허가 확인 안내입니다.
  caution?: string;
  // evidenceIds는 analysis.evidence의 항목 ID입니다. 서버가 실제로 제공한 근거만 남깁니다.
  evidenceIds?: string[];
  // 이유 문장에 나왔지만 근거·입력 어디에도 없는 숫자입니다.
  unverifiedNumbers?: string[];
};

export type Analysis = {
  condition: string;
  surroundingEnvironment: string;
  suggestedUses: SuggestedUse[];
  estimatedRepairCost: string;
  estimatedPrice: string;
  estimatedIncome: string;
  paybackPeriod: string;
  safetyNotes?: string[];
  // 가격이 실거래가로 계산됐는지(data) AI 추정인지(ai) 구분합니다. 이전 분석에는 없습니다.
  priceBasis?: "data" | "ai";
  priceEvidence?: PriceEvidence;
  commerceEvidence?: CommerceEvidence;
  commerceEstimate?: { summary: string; checks: string[] };
  evidence?: EvidenceItem[];
};

export type Space = {
  id: string;
  ownerId: string;
  address: string;
  region: string;
  area: number;
  buildingType: string;
  description: string;
  imageUrls: string[];
  currentStatus: string;
  facilities?: string[];
  repairNeeds?: string;
  analysis?: Analysis;
  createdAt: unknown;
};

export type SpaceRequest = {
  id: string;
  seekerId: string;
  seekerName: string;
  purpose: string;
  purposeTags?: PurposeTag[];
  description: string;
  region: string;
  minArea: number;
  maxArea?: number;
  maxBudget: number;
  people: number;
  period: string;
  matchWeights?: MatchWeights;
  createdAt: unknown;
};

export type SpaceMatch = {
  id: string;
  spaceId: string;
  requestId: string;
  ownerId: string;
  seekerId: string;
  // 정보가 부족해 계산하지 못한 이용자 신청은 null입니다.
  score: number | null;
  reason: string;
  // 소유자가 최종 승인한 이용료입니다. AI 추정값을 그대로 쓰지 않습니다.
  approvedPrice?: string;
  initiator?: MatchInitiator;
  algorithmVersion?: "fuzzy-mcda-v2" | "geometric-v3" | "geometric-v4";
  status: MatchStatus;
  createdAt: unknown;
};

export type ChatRole = "owner" | "seeker" | "agent";

export type ChatMessage = {
  id: string;
  matchId: string;
  senderId: string;
  senderName: string;
  // agent는 중개 에이전트의 발언입니다. 양측이 같은 내용을 봅니다.
  role?: ChatRole;
  text: string;
  createdAt: unknown;
};

export type MatchDocument = {
  id: string;
  matchId: string;
  title: string;
  content: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: unknown;
};

export const SAMPLE_ANALYSIS: Analysis = {
  condition: "외관 노후도 보통 · 부분 정비 필요",
  surroundingEnvironment: "등록 주소를 바탕으로 주변 환경을 확인하고 있습니다.",
  suggestedUses: [
    { name: "소규모 공방", score: 92, reasons: ["독립된 1층 공간", "작업 공간 확보 가능", "인근 주거 수요 존재"] },
    { name: "공유 작업실", score: 86, reasons: ["67㎡의 유연한 평면", "대중교통 접근 가능"] },
    { name: "지역 커뮤니티 공간", score: 78, reasons: ["학교와 주거지 인접", "소규모 모임에 적합"] },
  ],
  estimatedRepairCost: "450~650만 원",
  estimatedPrice: "월 35~45만 원",
  estimatedIncome: "약 480만 원",
  paybackPeriod: "약 14개월",
};

export const SAMPLE_SPACE: Space = {
  id: "sample-space",
  ownerId: "sample-owner",
  address: "대전광역시 동구 ○○동",
  region: "대전 동구",
  area: 67,
  buildingType: "단독주택",
  description: "한동안 사용하지 않은 1층 단독주택입니다.",
  imageUrls: ["/images/space-hero.png"],
  currentStatus: "공가",
  analysis: SAMPLE_ANALYSIS,
  createdAt: new Date().toISOString(),
};

export const SAMPLE_REQUEST: SpaceRequest = {
  id: "sample-request",
  seekerId: "sample-seeker",
  seekerName: "모퉁이 공방",
  purpose: "도자기 공방",
  description: "도자기 작업과 소규모 클래스를 진행할 공간을 찾고 있습니다.",
  region: "대전 동구",
  minArea: 50,
  maxArea: 80,
  maxBudget: 50,
  people: 4,
  period: "1년 이상",
  createdAt: new Date().toISOString(),
};
