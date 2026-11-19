import "server-only";
import {
  COMMERCE_RADIUS_METERS,
  COMMERCE_SOURCE,
  MIN_SAMPLES,
  RTMS_SOURCE,
  parseRtmsXml,
  summarizeRent,
  summarizeSale,
  summarizeStores,
  toRentDeal,
  toSaleDeal,
  type CommerceEvidence,
  type DealKind,
  type PriceEvidence,
  type RentDeal,
  type SaleDeal,
} from "./evidence";
import { extractRegion } from "./region";
import { findDistrictCode } from "./vworld";

// 국토교통부 실거래가 공개자료와 소상공인 상권정보를 공공데이터포털에서 직접 조회합니다.
// 두 API 모두 공공데이터포털에서 발급한 같은 서비스 키(DATA_GO_KR_SERVICE_KEY)로 호출합니다.

const RTMS_BASE = "https://apis.data.go.kr/1613000";
const COMMERCE_ENDPOINT = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius";

const DATASETS = {
  detachedRent: { path: "RTMSDataSvcSHRent/getRTMSDataSvcSHRent", label: "단독·다가구 전월세 실거래" },
  detachedSale: { path: "RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade", label: "단독·다가구 매매 실거래" },
  multiplexRent: { path: "RTMSDataSvcRHRent/getRTMSDataSvcRHRent", label: "연립·다세대 전월세 실거래" },
  // 연립다세대 매매는 개편 후 엔드포인트 이름 끝에 2가 붙습니다(공공데이터포털 명세 확인).
  multiplexSale: { path: "RTMSDataSvcRHTrade2/getRTMSDataSvcRHTrade2", label: "연립·다세대 매매 실거래" },
  commercialSale: { path: "RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade", label: "상업업무용 매매 실거래" },
} as const;

// 최근 12개월을 봅니다. 농촌 시군구는 한 달에 단독주택 월세 신고가 몇 건 안 되는 경우가 많아
// 6개월로는 표본 5건을 채우지 못하는 일이 잦고, 1년이면 계절에 따른 이사 수요 차이도 한 번씩 포함됩니다.
const LOOKBACK_MONTHS = 12;
const REQUEST_TIMEOUT_MS = 8_000;

// 대전 인근 시군구 코드(법정동 코드 앞 5자리)입니다. 목록에 없는 지역은 VWorld 행정구역 검색으로 찾습니다.
const LAWD_CODES: Record<string, string> = {
  "대전 동구": "30110", "대전 중구": "30140", "대전 서구": "30170", "대전 유성구": "30200", "대전 대덕구": "30230",
  "세종": "36110",
  "충북 청주시 상당구": "43111", "충북 청주시 서원구": "43112", "충북 청주시 흥덕구": "43113", "충북 청주시 청원구": "43114",
  "충북 보은군": "43720", "충북 옥천군": "43730", "충북 영동군": "43740",
  "충남 천안시 동남구": "44131", "충남 천안시 서북구": "44133", "충남 공주시": "44150", "충남 아산시": "44200",
  "충남 논산시": "44230", "충남 계룡시": "44250", "충남 금산군": "44710",
};

function serviceKey() {
  return process.env.DATA_GO_KR_SERVICE_KEY || process.env.PUBLIC_DATA_SERVICE_KEY || "";
}

// 공공데이터포털은 인코딩 키와 디코딩 키를 둘 다 줍니다. 어느 쪽을 넣어도 동작하도록 처리합니다.
function encodedKey() {
  const key = serviceKey();
  return key.includes("%") ? key : encodeURIComponent(key);
}

function regionKeys(address: string, region: string) {
  const base = extractRegion(address || region);
  const tokens = String(address || "").trim().split(/\s+/);
  const city = tokens.find((token) => /시$/.test(token) && token.length >= 2);
  const gu = tokens.find((token) => /구$/.test(token) && token.length >= 2);
  const keys = [city && gu ? `${base.split(" ")[0]} ${city} ${gu}` : "", base, extractRegion(region)].filter(Boolean);
  return [...new Set(keys)];
}

export async function resolveLawdCode(address: string, region: string) {
  for (const key of regionKeys(address, region)) if (LAWD_CODES[key]) return { code: LAWD_CODES[key], name: key };
  try {
    const found = await findDistrictCode(address || region);
    if (found) return found;
  } catch (error) {
    console.error("LAWD code lookup failed", error instanceof Error ? error.message : "Unknown error");
  }
  return null;
}

