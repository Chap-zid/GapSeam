export type Role = "owner" | "seeker";
export type MatchStatus = "candidate" | "proposed" | "accepted" | "rejected";

export type UserProfile = { uid: string; name: string; role: Role; email?: string };

export type LocationEvidence = {
  source: "vworld";
  refinedAddress: string;
  summary: string;
  facilities: { category: string; name: string; distanceMeters: number }[];
  landUse: string[];
};

export type Analysis = {
  condition: string;
  surroundingEnvironment: string;
  // caution은 규칙 기반 필터가 붙인 인허가 확인 안내입니다.
  suggestedUses: { name: string; score: number; reasons: string[]; caution?: string }[];
  estimatedRepairCost: string;
  estimatedPrice: string;
  estimatedIncome: string;
  paybackPeriod: string;
  safetyNotes?: string[];
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
  description: string;
  region: string;
  minArea: number;
  maxArea?: number;
  maxBudget: number;
  people: number;
  period: string;
  createdAt: unknown;
};

export type SpaceMatch = {
  id: string;
  spaceId: string;
  requestId: string;
  ownerId: string;
  seekerId: string;
  score: number;
  reason: string;
  // 소유자가 최종 승인한 이용료입니다. AI 추정값을 그대로 쓰지 않습니다.
  approvedPrice?: string;
  status: MatchStatus;
  createdAt: unknown;
};

export const SAMPLE_ANALYSIS: Analysis = {
  condition: "외관 노후도 보통 · 부분 정비 필요",
  surroundingEnvironment: "주거지역 · 학교 420m · 버스정류장 170m · 편의점 230m",
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
