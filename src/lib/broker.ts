import type { ChatMessage, Space, SpaceMatch, SpaceRequest } from "./types";

// 중개 에이전트는 공인중개사의 업무 중 "중개 진행"과 "서류 확인 안내"만 맡습니다.
// 권리관계 판단, 법률 자문, 계약 효력에 대한 단정은 자격이 필요한 영역이므로 하지 않습니다.
// 합의 진행 상황은 모델 추론이 아니라 대화 내용에 대한 규칙 기반 판정으로 계산합니다.

export const BROKER_NAME = "빈틈이음 중개 에이전트";

export type AgendaKey = "price" | "period" | "usage" | "repair" | "schedule" | "papers";
export type AgendaStatus = "agreed" | "discussing" | "open";
export type AgendaItem = { key: AgendaKey; label: string; status: AgendaStatus; note: string };

const AGREEMENT = /(동의|합의|확정|그렇게\s*하|좋습니다|좋아요|알겠습니다|괜찮습니다|진행하겠|수락)/;

const AGENDA: { key: AgendaKey; label: string; pattern: RegExp; open: string; discussing: string; agreed: string }[] = [
  { key: "price", label: "이용료", pattern: /(이용료|임대료|월세|보증금|가격|금액|만\s*원)/,
    open: "아직 이용료 이야기가 오가지 않았습니다.", discussing: "이용료를 이야기하는 중입니다. 금액과 납부 주기를 함께 정해주세요.", agreed: "이용료에 대한 합의 표현이 확인됐습니다." },
  { key: "period", label: "이용 기간", pattern: /(기간|개월|\d+\s*년|시작일|종료|언제까지|장기|단기)/,
    open: "이용 시작일과 기간이 아직 정해지지 않았습니다.", discussing: "이용 기간을 조율하는 중입니다. 시작일과 종료일을 특정해주세요.", agreed: "이용 기간에 대한 합의 표현이 확인됐습니다." },
  { key: "usage", label: "이용 범위", pattern: /(용도|어떻게\s*쓰|사용\s*범위|작업|수업|클래스|영업|시간대|소음)/,
    open: "공간을 어떤 방식으로 쓸지 아직 공유되지 않았습니다.", discussing: "이용 범위를 이야기하는 중입니다. 사용 시간대와 허용 범위를 적어두세요.", agreed: "이용 범위에 대한 합의 표현이 확인됐습니다." },
  { key: "repair", label: "정비 분담", pattern: /(정비|수리|보수|도색|공사|원상복구|인테리어|비용\s*부담)/,
    open: "정비 범위와 비용 부담이 아직 논의되지 않았습니다.", discussing: "정비 분담을 이야기하는 중입니다. 누가 어디까지 부담할지 적어주세요.", agreed: "정비 분담에 대한 합의 표현이 확인됐습니다." },
  { key: "schedule", label: "현장 방문", pattern: /(방문|현장|보러|답사|둘러|일정|만나)/,
    open: "현장 방문 일정이 잡히지 않았습니다.", discussing: "방문 일정을 조율하는 중입니다. 날짜와 시간을 확정해주세요.", agreed: "현장 방문 일정에 대한 합의 표현이 확인됐습니다." },
  { key: "papers", label: "확인 서류", pattern: /(등기|건축물대장|대장|서류|증명서|허가|신고|용도지역)/,
    open: "확인할 서류 이야기가 아직 없습니다.", discussing: "서류 확인을 이야기하는 중입니다. 확인 주체와 기한을 정해주세요.", agreed: "서류 확인 방법에 대한 합의 표현이 확인됐습니다." },
];

// 대화에서 각 협의 항목이 어디까지 진행됐는지 판정합니다.
export function trackAgenda(messages: Pick<ChatMessage, "text" | "role">[]): AgendaItem[] {
  // 에이전트 본인의 발언은 합의 근거로 세지 않습니다.
  const human = messages.filter((message) => message.role !== "agent").map((message) => String(message.text || ""));
  return AGENDA.map((item) => {
    const mentions = human.filter((text) => item.pattern.test(text));
    const agreed = mentions.some((text) => AGREEMENT.test(text));
    const status: AgendaStatus = agreed ? "agreed" : mentions.length ? "discussing" : "open";
    return { key: item.key, label: item.label, status, note: item[status] };
  });
}

export function agendaProgress(agenda: AgendaItem[]) {
  return Math.round((agenda.filter((item) => item.status === "agreed").length / agenda.length) * 100);
}

