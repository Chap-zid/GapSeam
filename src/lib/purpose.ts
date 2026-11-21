export const PURPOSE_TAGS = [
  "office", "shared-office", "creative", "craft", "education", "study", "community", "exhibition",
  "retail", "food", "storage", "content", "repair", "local-service", "care", "experience",
  "event", "long-term", "quiet", "noisy", "visitor", "reservation",
] as const;
export type PurposeTag = typeof PURPOSE_TAGS[number];
const allowed = new Set<string>(PURPOSE_TAGS);
export const MAX_PURPOSE_TAGS = 6;
export const PURPOSE_SMOOTHING_ALPHA = 0.5;

const RULES: { pattern: RegExp; tags: PurposeTag[] }[] = [
  { pattern: /도자|공예|공방|만들기|제작|메이커/, tags: ["creative", "craft", "education", "experience"] },
  { pattern: /예술|미술|그림|디자인|음악|창작/, tags: ["creative", "craft"] },
  { pattern: /수업|교육|교실|강좌|교습|학원|배움/, tags: ["education", "study", "experience"] },
  { pattern: /공부|독서|학습|스터디|독립학습/, tags: ["study", "education", "quiet"] },
  { pattern: /모임|주민|커뮤니티|동아리|사랑방|교류/, tags: ["community", "experience"] },
  { pattern: /사무|업무|오피스|사무실/, tags: ["office"] },
  { pattern: /공유.?오피스|코워킹|공유.?업무/, tags: ["office", "shared-office"] },
  { pattern: /전시|갤러리|문화|공연/, tags: ["exhibition", "creative", "visitor"] },
  { pattern: /판매|소매|온라인.?쇼핑|쇼핑몰|상점|매장/, tags: ["retail", "visitor"] },
  { pattern: /카페|식당|음식|베이커리|주방|식음료/, tags: ["food", "visitor"] },
  { pattern: /보관|창고|물류|재고|적치/, tags: ["storage"] },
  { pattern: /촬영|영상|사진|콘텐츠|방송|스튜디오/, tags: ["content", "creative"] },
  { pattern: /수리|정비|수선/, tags: ["repair", "craft"] },
  { pattern: /지역.?서비스|상담|지역.?지원/, tags: ["local-service", "community"] },
  { pattern: /돌봄|복지|보육/, tags: ["care", "local-service"] },
  { pattern: /체험|프로그램|클래스/, tags: ["experience", "education"] },
  { pattern: /행사|축제|팝업/, tags: ["event", "visitor"] },
  { pattern: /장기|상시|상설/, tags: ["long-term"] },
  { pattern: /조용|정숙/, tags: ["quiet"] },
  { pattern: /소음|용접|목공/, tags: ["noisy", "craft"] },
  { pattern: /방문객|방문자/, tags: ["visitor"] },
  { pattern: /예약제|사전.?예약/, tags: ["reservation"] },
];

export function sanitizePurposeTags(value: unknown): PurposeTag[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((tag): tag is PurposeTag => typeof tag === "string" && allowed.has(tag)))].slice(0, MAX_PURPOSE_TAGS);
}

export function classifyPurpose(text: string): PurposeTag[] {
  const found: PurposeTag[] = [];
  for (const rule of RULES) if (rule.pattern.test(text)) found.push(...rule.tags);
  return sanitizePurposeTags(found);
}

export function resolvePurposeTags(text: string, value: unknown): PurposeTag[] {
  const local = classifyPurpose(text);
  if (local.length) return local;
  if (!value || typeof value !== "object") return [];
  const result = value as { tags?: unknown; confidence?: unknown };
  if (typeof result.confidence !== "number" || !Number.isFinite(result.confidence) || result.confidence < 0.7 || result.confidence > 1) return [];
  return sanitizePurposeTags(result.tags);
}

export function purposeSimilarity(left: PurposeTag[], right: PurposeTag[]) {
  const a = new Set(sanitizePurposeTags(left));
  const b = new Set(sanitizePurposeTags(right));
  if (!a.size || !b.size) return null;
  const common = [...a].filter((tag) => b.has(tag)).length;
  const total = new Set([...a, ...b]).size;
  return { common, total, score: (common + PURPOSE_SMOOTHING_ALPHA) / (total + PURPOSE_SMOOTHING_ALPHA) };
}
