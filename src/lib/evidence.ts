// 시세와 추천 용도의 "근거"를 만드는 순수 함수 모음입니다.
// 외부 API 호출은 market.ts(서버 전용)가 맡고, 여기서는 받아온 원자료를 계산·검증만 합니다.
// 서버와 화면, 테스트가 같은 계산식을 쓰도록 런타임 의존성 없이 작성합니다.

/* ── 타입 ─────────────────────────────────────────────── */

export type Quartiles = { q1: number; median: number; q3: number };
export type Range = { low: number; mid: number; high: number };

export type RentDeal = { ym: string; dong: string; area: number; deposit: number; monthly: number; buildYear?: number };
export type SaleDeal = { ym: string; dong: string; area: number; amount: number; buildYear?: number };

export type PriceComparable = { ym: string; dong: string; area: number; deposit?: number; monthly?: number; amount?: number; buildYear?: number };

export type AreaBand = { min: number; max: number; relaxed: boolean };

export type SaleEvidence = {
  dataset: string;
  sampleSize: number;
  areaBand: AreaBand;
  perSqmManwon: Quartiles;
  estimateManwon: Range;
  comparables: PriceComparable[];
};

export type PriceEvidence = {
  // ok: 실거래 기반 계산 완료 / insufficient: 표본 부족 / unavailable: 조회 실패·키 없음 / unsupported: 공개 자료가 없는 유형
  status: "ok" | "insufficient" | "unavailable" | "unsupported";
  reason: string;
  source: string;
  dataset?: string;
  lawdCode?: string;
  regionName?: string;
  period?: { from: string; to: string };
  totalDeals?: number;
  sampleSize?: number;
  areaBand?: AreaBand;
  perSqmMonthlyWon?: Quartiles;
  depositMedianManwon?: number;
  monthlyManwon?: Range;
  comparables?: PriceComparable[];
  sale?: SaleEvidence | null;
  method?: string;
  fetchedAt?: string;
};

export type StoreCount = { name: string; count: number };
export type CommerceEvidence = {
  status: "ok" | "unavailable";
  reason: string;
  source: string;
  radiusMeters?: number;
  baseMonth?: string;
  total?: number;
  majors?: StoreCount[];
  topMinors?: StoreCount[];
};

export type FacilityInput = { category: string; name: string; distanceMeters: number };

export type EvidenceItem = { id: string; kind: "market" | "facility" | "landUse" | "commerce"; label: string; source: string };

/* ── 상수와 그 근거 ───────────────────────────────────── */

// 사분위수(Q1·중앙값·Q3)를 의미 있게 나누려면 최소 5건은 있어야 합니다. 4건 이하면 한두 건이 범위를 좌우합니다.
export const MIN_SAMPLES = 5;
// 면적이 절반~두 배인 사례만 비교합니다. 면적이 커질수록 ㎡당 단가가 낮아지는 경향이 있어
// 규모가 크게 다른 집을 섞으면 단가가 한쪽으로 쏠립니다. 배수 기준이라 작은 집·큰 집 모두 대칭으로 적용됩니다.
export const AREA_BAND_FACTOR = 2;
// 반경 500m는 보행 속도 시속 4km 기준 약 7~8분 거리로, 근린 생활권을 볼 때 흔히 쓰는 범위입니다.
export const COMMERCE_RADIUS_METERS = 500;

export const RTMS_SOURCE = "국토교통부 실거래가 공개자료(공공데이터포털)";
export const COMMERCE_SOURCE = "소상공인시장진흥공단 상가(상권)정보(공공데이터포털)";
export const VWORLD_SOURCE = "VWorld 공간정보";

// 소상공인시장진흥공단 상권업종 대분류입니다. 반경 안에 없는 업종도 0곳으로 보여줘야 공급 공백을 판단할 수 있습니다.
export const COMMERCE_MAJORS = ["소매", "음식", "수리·개인", "교육", "예술·스포츠", "보건의료", "과학·기술", "시설관리·임대", "부동산", "숙박"];

/* ── 공공데이터 XML 파싱 ──────────────────────────────── */

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();
}

