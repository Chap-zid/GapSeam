"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, CheckCircle2, Inbox, MapPin, Plus, Ruler, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { CountUp, MatchStatus, StatusBadge } from "@/components/ui";
import { useSession } from "@/components/session-provider";
import { getSpace, respondToMatch, watchMatches, watchRequests } from "@/lib/services";
import type { Space, SpaceMatch, SpaceRequest } from "@/lib/types";

export default function SeekerDashboard(){
  const {user,ready}=useSession(); const [requests,setRequests]=useState<SpaceRequest[]>([]); const [matches,setMatches]=useState<SpaceMatch[]>([]); const [spaces,setSpaces]=useState<Record<string,Space>>({}); const [busy,setBusy]=useState(''); const [actionError,setActionError]=useState('');
  useEffect(()=>{ if(!user||user.role!=='seeker')return; const a=watchRequests(user.uid,setRequests); const b=watchMatches('seeker',user.uid,setMatches); return()=>{a();b();}; },[user]);
  useEffect(()=>{ matches.forEach((m)=>{ if(!spaces[m.spaceId]) getSpace(m.spaceId).then((s)=>s&&setSpaces((old)=>({...old,[m.spaceId]:s}))); }); },[matches,spaces]);
  async function respond(id:string,status:'accepted'|'rejected'){
    if(busy)return; setBusy(id); setActionError('');
    try { await respondToMatch(id,status); }
    catch { setActionError(status==='accepted'?'수락 처리에 실패했습니다. 연결 상태를 확인하고 다시 시도해주세요.':'거절 처리에 실패했습니다. 잠시 후 다시 시도해주세요.'); }
    finally { setBusy(''); }
  }
  if(!ready||!user) return <main className="page"><div className="shell">불러오는 중...</div></main>;
  const request=requests[0]; const active=[...matches].reverse();
  return <main className="page"><div className="shell">
    <div className="dashboard-head reveal"><div><p className="eyebrow">공간 이용자</p><h1>안녕하세요, {user.name}님.</h1><p>등록한 조건과 새로 도착한 공간 제안을 확인하세요.</p></div><Link href="/request/new" className="button"><Plus size={17}/> 공간 요청 등록</Link></div>
    <div className="dashboard-grid"><div style={{display:'grid',gap:20}}>
      <section className="content-card"><div className="card-title"><h2>새로운 공간 제안</h2>{active.some((m)=>m.status==='proposed')&&<span className="status-badge proposed">새 제안</span>}</div><div className="card-pad">
        {active.length===0?<div className="empty"><div className="empty-icon"><Inbox/></div><b>아직 도착한 제안이 없습니다.</b><p>조건에 맞는 공간이 등록되면 이곳에 바로 표시됩니다.</p></div>:active.map((match)=>{const space=spaces[match.spaceId];return <div key={match.id} style={{marginBottom:18}}>{match.status==='proposed'&&<div className="notice"><Bell/><div><b>새로운 공간 제안이 도착했습니다.</b><p>등록하신 조건과 높은 적합도를 가진 공간이에요.</p></div></div>}<article className="proposal"><Image className="proposal-image" width={900} height={500} src={space?.imageUrls?.[0]||'/images/space-hero.png'} alt="제안받은 공간"/><div className="proposal-body"><div className="proposal-top"><div><h3>{space?.address||'대전광역시 동구 ○○동'}</h3><span className="proposal-meta">{space?.buildingType||'단독주택'} · {space?.area||67}㎡</span></div><StatusBadge status={match.status}/></div><div className="meta-grid"><div className="meta-box"><span>소유자 확정 이용료</span><b>{match.approvedPrice||space?.analysis?.estimatedPrice||'협의'}</b></div><div className="meta-box"><span>추천 용도</span><b>{space?.analysis?.suggestedUses?.[0]?.name||'소규모 공방'}</b></div><div className="meta-box"><span>공간 적합도</span><b><CountUp value={match.score}/>%</b></div></div><div className="match-reason"><strong><CountUp value={match.score}/>% 적합</strong><span style={{whiteSpace:'pre-line',fontSize:13,color:'#5a5a5a',lineHeight:1.55}}>{match.reason}</span></div>{actionError&&<p className="login-error" role="alert">{actionError}</p>}{match.status==='proposed'?<div className="proposal-actions"><button disabled={!!busy} className="button secondary" onClick={()=>respond(match.id,'rejected')}>거절</button><button disabled={!!busy} className="button" onClick={()=>respond(match.id,'accepted')}><CheckCircle2 size={18}/> 수락</button></div>:<MatchStatus status={match.status}/>}</div></article></div>})}
      </div></section>
    </div><aside className="content-card"><div className="card-title"><h2>내 공간 요청</h2></div>{request?<div className="card-pad"><span className="status-badge accepted">요청 중</span><h3 style={{fontSize:21,margin:'14px 0 6px'}}>{request.purpose}</h3><p style={{fontSize:13,color:'#737373',lineHeight:1.6,margin:'0 0 20px'}}>{request.description}</p><div style={{display:'grid',gap:13}}><div className="summary-item"><span><MapPin size={13} style={{display:'inline',marginRight:4}}/>희망 지역</span><b>{request.region}</b></div><div className="summary-item"><span><Ruler size={13} style={{display:'inline',marginRight:4}}/>최소 면적</span><b>{request.minArea}㎡ 이상</b></div><div className="summary-item"><span><Wallet size={13} style={{display:'inline',marginRight:4}}/>최대 예산</span><b>월 {request.maxBudget}만 원 이하</b></div></div></div>:<div className="empty"><p>등록된 요청이 없습니다.</p><Link className="button small" href="/request/new">요청 등록하기</Link></div>}</aside></div>
  </div></main>;
}
