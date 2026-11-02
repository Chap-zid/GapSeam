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

export type RoadmapStatus = "done" | "current" | "upcoming";
export type RoadmapStage = { key: string; label: string; detail: string; status: RoadmapStatus };

// 협의가 어디까지 왔는지 단계로 보여줍니다. 계약 자체는 전문가에게 넘기는 마지막 단계로만 둡니다.
export function buildRoadmap(agenda: AgendaItem[], hasDocument: boolean): RoadmapStage[] {
  const agreed = (key: AgendaKey) => agenda.find((item) => item.key === key)?.status === "agreed";
  const stages = [
    { key: "visit", label: "현장 방문", detail: "조건을 정하기 전에 공간을 함께 보고 상태를 확인합니다.", done: agreed("schedule") },
    { key: "terms", label: "핵심 조건 합의", detail: "이용료·기간·이용 범위·정비 분담을 숫자와 날짜로 정합니다.", done: (["price", "period", "usage", "repair"] as AgendaKey[]).every(agreed) },
    { key: "papers", label: "서류 확인", detail: "등기사항증명서·건축물대장을 누가 언제까지 확인할지 정합니다.", done: agreed("papers") },
    { key: "document", label: "공동 문서 정리", detail: "합의한 내용을 공동 문서에 옮겨 양측이 같은 내용을 확인합니다.", done: hasDocument },
    { key: "contract", label: "전문가 확인 후 계약", detail: "계약서는 공인중개사·법무사 등 전문가와 함께 작성합니다.", done: false },
  ];
  const current = stages.findIndex((stage) => !stage.done);
  return stages.map((stage, index) => ({ key: stage.key, label: stage.label, detail: stage.detail, status: stage.done ? "done" : index === current ? "current" : "upcoming" }));
}

export type Direction = { key: AgendaKey; label: string; status: AgendaStatus; text: string };