// 실거래가 API는 <item> 아래에 평평한 태그만 있으므로 정규식으로 충분히 안전하게 읽을 수 있습니다.
// 개편 전(한글 태그)과 개편 후(영문 태그) 응답을 모두 지원합니다.
export function parseRtmsXml(xml: string) {
  const text = String(xml || "");
  const code = (text.match(/<resultCode>\s*([^<]*?)\s*<\/resultCode>/) || [])[1] ?? "";
  const message = decodeXml((text.match(/<resultMsg>([\s\S]*?)<\/resultMsg>/) || [])[1] ?? "")
    || decodeXml((text.match(/<returnAuthMsg>([\s\S]*?)<\/returnAuthMsg>/) || [])[1] ?? "")
    || decodeXml((text.match(/<errMsg>([\s\S]*?)<\/errMsg>/) || [])[1] ?? "");
  const totalCount = Number((text.match(/<totalCount>\s*(\d+)\s*<\/totalCount>/) || [])[1] ?? NaN);
  const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => {
    const record: Record<string, string> = {};
    for (const field of match[1].matchAll(/<([^<>\s/]+)>([\s\S]*?)<\/\1>/g)) record[field[1]] = decodeXml(field[2]);
    return record;
  });
  // 개편 후 API는 "000", 이전 API는 "00"을 정상으로 돌려줍니다.
  const ok = code === "000" || code === "00" || (!code && items.length > 0);
  return { ok, code, message, totalCount: Number.isFinite(totalCount) ? totalCount : items.length, items };
}

export function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  return cleaned === "" ? NaN : Number(cleaned);
}

function pick(record: Record<string, string>, keys: string[]) {
  for (const key of keys) if (record[key] !== undefined && String(record[key]).trim() !== "") return String(record[key]).trim();
  return "";
}

const AREA_KEYS = {
  detached: ["totalFloorAr", "연면적", "계약면적"],
  multiplex: ["excluUseAr", "전용면적"],
  commercial: ["buildingAr", "건물면적"],
} as const;
export type DealKind = keyof typeof AREA_KEYS;

function yearMonth(record: Record<string, string>) {
  const year = pick(record, ["dealYear", "년", "계약년도"]);
  const month = pick(record, ["dealMonth", "월"]);
  return year && month ? `${year}-${month.padStart(2, "0")}` : "";
}

export function toRentDeal(record: Record<string, string>, kind: DealKind): RentDeal | null {
  const area = toNumber(pick(record, [...AREA_KEYS[kind]]));
  const deposit = toNumber(pick(record, ["deposit", "보증금액", "보증금"]));
  const monthly = toNumber(pick(record, ["monthlyRent", "월세금액", "월세"]) || "0");
  if (!(area > 0) || !Number.isFinite(deposit) || !Number.isFinite(monthly)) return null;
  const buildYear = toNumber(pick(record, ["buildYear", "건축년도"]));
  return { ym: yearMonth(record), dong: pick(record, ["umdNm", "법정동"]), area, deposit, monthly, ...(Number.isFinite(buildYear) ? { buildYear } : {}) };
}

export function toSaleDeal(record: Record<string, string>, kind: DealKind): SaleDeal | null {
  // 해제(취소)된 거래는 실제로 성립하지 않은 거래라 제외합니다.
  if (/^o$/i.test(pick(record, ["cdealType", "해제여부"]))) return null;
  const area = toNumber(pick(record, [...AREA_KEYS[kind]]));
  const amount = toNumber(pick(record, ["dealAmount", "거래금액"]));
  if (!(area > 0) || !(amount > 0)) return null;
  const buildYear = toNumber(pick(record, ["buildYear", "건축년도"]));
  return { ym: yearMonth(record), dong: pick(record, ["umdNm", "법정동"]), area, amount, ...(Number.isFinite(buildYear) ? { buildYear } : {}) };
}

/* ── 통계 ─────────────────────────────────────────────── */