export function recentMonths(count: number, now = new Date()) {
  // 실거래 신고는 한국 시간 기준 월로 집계되므로 KST로 맞춥니다.
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const months: string[] = [];
  for (let offset = 0; offset < count; offset++) {
    const date = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - offset, 1));
    months.push(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

async function fetchRtmsMonth(path: string, lawdCode: string, month: string) {
  const items: Record<string, string>[] = [];
  for (let page = 1; page <= 5; page++) {
    const url = `${RTMS_BASE}/${path}?serviceKey=${encodedKey()}&LAWD_CD=${lawdCode}&DEAL_YMD=${month}&pageNo=${page}&numOfRows=1000`;
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const parsed = parseRtmsXml(await response.text());
    if (!response.ok || !parsed.ok) throw new Error(parsed.message || parsed.code || `HTTP ${response.status}`);
    items.push(...parsed.items);
    if (items.length >= parsed.totalCount || parsed.items.length < 1000) break;
  }
  return items;
}

async function fetchRtms(path: string, lawdCode: string, months: string[]) {
  const results = await Promise.allSettled(months.map((month) => fetchRtmsMonth(path, lawdCode, month)));
  const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : []);
  return { items, errors, failedMonths: errors.length };
}

function dealKind(buildingType: string): DealKind {
  if (/상가|업무|창고|근린|상업/.test(buildingType)) return "commercial";
  if (/공동|연립|다세대|빌라|아파트/.test(buildingType)) return "multiplex";
  return "detached";
}

