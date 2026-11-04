export type LiveDocumentFinding = { title: string; detail: string };

const REQUIRED_FIELDS = [
  ["대상 공간", "대상 공간을 구체적으로 적어주세요."],
  ["활용 목적", "공간의 활용 목적을 적어주세요."],
  ["이용 기간", "시작일과 종료일 또는 이용 기간을 확인해주세요."],
  ["예상 이용료", "월 이용료와 납부 조건을 확인해주세요."],
  ["소유자 담당", "소유자의 정비·관리 범위를 적어주세요."],
  ["이용자 담당", "이용자의 정비·관리 범위를 적어주세요."],
  ["인허가·안전 확인", "인허가와 현장 안전 확인 계획을 적어주세요."],
] as const;

export function checkDocument(text: string): LiveDocumentFinding[] {
  const findings: LiveDocumentFinding[] = [];
  for (const [label, detail] of REQUIRED_FIELDS) {
    const lines = text.split(/\r?\n/).map((line) => line.trim().replace(/^-\s*/, ""));
    const values = lines.filter((line) => line.startsWith(`${label}:`)).map((line) => line.slice(label.length + 1).trim());
    if (!values.some(Boolean)) findings.push({ title: `${label} 확인 필요`, detail });
    const distinct = new Set(values.filter(Boolean));
    if (distinct.size > 1) findings.push({ title: `${label} 내용 대조 필요`, detail: "같은 항목에 서로 다른 내용이 있어 양측이 확인해야 합니다." });
  }
  const dates = text.match(/이용 기간\s*:\s*(\d{4}-\d{2}-\d{2})\s*[~–]\s*(\d{4}-\d{2}-\d{2})/);
  if (dates && dates[1] > dates[2]) findings.push({ title: "이용 기간 확인 필요", detail: "시작일이 종료일보다 늦습니다." });
  if (/예상 이용료\s*:\s*-\s*\d/.test(text)) findings.push({ title: "이용료 확인 필요", detail: "이용료에 음수가 입력되어 있습니다." });
  return findings;
}