// 엑셀 PERCENTILE.INC와 같은 선형 보간 방식입니다.
export function quantile(sortedValues: number[], probability: number) {
  if (!sortedValues.length) return NaN;
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

export function quartiles(values: number[]): Quartiles {
  const sorted = [...values].filter(Number.isFinite).sort((left, right) => left - right);
  return { q1: quantile(sorted, 0.25), median: quantile(sorted, 0.5), q3: quantile(sorted, 0.75) };
}

export function selectComparables<T extends { area: number }>(deals: T[], area: number) {
  if (!(area > 0)) return { deals, band: { min: 0, max: 0, relaxed: true } };
  const band = { min: Math.round((area / AREA_BAND_FACTOR) * 10) / 10, max: Math.round(area * AREA_BAND_FACTOR * 10) / 10 };
  const inBand = deals.filter((deal) => deal.area >= band.min && deal.area <= band.max);
  if (inBand.length >= MIN_SAMPLES) return { deals: inBand, band: { ...band, relaxed: false } };
  // 비슷한 면적이 부족하면 같은 시군구 전체로 넓히고, 화면에 "면적 조건 완화"를 표시합니다.
  return { deals, band: { ...band, relaxed: true } };
}

// 면적이 가장 비슷한 사례부터 보여줍니다. 배수 차이(log)로 재야 작은 집과 큰 집을 공평하게 비교할 수 있습니다.
function closestByArea<T extends { area: number }>(deals: T[], area: number, count: number) {
  if (!(area > 0)) return deals.slice(0, count);
  return [...deals].sort((left, right) => Math.abs(Math.log(left.area / area)) - Math.abs(Math.log(right.area / area))).slice(0, count);
}

const roundTo = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

export type RentSummary = {
  sampleSize: number;
  totalDeals: number;
  areaBand: AreaBand;
  perSqmMonthlyWon: Quartiles;
  depositMedianManwon: number;
  monthlyManwon: Range;
  comparables: PriceComparable[];
};

// 월세 계약만 씁니다. 전세(월세 0원)는 매달 내는 이용료가 없어 월 단가 계산에서 빼고 건수만 셉니다.
export function summarizeRent(deals: RentDeal[], area: number): RentSummary | null {
  const monthlyDeals = deals.filter((deal) => deal.monthly > 0);
  const selection = selectComparables(monthlyDeals, area);
  if (selection.deals.length < MIN_SAMPLES || !(area > 0)) return null;
  // 원자료 단위는 만 원입니다. ㎡당 단가는 읽기 쉽게 원 단위로 바꿉니다.
  const perSqm = quartiles(selection.deals.map((deal) => (deal.monthly * 10_000) / deal.area));
  const deposit = quartiles(selection.deals.map((deal) => deal.deposit)).median;
  const toMonthly = (won: number) => Math.max(1, Math.round((won * area) / 10_000));
  return {
    sampleSize: selection.deals.length,
    totalDeals: deals.length,
    areaBand: selection.band,
    perSqmMonthlyWon: { q1: Math.round(perSqm.q1), median: Math.round(perSqm.median), q3: Math.round(perSqm.q3) },
    depositMedianManwon: Math.round(deposit),
    monthlyManwon: { low: toMonthly(perSqm.q1), mid: toMonthly(perSqm.median), high: toMonthly(perSqm.q3) },
    comparables: closestByArea(selection.deals, area, 5).map((deal) => ({ ym: deal.ym, dong: deal.dong, area: deal.area, deposit: deal.deposit, monthly: deal.monthly, ...(deal.buildYear ? { buildYear: deal.buildYear } : {}) })),
  };
}

export function summarizeSale(deals: SaleDeal[], area: number, dataset: string): SaleEvidence | null {
  const selection = selectComparables(deals, area);
  if (selection.deals.length < MIN_SAMPLES || !(area > 0)) return null;
  const perSqm = quartiles(selection.deals.map((deal) => deal.amount / deal.area));
  const toTotal = (value: number) => Math.round(value * area);
  return {
    dataset,
    sampleSize: selection.deals.length,
    areaBand: selection.band,
    perSqmManwon: { q1: roundTo(perSqm.q1), median: roundTo(perSqm.median), q3: roundTo(perSqm.q3) },
    estimateManwon: { low: toTotal(perSqm.q1), mid: toTotal(perSqm.median), high: toTotal(perSqm.q3) },
    comparables: closestByArea(selection.deals, area, 5).map((deal) => ({ ym: deal.ym, dong: deal.dong, area: deal.area, amount: deal.amount, ...(deal.buildYear ? { buildYear: deal.buildYear } : {}) })),
  };
}

/* ── 금액 표기 ────────────────────────────────────────── */

export function formatManwon(value: number) {
  const rounded = Math.round(value);
  if (rounded >= 10_000) {
    const eok = Math.floor(rounded / 10_000);
    const rest = rounded % 10_000;
    return rest ? `${eok}억 ${rest.toLocaleString("ko-KR")}만 원` : `${eok}억 원`;
  }
  return `${rounded.toLocaleString("ko-KR")}만 원`;
}

// matching.ts의 monthlyPrice가 그대로 읽을 수 있도록 "월 a~b만 원" 형태를 유지합니다.
export function formatMonthlyRange(range: Range) {
  return range.low === range.high ? `월 ${range.low.toLocaleString("ko-KR")}만 원` : `월 ${range.low.toLocaleString("ko-KR")}~${range.high.toLocaleString("ko-KR")}만 원`;
}

// "450~650만 원", "1,000만~1,500만 원", "약 2천만 원", "1억~1억 5천만 원" 같은 표기를 만 원 단위로 읽습니다.
function parseAmountPart(part: string, fallbackUnit: "억" | "만" | null) {
  const text = part.replace(/,/g, "").replace(/\s+/g, "").replace(/^약|정도$|내외$/g, "");
  const match = text.match(/^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)(천만|천|백만|만)?)?/);
  if (!match || (!match[1] && !match[2])) return null;
  let total = match[1] ? Number(match[1]) * 10_000 : 0;
  if (match[2]) {
    const value = Number(match[2]);
    const unit = match[3] || (match[1] ? "만" : fallbackUnit);
    total += unit === "억" ? value * 10_000 : unit === "천만" || unit === "천" ? value * 1_000 : unit === "백만" ? value * 100 : unit === "만" ? value : NaN;
  }
  return Number.isFinite(total) && total > 0 ? total : null;
}

