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

test("missing information never becomes a fabricated numeric score", () => {
  assert.equal(matchingTool(space, request).score, null);
  assert.equal(matchingTool(space, request, locations, "협의").score, null);
  assert.equal(matchingTool({ ...space, analysis: undefined }, request, locations).score, null);
});

test("monthly prices and overrides are interpreted as monthly amounts", () => {
  assert.equal(monthlyPrice("월 1,000~1,200만 원"), 1100);
  assert.equal(monthlyPrice("협의"), null);
  assert.equal(monthlyPrice("보증금 500만 원, 월 40만 원"), 40);
  assert.equal(monthlyPrice("보증금 500만 원"), null);
  assert.equal(matchingTool(space, request, locations, "월 100만 원").factors[1].membership, 0.25);
});
