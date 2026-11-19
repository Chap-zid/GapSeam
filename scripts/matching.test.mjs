import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_WEIGHTS, matchingTool, monthlyPrice, normalizeWeights } from "../src/lib/matching.ts";

const space = {
  id: "s", ownerId: "o", address: "공간", region: "지역", area: 60, buildingType: "", description: "",
  imageUrls: [], currentStatus: "", createdAt: "", analysis: {
    condition: "", surroundingEnvironment: "", suggestedUses: [{ name: "도자기 공방", score: 90, reasons: [] }],
    estimatedRepairCost: "", estimatedPrice: "월 40~60만 원", estimatedIncome: "", paybackPeriod: "",
  },
};
const request = { id: "r", seekerId: "u", seekerName: "", purpose: "도자기 공방", description: "", region: "희망", minArea: 40, maxArea: 80, maxBudget: 25, people: 1, period: "", createdAt: "" };
const point = { latitude: 36.35, longitude: 127.43 };
const locations = { space: point, request: point };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test("four formulas and weighted geometric score follow the specification", () => {
  const result = matchingTool(space, request, locations);
  assert.deepEqual(result.factors.map((factor) => factor.membership), [1, 0.5, 1, 1]);
  assert.equal(result.score, Math.round(100 * Math.pow(0.5, 0.25)));
  assert.equal(result.algorithmVersion, "geometric-v3");
});

test("distance and area decay exponentially", () => {
  const result = matchingTool({ ...space, area: 120 }, request, { space: point, request: { ...point, latitude: point.latitude + 0.1 } });
  near(result.factors[2].membership, Math.exp(-1));
  assert.ok(result.factors[0].membership < Math.exp(-1));
});

test("purpose uses a true Jaccard union and zero suppresses the score", () => {
  const result = matchingTool(space, { ...request, purpose: "카페" }, locations);
  assert.equal(result.factors[3].membership, 0);
  assert.equal(result.score, 0);
  const partial = matchingTool(space, { ...request, purpose: "도자기 교육" }, locations);
  near(partial.factors[3].membership, 1 / 3);
});

test("weights normalize, zero weights do not require missing values, invalid weights fail", () => {
  assert.deepEqual(normalizeWeights(DEFAULT_WEIGHTS), DEFAULT_WEIGHTS);
  const result = matchingTool(space, { ...request, matchWeights: { region: 0, budget: 2, area: 0, purpose: 0 } });
  assert.equal(result.score, 50);
  assert.throws(() => normalizeWeights({ region: 0, budget: 0, area: 0, purpose: 0 }));
  assert.throws(() => normalizeWeights({ region: -1, budget: 1, area: 1, purpose: 1 }));
});

test("missing information is never filled in; only confirmed factors are scored", () => {
  // 위치만 없으면 나머지 세 항목(중요도 75%)으로 다시 나눠 계산합니다. 예산 0.5^(0.25/0.75)
  const noLocation = matchingTool(space, request);
  assert.equal(noLocation.factors[0].membership, null);
  assert.equal(noLocation.coverage, 0.75);
  assert.equal(noLocation.partial, true);
  assert.equal(noLocation.score, Math.round(100 * Math.pow(0.5, 0.25 / 0.75)));
  assert.match(noLocation.reason, /확인 필요: 위치/);
  // 위치와 예산이 모두 없으면 중요도 50%로, 기준선에서 계산합니다.
  const half = matchingTool(space, request, {}, "협의");
  assert.equal(half.coverage, 0.5);
  assert.equal(half.score, 100);
  // 분석 결과(이용료·추천 용도)와 위치가 모두 없으면 25%뿐이라 점수를 내지 않습니다.
  const tooLittle = matchingTool({ ...space, analysis: undefined }, request);
  assert.equal(tooLittle.coverage, 0.25);
  assert.equal(tooLittle.score, null);
  assert.equal(tooLittle.eligible, false);
});

test("a complete comparison is not marked partial", () => {
  const result = matchingTool(space, request, locations);
  assert.equal(result.partial, false);
  assert.equal(result.coverage, 1);
});

test("district-level coordinates are labelled as approximate", () => {
  const result = matchingTool(space, request, { space: { ...point, precision: "district" }, request: point });
  assert.match(result.factors[0].summary, /행정구역 중심 기준/);
});

test("monthly prices and overrides are interpreted as monthly amounts", () => {
  assert.equal(monthlyPrice("월 1,000~1,200만 원"), 1100);
  assert.equal(monthlyPrice("협의"), null);
  assert.equal(monthlyPrice("보증금 500만 원, 월 40만 원"), 40);
  assert.equal(monthlyPrice("보증금 500만 원"), null);
  assert.equal(monthlyPrice("월세 약 40만~60만원 수준 추정"), 50);
  assert.equal(monthlyPrice("월 임대료 약 80만원~120만원 예상"), 100);
  assert.equal(monthlyPrice("보증금 1000만원에 월세 50~70만원 수준"), 60);
  assert.equal(monthlyPrice("약 1억 5,000만~2억 원 (매매가 추정)"), null);
  assert.equal(matchingTool(space, request, locations, "월 100만 원").factors[1].membership, 0.25);
});