export function parseManwonRange(text: string) {
  const parts = String(text || "").split(/[~∼〜–]/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1].replace(/\s+/g, "");
  const unit = /억(?!.*만)/.test(last) && !/\d+(천|백)?만/.test(last) ? "억" : /만/.test(last) ? "만" : null;
  const values = parts.map((part) => parseAmountPart(part, unit));
  if (values.some((value) => value === null)) return null;
  const numbers = values as number[];
  return { low: Math.min(...numbers), high: Math.max(...numbers), mid: (Math.min(...numbers) + Math.max(...numbers)) / 2 };
}

/* ── 실거래 결과를 분석 필드로 바꾸기 ─────────────────── */

export function priceFieldsFromEvidence(evidence: PriceEvidence, repairCostText: string) {
  if (evidence.status !== "ok" || !evidence.monthlyManwon || evidence.depositMedianManwon === undefined) return null;
  const monthly = evidence.monthlyManwon;
  const deposit = evidence.depositMedianManwon > 0 ? `보증금 ${formatManwon(evidence.depositMedianManwon)} · ` : "";
  const repair = parseManwonRange(repairCostText);
  const payback = repair && monthly.mid > 0 ? Math.ceil(repair.mid / monthly.mid) : null;
  return {
    estimatedPrice: `${deposit}${formatMonthlyRange(monthly)}`,
    estimatedIncome: `연 약 ${formatManwon(monthly.mid * 12)}`,
    paybackPeriod: payback ? `약 ${payback}개월` : "산정 불가",
  };
}

/* ── 상권 집계 ────────────────────────────────────────── */

export function summarizeStores(items: Record<string, unknown>[]) {
  const majorCounts = new Map<string, number>();
  const minorCounts = new Map<string, number>();
  for (const item of items) {
    const major = String(item.indsLclsNm ?? "").trim();
    const minor = String(item.indsMclsNm ?? "").trim();
    if (major) majorCounts.set(major, (majorCounts.get(major) || 0) + 1);
    if (minor) minorCounts.set(minor, (minorCounts.get(minor) || 0) + 1);
  }
  const names = [...new Set([...COMMERCE_MAJORS, ...majorCounts.keys()])];
  return {
    total: items.length,
    majors: names.map((name) => ({ name, count: majorCounts.get(name) || 0 })).sort((left, right) => right.count - left.count),
    topMinors: [...minorCounts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count).slice(0, 8),
  };
}

/* ── 근거 목록 만들기 ─────────────────────────────────── */

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