const monthLabel = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}`;

export async function getPriceEvidence(space: { address: string; region: string; area: number; buildingType: string }): Promise<PriceEvidence> {
  const base = { source: RTMS_SOURCE, fetchedAt: new Date().toISOString() };
  if (!serviceKey()) return { ...base, status: "unavailable", reason: "공공데이터포털 서비스 키(DATA_GO_KR_SERVICE_KEY)가 설정되지 않아 실거래가를 조회하지 못했습니다." };
  const lawd = await resolveLawdCode(space.address, space.region);
  if (!lawd) return { ...base, status: "unavailable", reason: "주소에서 시군구 코드를 찾지 못해 실거래가를 조회하지 못했습니다." };

  const months = recentMonths(LOOKBACK_MONTHS);
  const period = { from: monthLabel(months[months.length - 1]), to: monthLabel(months[0]) };
  const kind = dealKind(space.buildingType);
  const rentDataset = kind === "multiplex" ? DATASETS.multiplexRent : kind === "detached" ? DATASETS.detachedRent : null;
  const saleDataset = kind === "multiplex" ? DATASETS.multiplexSale : kind === "detached" ? DATASETS.detachedSale : DATASETS.commercialSale;

  const [rent, sale] = await Promise.all([
    rentDataset ? fetchRtms(rentDataset.path, lawd.code, months) : Promise.resolve(null),
    fetchRtms(saleDataset.path, lawd.code, months),
  ]);

  const saleDeals = sale.items.map((item) => toSaleDeal(item, kind)).filter((deal): deal is SaleDeal => Boolean(deal));
  const saleSummary = summarizeSale(saleDeals, space.area, saleDataset.label);
  const shared = { ...base, lawdCode: lawd.code, regionName: lawd.name, period, sale: saleSummary };
  const method = `최근 ${LOOKBACK_MONTHS}개월 ${lawd.name} 신고 자료 중 면적이 절반~두 배인 월세 계약(${MIN_SAMPLES}건 미만이면 시군구 전체)의 ㎡당 월세를 계산하고, 1사분위~3사분위 범위에 이 공간 면적(${space.area}㎡)을 곱했습니다.`;

  if (!rentDataset || !rent) {
    return { ...shared, status: "unsupported", dataset: saleDataset.label, reason: "상가·업무시설의 임대 실거래는 국토교통부 공개자료에 없어 월 이용료는 계산하지 않았습니다. 매매 실거래만 참고로 제공합니다." };
  }
  if (rent.failedMonths === months.length) {
    return { ...shared, status: "unavailable", dataset: rentDataset.label, reason: `실거래가 API 호출에 실패했습니다: ${rent.errors[0] || "알 수 없는 오류"}` };
  }
  const rentDeals = rent.items.map((item) => toRentDeal(item, kind)).filter((deal): deal is RentDeal => Boolean(deal));
  const summary = summarizeRent(rentDeals, space.area);
  if (!summary) {
    const monthlyCount = rentDeals.filter((deal) => deal.monthly > 0).length;
    return { ...shared, status: "insufficient", dataset: rentDataset.label, totalDeals: rentDeals.length, sampleSize: monthlyCount, reason: `최근 ${LOOKBACK_MONTHS}개월 ${lawd.name} 월세 신고가 ${monthlyCount}건뿐이라(기준 ${MIN_SAMPLES}건) 시세 범위를 계산하지 않았습니다.` };
  }
  const partial = rent.failedMonths ? ` (${months.length}개월 중 ${rent.failedMonths}개월은 조회 실패)` : "";
  return { ...shared, status: "ok", dataset: rentDataset.label, reason: `실거래 월세 ${summary.sampleSize}건으로 계산했습니다${partial}.`, method, ...summary };
}

// 정확한 좌표가 있을 때만 반경 상권을 조회합니다. 주소가 가려져 행정구역 중심점밖에 없으면
// 실제 공간 주변이 아닌 엉뚱한 상권을 근거로 쓰게 되므로 조회하지 않습니다.
export async function getCommerceEvidence(coordinate?: { longitude: number; latitude: number } | null): Promise<CommerceEvidence> {
  const base = { source: COMMERCE_SOURCE };
  if (!serviceKey()) return { ...base, status: "unavailable", reason: "공공데이터포털 서비스 키(DATA_GO_KR_SERVICE_KEY)가 설정되지 않아 상권정보를 조회하지 못했습니다." };
  if (!coordinate || !Number.isFinite(coordinate.longitude) || !Number.isFinite(coordinate.latitude)) {
    return { ...base, status: "unavailable", reason: "정확한 좌표를 확인하지 못해(주소 미확인·가려진 주소) 반경 상권을 조회하지 않았습니다." };
  }
  try {
    const items: Record<string, unknown>[] = [];
    let baseMonth = "";
    // 반경 500m는 도심에서도 대개 3,000곳 이내라 3쪽(3,000곳)까지만 읽습니다.
    for (let page = 1; page <= 3; page++) {
      const url = `${COMMERCE_ENDPOINT}?serviceKey=${encodedKey()}&pageNo=${page}&numOfRows=1000&radius=${COMMERCE_RADIUS_METERS}&cx=${coordinate.longitude}&cy=${coordinate.latitude}&type=json`;
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const text = await response.text();
      // 인증 오류는 type=json이어도 XML로 돌아옵니다.
      if (text.trim().startsWith("<")) {
        const parsed = parseRtmsXml(text);
        if (/NODATA|데이터없음|해당.*없/i.test(parsed.message) || parsed.code === "03") break;
        throw new Error(parsed.message || parsed.code || `HTTP ${response.status}`);
      }
      // 명세는 header/body 구분 없이 항목만 나열하므로, 중첩된 형태와 평평한 형태를 모두 읽습니다.
      type Header = { resultCode?: string; resultMsg?: string; stdrYm?: string };
      type Body = { items?: Record<string, unknown>[] | { item?: Record<string, unknown>[] | Record<string, unknown> }; totalCount?: number | string };
      const json = JSON.parse(text) as Header & Body & { header?: Header; body?: Body };
      const header: Header = json.header || json;
      const body: Body = json.body || json;
      const code = header.resultCode;
      if (code === "03") break; // 반경 안에 상가가 없음
      if (code && code !== "00") throw new Error(header.resultMsg || code);
      baseMonth = baseMonth || header.stdrYm || "";
      const rawItems = Array.isArray(body.items) ? body.items : body.items?.item;
      const pageItems = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
      items.push(...pageItems);
      if (pageItems.length < 1000 || items.length >= Number(body.totalCount ?? 0)) break;
    }
    const summary = summarizeStores(items);
    return { ...base, status: "ok", reason: `반경 ${COMMERCE_RADIUS_METERS}m 상가 ${summary.total}곳을 집계했습니다.`, radiusMeters: COMMERCE_RADIUS_METERS, baseMonth: baseMonth ? monthLabel(baseMonth) : "", ...summary };
  } catch (error) {
    return { ...base, status: "unavailable", reason: `상권정보 API 호출에 실패했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}` };
  }
}
