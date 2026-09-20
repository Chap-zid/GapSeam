"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bell, Building2, CheckCircle2, MessageCircle, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { CountUp, MatchStatus, StatusBadge } from "@/components/ui";
import { getRequest, respondToMatch, watchMatches, watchSpaces } from "@/lib/services";
import type { Space, SpaceMatch, SpaceRequest } from "@/lib/types";

export default function OwnerDashboard() {
  const { user, ready } = useSession();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [matches, setMatches] = useState<SpaceMatch[]>([]);
  const [requests, setRequests] = useState<Record<string, SpaceRequest>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || user.role !== "owner") return;
    const stopSpaces = watchSpaces(user.uid, setSpaces);
    const stopMatches = watchMatches("owner", user.uid, setMatches);
    return () => { stopSpaces(); stopMatches(); };
  }, [user]);
  useEffect(() => { matches.forEach((match) => { if (!requests[match.requestId]) void getRequest(match.requestId).then((request) => request && setRequests((old) => ({ ...old, [match.requestId]: request }))); }); }, [matches, requests]);

  async function respond(id: string, status: "accepted" | "rejected") {
    if (busy) return;
    setBusy(id); setError("");
    try { await respondToMatch(id, status); }
    catch { setError("신청 응답을 저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요."); }
    finally { setBusy(""); }
  }

  if (!ready || !user) return <main className="page"><div className="shell">불러오는 중...</div></main>;
  const active = [...matches].reverse();

  return <main className="page"><div className="shell">
    <div className="dashboard-head reveal"><div><p className="eyebrow">공간 소유자</p><h1>안녕하세요, {user.name}님.</h1><p>이용자가 직접 보낸 신청과 내가 보낸 제안의 상태를 한곳에서 확인하세요.</p></div><Link href="/owner/new" className="button"><Plus size={17}/> 새 공간 등록</Link></div>
    <div className="dashboard-grid"><div style={{ display: "grid", gap: 20 }}><section className="content-card"><div className="card-title"><h2>내 공간</h2><span style={{ fontSize: 13, color: "#737373" }}>총 {spaces.length}개</span></div><div className="card-pad">{spaces.length === 0 ? <div className="empty"><div className="empty-icon"><Building2/></div><b>아직 등록한 공간이 없습니다.</b><p>공간을 등록하면 분석과 수요 탐색이 시작됩니다.</p><Link className="button small" href="/owner/new">첫 공간 등록하기</Link></div> : spaces.map((space) => <article className="proposal owner-space-row" key={space.id}><Image width={300} height={200} src={space.imageUrls?.[0] || "/images/space-hero.png"} alt="등록 공간"/><div className="proposal-body"><div className="proposal-top"><div><h3>{space.address}</h3><span className="proposal-meta">{space.buildingType} · {space.area}㎡</span></div>{space.analysis && <span className="status-badge accepted">분석 완료</span>}</div><p>{space.analysis?.condition || "공간 정보를 분석하고 있습니다."}</p><div className="inline-links"><Link href={`/agent/${space.id}`}>분석·수요 결과 <ArrowRight size={14}/></Link><Link href={`/spaces/${space.id}`}>공개 페이지 <ArrowRight size={14}/></Link></div></div></article>)}</div></section></div>
      <aside className="content-card"><div className="card-title"><h2>연결 현황</h2>{active.some((match) => match.status === "applied") && <span className="status-badge applied">새 신청</span>}</div><div className="card-pad">{active.length === 0 ? <div className="empty"><p>아직 연결 요청이 없습니다.</p><p>이용자는 공개 공간 목록에서 직접 신청할 수 있습니다.</p></div> : active.map((match) => { const request = requests[match.requestId]; const incoming = match.status === "applied"; return <div className="dashboard-match" key={match.id}>
        {incoming && <div className="notice compact"><Bell/><div><b>새로운 공간 이용 신청이 도착했습니다.</b><p>조건과 적합도 근거를 확인한 뒤 결정해주세요.</p></div></div>}
        <div className="proposal-top"><div><h3>{request?.seekerName || "이용자 정보를 불러오는 중"}</h3><p>{request?.purpose || "등록된 공간 요청"}</p></div><StatusBadge status={match.status}/></div>
        <div className="match-mini-score"><span>수요–공간 적합도</span><b><CountUp value={match.score}/>%</b></div>
        <p className="dashboard-match-reason">{match.reason}</p>
        {error && busy === match.id && <p className="login-error" role="alert">{error}</p>}
        {incoming ? <div className="proposal-actions"><button className="button secondary" disabled={!!busy} onClick={() => void respond(match.id, "rejected")}><X size={17}/> 거절</button><button className="button" disabled={!!busy} onClick={() => void respond(match.id, "accepted")}><CheckCircle2 size={17}/> 신청 수락</button></div> : match.status === "accepted" ? <><MatchStatus status={match.status}/><Link className="button full-button" href={`/matches/${match.id}`}><MessageCircle size={17}/> 채팅과 공동 문서</Link></> : <MatchStatus status={match.status}/>} {/* 상태별 동작 */}
      </div>; })}</div></aside>
    </div>
  </div></main>;
}