// 공인중개사의 권리관계 확인 업무를 "판단"이 아니라 "확인 안내"로 옮긴 부분입니다.
const PERMIT_HINTS: { pattern: RegExp; item: string }[] = [
  { pattern: /(식당|음식|카페|베이커리|주방|요리)/, item: "식품 취급 계획이 있다면 영업 신고 대상인지 관할 보건소에 확인" },
  { pattern: /(학원|교습|수업|클래스|교육)/, item: "정기 교습을 운영한다면 학원·교습소 등록 요건을 교육지원청에 확인" },
  { pattern: /(어린이|키즈|돌봄|유아)/, item: "아동 대상 운영이면 시설 기준과 인가 요건을 지자체에 확인" },
  { pattern: /(제조|가공|공방|용접|도장|목공)/, item: "작업 설비를 들인다면 용도지역 제한과 소방 기준을 지자체에 확인" },
  { pattern: /(판매|상점|매장|팝업)/, item: "상시 판매를 한다면 사업자 등록과 업종 제한을 확인" },
];

export function paperChecklist(space: Space | null, request: SpaceRequest | null): string[] {
  const list = [
    "등기사항전부증명서로 소유자와 제한물권(근저당·가압류 등) 유무 확인",
    "건축물대장으로 실제 용도·면적이 등록 정보와 맞는지 확인",
  ];
  if (space?.buildingType && space.buildingType !== "단독주택") list.push(`${space.buildingType} 용도로 계속 쓸 수 있는지 용도지역·용도변경 필요 여부 확인`);
  if (space?.repairNeeds?.trim()) list.push("정비 전후 상태와 원상복구 범위를 사진으로 함께 기록");
  const purpose = `${request?.purpose || ""} ${request?.description || ""}`;
  for (const hint of PERMIT_HINTS) if (hint.pattern.test(purpose)) list.push(hint.item);
  list.push("합의 내용은 공동 문서에 적어 양측이 같은 내용을 보고 있는지 확인");
  return [...new Set(list)].slice(0, 7);
}

// 앞 단어의 받침 유무에 따라 조사를 고릅니다.
function josa(word: string, withBatchim: string, withoutBatchim: string) {
  const code = String(word).trim().slice(-1).charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return withoutBatchim;
  return (code - 0xac00) % 28 ? withBatchim : withoutBatchim;
}

export type Briefing = { reply: string; agenda: AgendaItem[]; checklist: string[]; nextSteps: string[] };

// 모델을 쓸 수 없을 때도 중개 진행이 멈추지 않도록 규칙만으로 브리핑을 만듭니다.
export function fallbackBriefing(agenda: AgendaItem[], checklist: string[], match: SpaceMatch | null, space: Space | null, request: SpaceRequest | null): Briefing {
  const open = agenda.filter((item) => item.status === "open");
  const discussing = agenda.filter((item) => item.status === "discussing");
  const agreed = agenda.filter((item) => item.status === "agreed");
  const price = match?.approvedPrice || space?.analysis?.estimatedPrice || "협의 중";

  const lines = [`지금까지 ${agreed.length}개 항목이 정리됐고 ${open.length}개가 남아 있습니다.`];
  if (agreed.length) lines.push(`정리된 항목은 ${agreed.map((item) => item.label).join(", ")}입니다.`);
  if (discussing.length) { const names = discussing.map((item) => item.label).join(", "); lines.push(`${names}${josa(names, "은", "는")} 이야기 중이니 숫자와 날짜로 못 박아주세요.`); }
  if (open.length) { const names = open.map((item) => item.label).join(", "); lines.push(`${names}${josa(names, "은", "는")} 아직 시작되지 않았습니다.`); }
  lines.push(`소유자가 제시한 이용료는 ${price}이고, 이용자의 희망 예산은 월 ${request?.maxBudget ?? "-"}만 원입니다.`);

  const nextSteps = [
    ...open.slice(0, 2).map((item) => `${item.label} 이야기를 시작해주세요.`),
    ...discussing.slice(0, 2).map((item) => `${item.label}${josa(item.label, "을", "를")} 구체적인 숫자나 날짜로 확정해주세요.`),
  ];
  if (!nextSteps.length) nextSteps.push("합의한 내용을 공동 문서에 옮겨 양측이 함께 확인해주세요.");

  return { reply: lines.join(" ").slice(0, 900), agenda, checklist, nextSteps: nextSteps.slice(0, 4) };
}
