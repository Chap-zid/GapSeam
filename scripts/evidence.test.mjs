import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MIN_SAMPLES, buildEvidence, formatManwon, formatMonthlyRange, linkUseEvidence, parseManwonRange, parseRtmsXml,
  priceFieldsFromEvidence, quartiles, selectComparables, summarizeRent, summarizeSale, summarizeStores, toRentDeal, toSaleDeal,
} from "../src/lib/evidence.ts";
import { districtTokens, pickDistrictItem, sigunguTokens } from "../src/lib/district.ts";
import { monthlyPrice } from "../src/lib/matching.ts";

// 개편 후 실거래가 API(영문 태그) 응답 형식입니다.
const rentXml = `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>
<item><buildYear>1985</buildYear><dealDay>3</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><deposit>1,000</deposit><monthlyRent>25</monthlyRent><totalFloorAr>70</totalFloorAr><umdNm>옥천읍</umdNm></item>
<item><dealMonth>8</dealMonth><dealYear>2026</dealYear><deposit>2,000</deposit><monthlyRent>0</monthlyRent><totalFloorAr>80</totalFloorAr><umdNm>군북면</umdNm></item>
</items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>2</totalCount></body></response>`;

test("parses renewed and legacy RTMS XML responses", () => {
  const parsed = parseRtmsXml(rentXml);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.items.length, 2);
  const deal = toRentDeal(parsed.items[0], "detached");
  assert.deepEqual(deal, { ym: "2026-09", dong: "옥천읍", area: 70, deposit: 1000, monthly: 25, buildYear: 1985 });
  const legacy = parseRtmsXml("<response><header><resultCode>00</resultCode></header><body><items><item><거래금액>  15,000</거래금액><연면적>72.5</연면적><법정동>옥천읍</법정동><년>2026</년><월>10</월></item></items></body></response>");
  assert.equal(legacy.ok, true);
  assert.deepEqual(toSaleDeal(legacy.items[0], "detached"), { ym: "2026-10", dong: "옥천읍", area: 72.5, amount: 15000 });
});

test("reports API errors instead of empty data", () => {
  const error = parseRtmsXml("<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>");
  assert.equal(error.ok, false);
  assert.equal(error.message, "SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
});

test("cancelled sales are excluded", () => {
  assert.equal(toSaleDeal({ dealAmount: "9,000", totalFloorAr: "60", cdealType: "O" }, "detached"), null);
});

test("quartiles use linear interpolation", () => {
  assert.deepEqual(quartiles([1, 2, 3, 4, 5]), { q1: 2, median: 3, q3: 4 });
  assert.deepEqual(quartiles([10, 20, 30, 40]), { q1: 17.5, median: 25, q3: 32.5 });
});

test("comparables stay within half to double the area, and widen only when too few", () => {
  const deals = [30, 40, 60, 70, 80, 120, 300].map((area) => ({ area }));
  const near = selectComparables(deals, 60);
  assert.deepEqual(near.deals.map((deal) => deal.area), [30, 40, 60, 70, 80, 120]);
  assert.equal(near.band.relaxed, false);
  const sparse = selectComparables([{ area: 60 }, { area: 300 }], 60);
  assert.equal(sparse.band.relaxed, true);
  assert.equal(sparse.deals.length, 2);
});

const rentDeals = [
  { ym: "2026-01", dong: "A", area: 50, deposit: 500, monthly: 20 },
  { ym: "2026-02", dong: "A", area: 60, deposit: 1000, monthly: 30 },
  { ym: "2026-03", dong: "B", area: 70, deposit: 300, monthly: 35 },
  { ym: "2026-04", dong: "B", area: 80, deposit: 500, monthly: 40 },
  { ym: "2026-05", dong: "C", area: 100, deposit: 2000, monthly: 30 },
  { ym: "2026-06", dong: "C", area: 70, deposit: 5000, monthly: 0 },
];

test("rent summary uses monthly contracts only and scales per-㎡ quartiles by area", () => {
  const summary = summarizeRent(rentDeals, 70);
  assert.equal(summary.sampleSize, 5);
  assert.equal(summary.totalDeals, 6);
  // ㎡당 월세(원): 4000, 5000, 5000, 5000, 3000 → Q1 4000 · 중앙값 5000 · Q3 5000
  assert.deepEqual(summary.perSqmMonthlyWon, { q1: 4000, median: 5000, q3: 5000 });
  assert.deepEqual(summary.monthlyManwon, { low: 28, mid: 35, high: 35 });
  assert.equal(summary.depositMedianManwon, 500);
  assert.equal(summary.comparables[0].area, 70);
});

test("too few monthly contracts never produce a price", () => {
  assert.equal(summarizeRent(rentDeals.slice(0, MIN_SAMPLES - 1), 70), null);
});

test("sale summary converts per-㎡ price to this area", () => {
  const sale = summarizeSale([100, 110, 120, 130, 140].map((perSqm, index) => ({ ym: "2026-01", dong: "A", area: 50 + index, amount: perSqm * (50 + index) })), 60, "단독·다가구 매매 실거래");
  assert.equal(sale.perSqmManwon.median, 120);
  assert.equal(sale.estimateManwon.mid, 7200);
});

test("Korean money ranges are parsed in 만 원", () => {
  assert.deepEqual(parseManwonRange("450~650만 원"), { low: 450, high: 650, mid: 550 });
  assert.deepEqual(parseManwonRange("1,000만~1,500만 원"), { low: 1000, high: 1500, mid: 1250 });
  assert.deepEqual(parseManwonRange("약 2천만 원"), { low: 2000, high: 2000, mid: 2000 });
  assert.deepEqual(parseManwonRange("1억~1억 5천만 원"), { low: 10000, high: 15000, mid: 12500 });
  assert.deepEqual(parseManwonRange("1~2억 원"), { low: 10000, high: 20000, mid: 15000 });
  assert.equal(parseManwonRange("산정 불가"), null);
  assert.equal(formatManwon(15000), "1억 5,000만 원");
  assert.equal(formatManwon(500), "500만 원");
});

test("data-based price text stays readable by the matching budget parser", () => {
  const fields = priceFieldsFromEvidence({ status: "ok", reason: "", source: "", depositMedianManwon: 500, monthlyManwon: { low: 28, mid: 35, high: 42 } }, "350~700만 원");
  assert.equal(fields.estimatedPrice, "보증금 500만 원 · 월 28~42만 원");
  assert.equal(monthlyPrice(fields.estimatedPrice), 35);
  assert.equal(fields.estimatedIncome, "연 약 420만 원");
  assert.equal(fields.paybackPeriod, "약 15개월");
  assert.equal(formatMonthlyRange({ low: 30, mid: 30, high: 30 }), "월 30만 원");
  assert.equal(priceFieldsFromEvidence({ status: "insufficient", reason: "", source: "" }, "100만 원"), null);
});

test("store counts include zero-count majors so supply gaps are visible", () => {
  const summary = summarizeStores([
    { indsLclsNm: "음식", indsMclsNm: "한식" }, { indsLclsNm: "음식", indsMclsNm: "한식" }, { indsLclsNm: "소매", indsMclsNm: "편의점" },
  ]);
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.majors[0], { name: "음식", count: 2 });
  assert.ok(summary.majors.some((major) => major.name === "교육" && major.count === 0));
  assert.deepEqual(summary.topMinors[0], { name: "한식", count: 2 });
});

