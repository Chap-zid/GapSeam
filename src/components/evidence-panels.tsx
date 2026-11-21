import { Database, ExternalLink, Info } from "lucide-react";
import { formatManwon, type EvidenceItem, type PriceEvidence } from "@/lib/evidence";
import type { Analysis, SuggestedUse } from "@/lib/types";

const won = (value?: number) => (value === undefined ? "-" : `${Math.round(value).toLocaleString("ko-KR")}원`);

// 추천 용도 한 개에 연결된 근거를 보여줍니다. 근거 ID는 서버가 실제로 제공한 데이터만 남긴 것입니다.
export function UseEvidence({ use, evidence }: { use: SuggestedUse; evidence?: EvidenceItem[] }) {
  if (!evidence) return null; // 근거 기능 이전에 분석한 공간입니다.
  const linked = (use.evidenceIds || []).flatMap((id) => evidence.filter((item) => item.id === id));
  return <div className="evidence-chips">
    {linked.map((item) => <span key={item.id} className={`evidence-chip ${item.kind}`} title={`출처: ${item.source}`}><b>{item.id}</b>{item.label}</span>)}
    {!!use.unverifiedNumbers?.length && <span className="evidence-chip unverified" title="근거 데이터와 입력 정보에서 찾지 못한 숫자입니다.">수치 확인 필요: {use.unverifiedNumbers.join(", ")}</span>}
  </div>;
}

function PeriodLine({ evidence }: { evidence: PriceEvidence }) {
  if (!evidence.period) return null;
  const band = evidence.areaBand ? evidence.areaBand.relaxed ? "비슷한 면적이 부족해 시군구 전체 월세 계약 사용" : `면적 ${evidence.areaBand.min}~${evidence.areaBand.max}㎡ 월세 계약` : "";
  return <p className="evidence-meta">{evidence.regionName} · {evidence.dataset} · {evidence.period.from}~{evidence.period.to}{band ? ` · ${band}` : ""}</p>;
}

// 이용료가 실거래가로 계산됐는지, 왜 계산하지 못했는지와 비교 사례를 함께 보여줍니다.
export function PriceEvidencePanel({ analysis }: { analysis: Analysis }) {
  const evidence = analysis.priceEvidence;
  if (!evidence) {
    return <p className="evidence-note"><Info size={13}/> 이 분석은 실거래가 근거 기능 이전에 만들어진 AI 참고 추정입니다. 다시 분석하면 실거래 근거를 함께 확인합니다.</p>;
  }
  const sale = evidence.sale;
  return <div className="price-evidence">
    {evidence.status === "ok" && evidence.perSqmMonthlyWon ? <>
      <p className="evidence-title"><Database size={14}/> 실거래가로 계산한 이용료</p>
      <PeriodLine evidence={evidence}/>
      <ul className="evidence-stats">
        <li><span>비교 계약</span><b>{evidence.sampleSize}건</b></li>
        <li><span>㎡당 월세(1사분위~3사분위)</span><b>{won(evidence.perSqmMonthlyWon.q1)}~{won(evidence.perSqmMonthlyWon.q3)}</b></li>
        <li><span>㎡당 월세 중앙값</span><b>{won(evidence.perSqmMonthlyWon.median)}</b></li>
        <li><span>보증금 중앙값</span><b>{formatManwon(evidence.depositMedianManwon || 0)}</b></li>
      </ul>
      {!!evidence.comparables?.length && <div className="evidence-table-wrap"><table className="evidence-table"><caption>면적이 가장 비슷한 실거래 사례</caption><thead><tr><th>계약월</th><th>법정동</th><th>면적</th><th>보증금</th><th>월세</th><th>건축연도</th></tr></thead><tbody>
        {evidence.comparables.map((deal, index) => <tr key={`${deal.ym}-${deal.dong}-${index}`}><td>{deal.ym}</td><td>{deal.dong || "-"}</td><td>{deal.area}㎡</td><td>{formatManwon(deal.deposit || 0)}</td><td>{deal.monthly}만 원</td><td>{deal.buildYear || "-"}</td></tr>)}
      </tbody></table></div>}
      {evidence.method && <p className="evidence-note"><Info size={13}/> 계산 방법: {evidence.method} 정비비는 공개된 실거래 자료가 없어 AI가 사진과 입력 정보로 추정한 값이고, 회수기간은 그 정비비를 실거래 월세 중앙값으로 나눈 값입니다.</p>}
    </> : <p className="evidence-note warn"><Info size={13}/> 실거래 근거 없음: {evidence.reason} 화면의 금액은 AI가 입력 정보로 추정한 참고값입니다.</p>}
    {sale && <p className="evidence-note"><Database size={13}/> 같은 시군구 {sale.dataset} {sale.sampleSize}건 기준 ㎡당 {sale.perSqmManwon.median.toLocaleString("ko-KR")}만 원(중앙값) → 이 면적이면 {formatManwon(sale.estimateManwon.low)}~{formatManwon(sale.estimateManwon.high)} 수준입니다. 매매 참고용이며 임대 가능 여부와는 별개입니다.</p>}
    <p className="evidence-source"><ExternalLink size={12}/> 출처: {evidence.source}</p>
  </div>;
}

// 반경 상권 조회 결과(또는 조회하지 못한 이유)를 한 줄로 보여줍니다.
export function CommerceNote({ analysis }: { analysis: Analysis }) {
  const commerce = analysis.commerceEvidence;
  if (!commerce) return null;
  if (commerce.status !== "ok") return <p className="evidence-note warn"><Info size={13}/> 상권 근거 없음: {commerce.reason}</p>;
  return <p className="evidence-note"><Database size={13}/> 반경 {commerce.radiusMeters}m 상가 {commerce.total}곳{commerce.baseMonth ? `(${commerce.baseMonth} 기준)` : ""} · 많은 업종: {(commerce.topMinors || []).slice(0, 3).map((item) => `${item.name} ${item.count}곳`).join(", ") || "없음"} · 출처: {commerce.source}</p>;
}
