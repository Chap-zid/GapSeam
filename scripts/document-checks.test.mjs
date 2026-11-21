import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkDocument } from "../src/lib/document-checks.ts";
import { withDocumentLawReference } from "../src/lib/document-law.ts";

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

test("document review instructions retain their purpose and include the dated law reference and limits", () => {
  for (const instruction of ["일반 문서 검토", "행동 강령 검토"]) {
    const prompt = withDocumentLawReference(instruction);
    assert.ok(prompt.startsWith(instruction));
    assert.match(prompt, /lsiSeq=284083/);
    assert.match(prompt, /2026년 7월 1일 시행본/);
    assert.match(prompt, /제2조제1항제1호·제2호/);
    assert.match(prompt, /제12조제1항/);
    assert.match(prompt, /최신 법령을 실시간으로 조회한 결과가 아닙니다/);
    assert.match(prompt, /모든 공가, 상가, 일반 임대 또는 리모델링에 자동 적용된다고 단정하지 마세요/);
  }
});
