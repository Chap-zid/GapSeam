"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Building2, Check, CircleAlert, FileText, MapPin, MessageCircle, Ruler, Send, Wallet } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CountUp, StatusBadge } from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { applyToSpace, calculateMatch, getSpace, watchMatches, watchRequests } from "@/lib/services";
import type { Space, SpaceMatch, SpaceRequest } from "@/lib/types";

export default function SpaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useSession();
  const [space, setSpace] = useState<Space | null>(null);
  const [requests, setRequests] = useState<SpaceRequest[]>([]);
  const [matches, setMatches] = useState<SpaceMatch[]>([]);
  const [requestId, setRequestId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { void getSpace(id).then(setSpace).finally(() => setLoading(false)); }, [id]);
  useEffect(() => {
    if (!user || user.role !== "seeker") return;
    const stopRequests = watchRequests(user.uid, (items) => { setRequests(items); setRequestId((current) => current || items[0]?.id || ""); });
    const stopMatches = watchMatches("seeker", user.uid, setMatches);
    return () => { stopRequests(); stopMatches(); };
  }, [user]);

  const selectedRequest = requests.find((request) => request.id === requestId) || null;
  const result = useMemo(() => space && selectedRequest ? calculateMatch(space, selectedRequest) : null, [space, selectedRequest]);
  const existing = matches.find((match) => match.spaceId === id && match.requestId === requestId);

  async function apply() {
    if (!space || !selectedRequest || !result || busy) return;
    setBusy(true); setError("");
    try { await applyToSpace(space, selectedRequest, result); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "공간 이용 신청을 보내지 못했습니다."); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="page"><div className="shell market-empty"><span className="session-loader"/><p>공간 정보를 불러오고 있습니다.</p></div></main>;
  if (!space) return <main className="page"><div className="shell market-empty"><Building2/><b>공간을 찾을 수 없습니다.</b><Link className="button small" href="/spaces">공간 목록으로</Link></div></main>;

  return <main className="page"><div className="shell">
    <Link className="market-back" href="/spaces"><ArrowLeft size={16}/> 전체 공간</Link>
    <section className="space-detail-hero reveal"><div className="space-detail-photo"><Image src={space.imageUrls?.[0] || "/images/space-hero.png"} width={1100} height={720} priority alt={`${space.address} 공간`}/></div><div className="space-detail-summary"><p className="eyebrow">{space.region} · {space.currentStatus}</p><h1>{space.address}</h1><p>{space.description || "등록된 공간의 활용 가능성을 확인해보세요."}</p><div className="space-facts"><div><Building2/><span>건물 유형<b>{space.buildingType}</b></span></div><div><Ruler/><span>전용 면적<b>{space.area}㎡</b></span></div><div><Wallet/><span>예상 이용료<b>{space.analysis?.estimatedPrice || "분석 중"}</b></span></div></div>{space.facilities?.length ? <div className="space-use-chips">{space.facilities.map((item) => <span key={item}>{item}</span>)}</div> : null}</div></section>

    <div className="space-detail-grid"><div className="space-detail-main">
      <section className="content-card"><div className="card-title"><h2>공간 분석 결과</h2><span className="status-badge accepted">참고용 분석</span></div><div className="card-pad"><p className="space-analysis-copy">{space.analysis?.condition || "아직 공간 상태를 분석하고 있습니다."}</p><div className="analysis-facts"><div><MapPin/><span>주변 환경<b>{space.analysis?.surroundingEnvironment || "확인 중"}</b></span></div><div><FileText/><span>예상 정비비<b>{space.analysis?.estimatedRepairCost || "확인 중"}</b></span></div></div></div></section>
      <section className="content-card"><div className="card-title"><h2>추천 활용</h2></div><div className="card-pad use-list">{(space.analysis?.suggestedUses || []).map((use, index) => <div className="use-card" key={use.name}><span className="use-rank">{index + 1}</span><div><h3>{use.name}</h3><p>{use.reasons.join(" · ")}</p></div><div className="score">{use.score}<small>%</small></div></div>)}</div></section>
    </div><aside className="content-card application-card"><div className="card-title"><h2>이 공간에 신청하기</h2></div><div className="card-pad">
      {!ready ? <p className="muted-copy">로그인 상태를 확인하고 있습니다.</p> : !user ? <><p className="muted-copy">로그인하면 내 공간 요청과 이 공간의 적합도를 계산하고 소유자에게 직접 신청할 수 있습니다.</p><Link className="button full-button" href={`/login?role=seeker&next=${encodeURIComponent(`/spaces/${id}`)}`}>로그인하고 적합도 확인</Link></> : user.role !== "seeker" ? <><p className="muted-copy">공간 요청을 등록한 이용자 역할에서 신청할 수 있습니다. 공간 목록은 누구나 계속 볼 수 있습니다.</p><Link className="button full-button" href={`/mypage?next=${encodeURIComponent(`/spaces/${id}`)}`}>마이페이지에서 역할 전환</Link></> : requests.length === 0 ? <><p className="muted-copy">신청에 사용할 공간 수요를 먼저 등록해주세요.</p><Link className="button full-button" href="/request/new">공간 수요 등록하기</Link></> : <>
        <label className="application-select"><span>비교할 내 공간 요청</span><select value={requestId} onChange={(event) => setRequestId(event.target.value)}>{requests.map((request) => <option value={request.id} key={request.id}>{request.purpose} · {request.region}</option>)}</select></label>
        {result && <div className="fit-summary"><div className="fit-score"><span><CountUp value={result.score}/><small>점</small></span><div><b>{result.fitLevel === "high" ? "매우 높은 적합도" : result.fitLevel === "good" ? "높은 적합도" : result.fitLevel === "possible" ? "조건 확인 필요" : "적합도 낮음"}</b><small>퍼지 다기준 적합도 · v2</small></div></div><div className="fit-bars">{result.factors.map((factor) => <div key={factor.key}><span>{factor.label}<b>{factor.points}/{factor.max}</b></span><i><em style={{width:`${factor.membership * 100}%`}}/></i><small>{factor.summary}</small></div>)}</div>{result.warnings.length > 0 && <div className="fit-warning"><CircleAlert size={16}/><span>{result.warnings.join(" ")}</span></div>}</div>}
        {error && <p className="login-error" role="alert">{error}</p>}
        {existing ? <div className="application-result"><StatusBadge status={existing.status}/>{existing.status === "accepted" ? <><p>매칭이 성사되었습니다. 전용 채팅방에서 조건을 조율하세요.</p><Link className="button full-button" href={`/matches/${existing.id}`}><MessageCircle size={17}/> 채팅 시작</Link></> : <p>{existing.status === "applied" ? "소유자가 신청 내용을 검토하고 있습니다." : existing.status === "proposed" ? "소유자가 먼저 제안을 보냈습니다. 이용자 대시보드에서 응답해주세요." : "이 연결 요청은 종료되었습니다."}</p>}</div> : <button className="button full-button" disabled={busy || !result} onClick={() => void apply()}><Send size={17}/>{busy ? "신청을 보내는 중..." : "소유자에게 이용 신청"}</button>}
        <p className="application-note"><Check size={13}/> 신청만으로 계약이 체결되지 않으며, 상대방이 수락해야 채팅이 열립니다.</p>
      </>}
    </div></aside></div>
  </div></main>;
}
