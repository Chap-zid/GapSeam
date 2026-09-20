"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, CheckCircle2, Inbox, MapPin, MessageCircle, Plus, Ruler, Search, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { CountUp, MatchStatus, StatusBadge } from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { getSpace, respondToMatch, watchMatches, watchRequests } from "@/lib/services";
import type { Space, SpaceMatch, SpaceRequest } from "@/lib/types";

export default function SeekerDashboard() {
  const { user, ready } = useSession();
  const [requests, setRequests] = useState<SpaceRequest[]>([]);
  const [matches, setMatches] = useState<SpaceMatch[]>([]);
  const [spaces, setSpaces] = useState<Record<string, Space>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || user.role !== "seeker") return;
    const stopRequests = watchRequests(user.uid, setRequests);
    const stopMatches = watchMatches("seeker", user.uid, setMatches);
    return () => { stopRequests(); stopMatches(); };
  }, [user]);
  useEffect(() => { matches.forEach((match) => { if (!spaces[match.spaceId]) void getSpace(match.spaceId).then((space) => space && setSpaces((old) => ({ ...old, [match.spaceId]: space }))); }); }, [matches, spaces]);

  async function respond(id: string, status: "accepted" | "rejected") {
    if (busy) return;
    setBusy(id); setError("");
    try { await respondToMatch(id, status); }
    catch { setError("제안 응답을 저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요."); }
    finally { setBusy(""); }
  }

  if (!ready || !user) return <main className="page"><div className="shell">불러오는 중...</div></main>;
  const request = requests[0];
  const active = [...matches].reverse();

  return <main className="page"><div className="shell">
    <div className="dashboard-head reveal"><div><p className="eyebrow">공간 이용자</p><h1>안녕하세요, {user.name}님.</h1><p>도착한 제안과 내가 직접 보낸 공간 신청을 실시간으로 확인하세요.</p></div><div className="dashboard-actions"><Link href="/spaces" className="button secondary"><Search size={17}/> 공간 둘러보기</Link><Link href="/request/new" className="button"><Plus size={17}/> 공간 요청 등록</Link></div></div>
    <div className="dashboard-grid"><div style={{ display: "grid", gap: 20 }}>
      <section className="content-card"><div className="card-title"><h2>연결 현황</h2>{active.some((match) => match.status === "proposed") && <span className="status-badge proposed">새 제안</span>}</div><div className="card-pad">
        {active.length === 0 ? <div className="empty"><div className="empty-icon"><Inbox/></div><b>아직 연결 요청이 없습니다.</b><p>공간을 직접 둘러보고 신청하거나 소유자의 제안을 기다려보세요.</p><Link className="button small" href="/spaces">공개 공간 보기</Link></div> : active.map((match) => { const space = spaces[match.spaceId]; const incoming = match.status === "proposed" && match.initiator !== "seeker"; return <div className="dashboard-match" key={match.id}>
          {incoming && <div className="notice"><Bell/><div><b>새로운 공간 제안이 도착했습니다.</b><p>등록하신 조건과 높은 적합도를 가진 공간입니다.</p></div></div>}
          <article className="proposal"><Image className="proposal-image" width={900} height={500} src={space?.imageUrls?.[0] || "/images/space-hero.png"} alt="연결 공간"/><div className="proposal-body"><div className="proposal-top"><div><h3>{space?.address || "공간 정보를 불러오는 중"}</h3><span className="proposal-meta">{space?.buildingType || "공간"} · {space?.area || "-"}㎡</span></div><StatusBadge status={match.status}/></div><div className="meta-grid"><div className="meta-box"><span>예상 이용료</span><b>{match.approvedPrice || space?.analysis?.estimatedPrice || "협의"}</b></div><div className="meta-box"><span>추천 용도</span><b>{space?.analysis?.suggestedUses?.[0]?.name || "분석 중"}</b></div><div className="meta-box"><span>공간 적합도</span><b><CountUp value={match.score}/>%</b></div></div><div className="match-reason"><strong><CountUp value={match.score}/>% 적합</strong><span className="reason-lines">{match.reason}</span></div>
          {error && busy === match.id && <p className="login-error" role="alert">{error}</p>}
          {incoming ? <div className="proposal-actions"><button disabled={!!busy} className="button secondary" onClick={() => void respond(match.id, "rejected")}>거절</button><button disabled={!!busy} className="button" onClick={() => void respond(match.id, "accepted")}><CheckCircle2 size={18}/> 제안 수락</button></div> : match.status === "accepted" ? <><MatchStatus status={match.status}/><Link className="button full-button" href={`/matches/${match.id}`}><MessageCircle size={17}/> 채팅과 공동 문서</Link></> : <MatchStatus status={match.status}/>}</div></article>
        </div>; })}
      </div></section>
    </div><aside className="content-card"><div className="card-title"><h2>내 공간 요청</h2></div>{request ? <div className="card-pad"><span className="status-badge accepted">요청 중</span><h3 className="request-title">{request.purpose}</h3><p className="request-description">{request.description}</p><div className="request-condition-list"><div className="summary-item"><span><MapPin/>희망 지역</span><b>{request.region}</b></div><div className="summary-item"><span><Ruler/>최소 면적</span><b>{request.minArea}㎡ 이상</b></div><div className="summary-item"><span><Wallet/>최대 예산</span><b>월 {request.maxBudget}만 원 이하</b></div></div></div> : <div className="empty"><p>등록된 요청이 없습니다.</p><Link className="button small" href="/request/new">요청 등록하기</Link></div>}</aside></div>
  </div></main>;
}