export function buildEvidence(input: { price?: PriceEvidence | null; facilities?: FacilityInput[]; landUse?: string[]; commerce?: CommerceEvidence | null }): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const price = input.price;
  if (price?.status === "ok" && price.perSqmMonthlyWon && price.monthlyManwon) {
    const band = price.areaBand?.relaxed ? "면적 조건 완화" : `면적 ${price.areaBand?.min}~${price.areaBand?.max}㎡`;
    items.push({
      id: "M1",
      kind: "market",
      label: `${price.regionName} ${price.dataset} 최근 ${price.period?.from}~${price.period?.to} ${band} 월세 ${price.sampleSize}건: ㎡당 월 ${won(price.perSqmMonthlyWon.q1)}~${won(price.perSqmMonthlyWon.q3)}(중앙값 ${won(price.perSqmMonthlyWon.median)}), 보증금 중앙값 ${formatManwon(price.depositMedianManwon || 0)}`,
      source: price.source,
    });
  }
  if (price?.sale) {
    items.push({
      id: "M2",
      kind: "market",
      label: `${price.regionName} ${price.sale.dataset} ${price.sale.sampleSize}건: ㎡당 ${price.sale.perSqmManwon.median.toLocaleString("ko-KR")}만 원(중앙값), 같은 면적 환산 ${formatManwon(price.sale.estimateManwon.low)}~${formatManwon(price.sale.estimateManwon.high)}`,
      source: price.source,
    });
  }
  (input.facilities || []).forEach((facility, index) => items.push({ id: `F${index + 1}`, kind: "facility", label: `가장 가까운 ${facility.category}: ${facility.name} ${facility.distanceMeters}m`, source: VWORLD_SOURCE }));
  (input.landUse || []).forEach((use, index) => items.push({ id: `L${index + 1}`, kind: "landUse", label: `용도지역: ${use}`, source: VWORLD_SOURCE }));
  const commerce = input.commerce;
  if (commerce?.status === "ok" && commerce.majors) {
    const base = commerce.baseMonth ? ` (${commerce.baseMonth} 기준)` : "";
    items.push({ id: "S0", kind: "commerce", label: `반경 ${commerce.radiusMeters}m 상가 총 ${commerce.total}곳${base}`, source: commerce.source });
    commerce.majors.forEach((major, index) => items.push({ id: `S${index + 1}`, kind: "commerce", label: `반경 ${commerce.radiusMeters}m ${major.name} 업종 ${major.count}곳`, source: commerce.source }));
    if (commerce.topMinors?.length) items.push({ id: "S99", kind: "commerce", label: `반경 ${commerce.radiusMeters}m 많은 업종: ${commerce.topMinors.slice(0, 5).map((minor) => `${minor.name} ${minor.count}곳`).join(", ")}`, source: commerce.source });
  }
  return items;
}

/* ── 추천 용도와 근거 연결·검증 ───────────────────────── */

export type EvidenceLinkedUse = { name: string; score: number; reasons: string[]; caution?: string; evidenceIds?: string[]; unverifiedNumbers?: string[] };

export const NO_EXTERNAL_EVIDENCE = "외부 데이터 근거를 연결하지 못해 입력 정보만으로 판단한 추천입니다.";

function numberTokens(text: string) {
  return (String(text || "").match(/\d[\d,]*(?:\.\d+)?/g) || []).map((token) => token.replace(/,/g, "").replace(/\.0+$/, ""));
}

// 모델이 고른 근거 ID 중 실제로 제공한 것만 남깁니다.
// 이유 문장에 나온 숫자가 근거·입력 어디에도 없으면 "확인 필요"로 표시해 숫자를 지어내도 그대로 통과하지 않게 합니다.
export function linkUseEvidence<T extends EvidenceLinkedUse>(uses: T[], evidence: EvidenceItem[], inputText: string): T[] {
  const ids = new Set(evidence.map((item) => item.id));
  const known = new Set([...evidence.flatMap((item) => numberTokens(item.label)), ...numberTokens(inputText)]);
  return uses.map((use) => {
    const evidenceIds = [...new Set((use.evidenceIds || []).filter((id) => ids.has(id)))];
    const unverifiedNumbers = [...new Set(use.reasons.flatMap(numberTokens).filter((token) => !known.has(token)))];
    const caution = evidenceIds.length ? use.caution : [use.caution, NO_EXTERNAL_EVIDENCE].filter(Boolean).join(" ");
    const linked: T = { ...use, evidenceIds };
    if (caution) linked.caution = caution; else delete linked.caution;
    if (unverifiedNumbers.length) linked.unverifiedNumbers = unverifiedNumbers; else delete linked.unverifiedNumbers;
    return linked;
  });
}
