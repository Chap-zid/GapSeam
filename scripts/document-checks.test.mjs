import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkDocument } from "../src/lib/document-checks.ts";

test("empty or missing fields are flagged", () => {
  const findings = checkDocument("- 대상 공간:\n- 활용 목적: 공방");
  assert.ok(findings.some((item) => item.title === "대상 공간 확인 필요"));
  assert.ok(!findings.some((item) => item.title === "활용 목적 확인 필요"));
});

test("conflicting fields, reversed dates and negative prices are flagged", () => {
  const findings = checkDocument("- 이용 기간: 2027-01-01 ~ 2026-01-01\n- 예상 이용료: -10만 원\n- 예상 이용료: 20만 원");
  assert.ok(findings.some((item) => item.title === "이용 기간 확인 필요"));
  assert.ok(findings.some((item) => item.title === "예상 이용료 내용 대조 필요"));
  assert.ok(findings.some((item) => item.title === "이용료 확인 필요"));
});