const evidence = buildEvidence({
  facilities: [{ category: "학교", name: "옥천초등학교", distanceMeters: 320 }],
  landUse: ["제2종일반주거지역"],
  commerce: { status: "ok", reason: "", source: "상권", radiusMeters: 500, total: 3, majors: [{ name: "음식", count: 2 }, { name: "교육", count: 0 }], topMinors: [] },
});

test("evidence list carries stable ids and real values", () => {
  assert.deepEqual(evidence.map((item) => item.id), ["F1", "L1", "S0", "S1", "S2"]);
  assert.match(evidence[0].label, /320m/);
  assert.match(evidence[4].label, /교육 업종 0곳/);
});

test("uses keep only real evidence ids and flag numbers that appear nowhere", () => {
  const [cited, uncited] = linkUseEvidence([
    { name: "소규모 학원", score: 80, reasons: ["학교 320m", "반경 500m 교육 업종 0곳", "수요 1,200명"], evidenceIds: ["F1", "S2", "X9"] },
    { name: "공방", score: 70, reasons: ["면적 72.5㎡로 작업 공간 확보"], evidenceIds: [] },
  ], evidence, "면적: 72.5㎡");
  assert.deepEqual(cited.evidenceIds, ["F1", "S2"]);
  assert.deepEqual(cited.unverifiedNumbers, ["1200"]);
  assert.equal(cited.caution, undefined);
  assert.deepEqual(uncited.evidenceIds, []);
  assert.equal(uncited.unverifiedNumbers, undefined);
  assert.match(uncited.caution, /외부 데이터 근거/);
});

test("masked addresses and region names reduce to administrative tokens", () => {
  assert.deepEqual(districtTokens("충청북도 옥천군 옥천읍 양수로*길 *-*"), ["충청북도", "옥천군", "옥천읍"]);
  assert.deepEqual(districtTokens("대전 동구"), ["대전", "동구"]);
  assert.deepEqual(districtTokens("대전광역시 동구 중앙로 215"), ["대전광역시", "동구"]);
  assert.deepEqual(sigunguTokens("충청남도 천안시 동남구 신부동 ***"), ["충청남도", "천안시", "동남구"]);
  assert.deepEqual(sigunguTokens("충청북도 옥천군 군북면 자모길 ***-*"), ["충청북도", "옥천군"]);
});

test("district search results must contain every parent region name", () => {
  const items = [
    { id: "4413125000", title: "충청남도 천안시 동남구 신방동", point: { x: "127.1", y: "36.7" } },
    { id: "4373025000", title: "충청북도 옥천군 옥천읍", point: { x: "127.57", y: "36.30" } },
  ];
  const hit = pickDistrictItem(items, ["충북", "옥천군", "옥천읍"]);
  assert.equal(hit.code, "4373025000");
  assert.equal(hit.longitude, 127.57);
  assert.equal(pickDistrictItem(items, ["충남", "옥천군"]), null);
});
