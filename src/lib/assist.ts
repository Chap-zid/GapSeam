import { extractRegion, UNKNOWN_REGION } from "./region";

export type AssistKind = "space" | "request";
export type AssistTurn = { role: "user" | "assistant"; content: string };

export type SpaceFields = { address: string; area: number; buildingType: string; currentStatus: string; description: string; facilities: string[]; repairNeeds: string };
export type RequestFields = { purpose: string; description: string; region: string; minArea: number; maxArea: number; maxBudget: number; people: number; period: string };
export type AssistFields = Partial<SpaceFields & RequestFields>;

export type AssistReply = { reply: string; fields: AssistFields; missing: string[]; source: "openai" | "fallback" };

export const BUILDING_TYPES = ["단독주택", "상가", "창고", "업무시설"];
export const SPACE_STATUSES = ["공가", "부분 사용 중", "정비 중"];
export const PERIODS = ["6개월 미만", "6개월~1년", "1년 이상"];
export const FACILITY_OPTIONS = ["전기 사용 가능", "수도 사용 가능", "주차 가능", "화장실 있음"];

export const FIELD_LABELS: Record<string, string> = {
  address: "주소", area: "면적", buildingType: "건물 종류", currentStatus: "현재 상태", description: "공간 설명", facilities: "시설", repairNeeds: "수리 필요사항",
  purpose: "활용 목적", region: "희망 지역", minArea: "최소 면적", maxArea: "최대 면적", maxBudget: "월 최대 예산", people: "이용 인원", period: "이용 기간",
};

export const REQUIRED_FIELDS: Record<AssistKind, string[]> = {
  space: ["address", "area", "buildingType"],
  request: ["purpose", "region", "minArea", "maxBudget"],
};

export const OPENING_LINE: Record<AssistKind, string> = {
  space: "안녕하세요. 공간이음 에이전트입니다. 어떤 공간인지 편하게 말씀해주세요. 주소, 대략적인 넓이, 지금 상태를 들으면 제가 양식을 채워두겠습니다.",
  request: "안녕하세요. 공간이음 에이전트입니다. 어떤 공간이 필요하신지 편하게 말씀해주세요. 용도와 지역, 예산을 들으면 제가 요청서를 채워두겠습니다.",
};

export const QUICK_PROMPTS: Record<AssistKind, string[]> = {
  space: ["대전 동구에 안 쓰는 1층 단독주택이 있어요", "창고인데 60㎡ 정도 되고 전기는 들어와요", "수리가 얼마나 필요할지 모르겠어요"],
  request: ["대전 동구에서 도자기 공방 자리를 찾고 있어요", "4명이 쓸 작업실이고 월 50만 원까지 가능해요", "면적은 50~80㎡ 정도면 좋겠어요"],
};

// 평은 ㎡로 환산합니다.
const PYEONG = 3.3058;

function pickNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) {
      const value = Number(found[1].replace(/,/g, ""));
      if (Number.isFinite(value) && value > 0) return { value, unit: found[2] || "" };
    }
  }
  return null;
}

function findRegion(text: string) {
  const match = text.match(/([가-힣]+(?:특별자치시|특별자치도|특별시|광역시|도)\s*[가-힣]{1,4}(?:시|군|구))|([가-힣]{2,}(?:시|군)\s*[가-힣]{1,3}(?:구|읍|면))|([가-힣]{2,4}\s+[가-힣]{1,3}(?:구|군))/);
  if (!match) return "";
  const region = extractRegion(match[0]);
  return region === UNKNOWN_REGION ? "" : region;
}