// "월 35~45만 원", "월 40만 원" 같은 이용료 표기에서 월 금액 범위(만 원)를 읽습니다.
function monthlyPrice(text?: string) {
  const value = String(text || "").replace(/,/g, "");
  const found = value.match(/월\s*(\d+(?:\.\d+)?)(?:\s*[~\-–]\s*(\d+(?:\.\d+)?))?\s*만/) || value.match(/(\d+(?:\.\d+)?)(?:\s*[~\-–]\s*(\d+(?:\.\d+)?))?\s*만/);
  if (!found) return null;
  const min = Number(found[1]); const max = Number(found[2] || found[1]);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

function priceDirection(match: SpaceMatch | null, space: Space | null, request: SpaceRequest | null) {
  const label = match?.approvedPrice || space?.analysis?.estimatedPrice || "";
  const price = monthlyPrice(label); const budget = Number(request?.maxBudget) || 0;
  if (!price || !budget) return "소유자가 정한 이용료와 이용자 예산을 같은 기준(월 금액)으로 먼저 적어주세요. 그다음 관리비·공과금 포함 여부를 정하면 됩니다.";
  if (price.max <= budget) return `제시 이용료(${label})가 이용자 예산(월 ${budget}만 원) 안에 있습니다. 금액보다 관리비·공과금 포함 여부와 보증금 유무를 먼저 정하면 빠르게 합의할 수 있습니다.`;
  if (price.min > budget) return `제시 이용료가 예산보다 월 ${Math.round((price.min - budget) * 10) / 10}만 원 높습니다. 이용자가 정비 일부를 맡는 대신 이용료를 낮추거나, 첫 몇 개월을 감면한 뒤 조정하는 안을 함께 검토해보세요.`;
  return `이용자 예산(월 ${budget}만 원)이 제시 범위(${label}) 안에 걸쳐 있습니다. 범위 아래쪽 금액에서 시작해 관리비 포함 여부로 조정해보세요.`;
}

function periodDirection(request: SpaceRequest | null) {
  if (request?.period === "1년 이상") return "이용자는 1년 이상을 희망합니다. 처음 6개월을 시범 기간으로 두고 연장 조건(알리는 시점, 이용료 조정)을 미리 정하면 양측 부담이 줄어듭니다.";
  if (request?.period === "6개월~1년") return "6개월~1년 이용을 희망합니다. 시작일과 종료일, 연장 의사를 알리는 시점을 날짜로 적어주세요.";
  if (request?.period === "6개월 미만") return "단기 이용입니다. 정비 비용 부담과 원상복구 범위를 기간과 함께 정해야 어느 한쪽이 손해 보지 않습니다.";
  return "시작일과 종료일을 날짜로 정하고, 연장할 때 몇 주 전에 알릴지 함께 정해주세요.";
}

function usageDirection(space: Space | null, request: SpaceRequest | null) {
  const purpose = request?.purpose?.trim() || "";
  const uses = (space?.analysis?.suggestedUses || []).map((use) => use.name);
  if (!purpose || !uses.length) return "어떤 활동을 언제, 몇 명이 할지 적고 소음·냄새·방문객처럼 이웃에 영향을 주는 부분부터 맞춰주세요.";
  const words = purpose.split(/\s+/).filter((word) => word.length >= 2);
  const fit = uses.find((use) => words.some((word) => use.includes(word)) || use.split(/\s+/).some((word) => word.length >= 2 && purpose.includes(word)));
  if (fit) return `희망 용도(${purpose})가 분석 추천 용도(${fit})와 맞습니다. 사용 시간대, 소음, 방문객 수 정도만 정하면 됩니다.`;
  return `희망 용도(${purpose})가 분석 추천 용도(${uses.slice(0, 2).join(", ")})와 다릅니다. 용도지역·용도변경 필요 여부를 먼저 확인한 뒤 사용 범위를 정해주세요.`;
}

function repairDirection(space: Space | null) {
  const cost = space?.analysis?.estimatedRepairCost ? `예상 정비비는 ${space.analysis.estimatedRepairCost}입니다. ` : "";
  const known = space?.repairNeeds?.trim() ? `알려진 수리 필요사항(${space.repairNeeds.trim().slice(0, 40)})부터 누가 맡을지 정하고, ` : "";
  return `${cost}${known}구조·안전(누수, 전기, 지붕)은 소유자가, 인테리어·집기는 이용자가 맡고 원상복구 범위를 사진으로 남기는 방식으로 나눠보세요.`;
}

const DIRECTION_ORDER: AgendaKey[] = ["schedule", "price", "period", "usage", "repair", "papers"];

// 아직 정리되지 않은 항목마다 "어떻게 정하면 좋을지" 방향을 제안합니다. 규칙 기반이며 결정은 당사자가 합니다.
export function recommendDirections(agenda: AgendaItem[], match: SpaceMatch | null, space: Space | null, request: SpaceRequest | null): Direction[] {
  const base: Record<AgendaKey, () => string> = {
    schedule: () => "조건을 확정하기 전에 현장을 먼저 함께 보는 것이 좋습니다. 가능한 날짜를 2~3개씩 제안해 하나를 고르세요.",
    price: () => priceDirection(match, space, request),
    period: () => periodDirection(request),
    usage: () => usageDirection(space, request),
    repair: () => repairDirection(space),
    papers: () => "등기사항전부증명서는 인터넷등기소, 건축물대장은 정부24에서 발급할 수 있습니다. 누가 언제까지 발급해 공유할지 정해주세요.",
  };
  return DIRECTION_ORDER.flatMap((key) => {
    const item = agenda.find((entry) => entry.key === key);
    if (!item || item.status === "agreed") return [];
    return [{ key, label: item.label, status: item.status, text: base[key]() }];
  });
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
export function fallbackBriefing(agenda: AgendaItem[], checklist: string[], match: SpaceMatch | null, space: Space | null, request: SpaceRequest | null, hasDocument = false): Briefing {
  const open = agenda.filter((item) => item.status === "open");
  const discussing = agenda.filter((item) => item.status === "discussing");
  const agreed = agenda.filter((item) => item.status === "agreed");
  const stage = buildRoadmap(agenda, hasDocument).find((item) => item.status === "current");
  const direction = recommendDirections(agenda, match, space, request)[0];

  const lines = [`지금까지 ${agreed.length}개 항목이 정리됐고 ${open.length}개가 남아 있습니다.`];
  if (stage) lines.push(`지금은 '${stage.label}' 단계입니다.`);
  if (agreed.length) lines.push(`정리된 항목은 ${agreed.map((item) => item.label).join(", ")}입니다.`);
  if (discussing.length) { const names = discussing.map((item) => item.label).join(", "); lines.push(`${names}${josa(names, "은", "는")} 이야기 중이니 숫자와 날짜로 못 박아주세요.`); }
  if (direction) lines.push(`먼저 ${direction.label}부터 정해보시길 권합니다. ${direction.text}`);
  else lines.push("모든 항목이 정리됐습니다. 합의한 내용을 공동 문서에 옮기고, 계약서는 전문가와 함께 작성해주세요.");

  const nextSteps = [
    ...open.slice(0, 2).map((item) => `${item.label} 이야기를 시작해주세요.`),
    ...discussing.slice(0, 2).map((item) => `${item.label}${josa(item.label, "을", "를")} 구체적인 숫자나 날짜로 확정해주세요.`),
  ];
  if (!nextSteps.length) nextSteps.push("합의한 내용을 공동 문서에 옮겨 양측이 함께 확인해주세요.");

  return { reply: lines.join(" ").slice(0, 900), agenda, checklist, nextSteps: nextSteps.slice(0, 4) };
}