// OpenAI를 쓸 수 없을 때도 대화가 양식을 채우도록 하는 규칙 기반 추출기입니다.
export function extractFields(kind: AssistKind, text: string, current: AssistFields): AssistFields {
  const fields: AssistFields = {};
  const area = pickNumber(text, [/(\d[\d,.]*)\s*(㎡|제곱미터|제곱|평)/]);
  const budget = pickNumber(text, [/(\d[\d,.]*)\s*만\s*원?/]);
  const people = pickNumber(text, [/(\d+)\s*(명|인)/]);
  const squareMeters = area ? Math.round(area.unit === "평" ? area.value * PYEONG : area.value) : 0;

  if (kind === "space") {
    const address = text.match(/[가-힣]+(?:특별자치시|특별자치도|특별시|광역시|도)?\s*[가-힣]+(?:시|군|구)\s*[가-힣0-9]+(?:로|길|동|리)\s*[0-9-]+/);
    if (address && !current.address) fields.address = address[0].trim();
    if (squareMeters && !current.area) fields.area = squareMeters;
    const building = BUILDING_TYPES.find((type) => text.includes(type)) || (/집|주택/.test(text) ? "단독주택" : /가게|점포/.test(text) ? "상가" : "");
    if (building && !current.buildingType) fields.buildingType = building;
    const status = /정비|공사|수리 중/.test(text) ? "정비 중" : /일부|부분|가끔/.test(text) ? "부분 사용 중" : /비어|안 쓰|안쓰|공가|방치/.test(text) ? "공가" : "";
    if (status) fields.currentStatus = status;
    const facilities = FACILITY_OPTIONS.filter((option) => {
      if (option.startsWith("전기")) return /전기/.test(text) && !/전기.{0,4}(없|안)/.test(text);
      if (option.startsWith("수도")) return /수도|물/.test(text) && !/수도.{0,4}(없|안)/.test(text);
      if (option.startsWith("주차")) return /주차/.test(text) && !/주차.{0,4}(없|안|불가)/.test(text);
      return /화장실/.test(text) && !/화장실.{0,4}(없|안)/.test(text);
    });
    if (facilities.length) fields.facilities = [...new Set([...(current.facilities || []), ...facilities])];
    const repair = text.match(/[^.!?\n]*(?:도색|누수|보일러|창호|지붕|바닥|배관|전기 공사|수리|정비)[^.!?\n]*/);
    if (repair && !current.repairNeeds) fields.repairNeeds = repair[0].trim();
    if (!current.description && text.trim().length > 12) fields.description = text.trim();
    return fields;
  }

  const region = findRegion(text);
  if (region && !current.region) fields.region = region;
  const purpose = text.match(/(?:[가-힣]{1,6}\s*)?(?:공방|작업실|스튜디오|교육\s*공간|커뮤니티\s*공간|창업\s*공간|전시\s*공간|카페|사무실|창고)/);
  if (purpose && !current.purpose) fields.purpose = purpose[0].trim();
  const range = text.match(/(\d+)\s*[~\-–]\s*(\d+)\s*(?:㎡|제곱미터|평)?/);
  if (range) {
    const low = Number(range[1]); const high = Number(range[2]);
    if (!current.minArea && Number.isFinite(low)) fields.minArea = low;
    if (!current.maxArea && Number.isFinite(high)) fields.maxArea = high;
  } else if (squareMeters && !current.minArea) fields.minArea = squareMeters;
  if (budget && !current.maxBudget) fields.maxBudget = Math.round(budget.value);
  if (people && !current.people) fields.people = Math.round(people.value);
  const period = /1년|일 년|장기|오래/.test(text) ? "1년 이상" : /6개월\s*미만|단기|몇 달/.test(text) ? "6개월 미만" : /6개월|반년/.test(text) ? "6개월~1년" : "";
  if (period) fields.period = period;
  if (!current.description && text.trim().length > 12) fields.description = text.trim();
  return fields;
}

export function missingFields(kind: AssistKind, values: AssistFields) {
  return REQUIRED_FIELDS[kind].filter((key) => {
    const value = values[key as keyof AssistFields];
    return value === undefined || value === "" || value === 0;
  });
}

// 규칙 기반으로 채웠을 때의 안내 문구입니다.
export function fallbackReply(kind: AssistKind, filled: string[], missing: string[]) {
  const done = filled.length ? `${filled.map((key) => FIELD_LABELS[key] || key).join(", ")} 항목을 채워뒀습니다.` : "말씀해주신 내용에서 새로 채울 항목을 찾지 못했습니다.";
  if (!missing.length) return `${done} 필수 항목이 모두 준비됐습니다. 내용을 확인하고 등록을 진행해주세요.`;
  const ask = missing.map((key) => FIELD_LABELS[key] || key).join(", ");
  return `${done} ${ask}${missing.length > 1 ? "도" : "은"} 아직 비어 있어요. 알려주시면 이어서 채우겠습니다.`;
}
