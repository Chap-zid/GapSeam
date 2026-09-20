"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { CountUp, MatchStatus, StatusBadge } from "@/components/ui";
import { getRequest, watchMatches, watchSpaces } from "@/lib/services";
import type { Space, SpaceMatch, SpaceRequest } from "@/lib/types";

export default function OwnerDashboard(){
  const {user,ready}=useSession(); const [spaces,setSpaces]=useState<Space[]>([]); const [matches,setMatches]=useState<SpaceMatch[]>([]); const [requests,setRequests]=useState<Record<string,SpaceRequest>>({});
  useEffect(()=>{if(!user||user.role!=='owner')return;const a=watchSpaces(user.uid,setSpaces);const b=watchMatches('owner',user.uid,setMatches);return()=>{a();b();};},[user]);
  useEffect(()=>{ matches.forEach((m)=>{ if(!requests[m.requestId]) getRequest(m.requestId).then((r)=>r&&setRequests((old)=>({...old,[m.requestId]:r}))); }); },[matches,requests]);
  if(!ready||!user)return <main className="page"><div className="shell">불러오는 중...</div></main>;
  return <main className="page"><div className="shell">
    <div className="dashboard-head reveal"><div><p className="eyebrow">공간 소유자</p><h1>안녕하세요, {user.name}님.</h1><p>등록한 공간과 이용자 연결 상태를 실시간으로 확인하세요.</p></div><Link href="/owner/new" className="button"><Plus size={17}/> 새 공간 등록</Link></div>
    <div className="dashboard-grid"><div style={{display:'grid',gap:20}}><section className="content-card"><div className="card-title"><h2>내 공간</h2><span style={{fontSize:13,color:'#737373'}}>총 {spaces.length}개</span></div><div className="card-pad">{spaces.length===0?<div className="empty"><div className="empty-icon"><Building2/></div><b>아직 등록한 공간이 없습니다.</b><p>공간을 등록하면 분석과 수요 탐색이 시작됩니다.</p><Link className="button small" href="/owner/new">첫 공간 등록하기</Link></div>:spaces.map((space)=><article className="proposal" key={space.id} style={{display:'grid',gridTemplateColumns:'190px 1fr',marginBottom:12}}><Image width={300} height={200} src={space.imageUrls?.[0]||'/images/space-hero.png'} alt="등록 공간" style={{width:'100%',height:'100%',minHeight:160,objectFit:'cover'}}/><div className="proposal-body"><div className="proposal-top"><div><h3>{space.address}</h3><span className="proposal-meta">{space.buildingType} · {space.area}㎡</span></div>{space.analysis&&<span className="status-badge accepted">분석 완료</span>}</div><p style={{color:'#737373',fontSize:13,margin:'14px 0'}}>{space.analysis?.condition||'공간 정보를 분석하고 있습니다.'}</p><Link href={`/agent/${space.id}`} style={{fontSize:14,fontWeight:750,color:'#a65e00'}}>분석 결과 보기 <ArrowRight size={14} style={{display:'inline'}}/></Link></div></article>)}</div></section></div>
      <aside className="content-card"><div className="card-title"><h2>연결 현황</h2>{matches[0]&&<StatusBadge status={matches[0].status}/>}</div><div className="card-pad">{matches.length===0?<div className="empty"><p>아직 보낸 연결 제안이 없습니다.</p></div>:matches.slice().reverse().map((match)=><div key={match.id} style={{marginBottom:16}}><h3 style={{margin:'0 0 6px'}}>{requests[match.requestId]?.seekerName||'이용자 정보를 불러오는 중'}</h3><p style={{margin:0,color:'#737373',fontSize:13}}>{requests[match.requestId]?.purpose||'등록된 공간 요청'}</p><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'18px 0 5px',fontSize:13}}><span>공간 적합도</span><b style={{fontSize:20,color:'#a65e00'}}><CountUp value={match.score}/>%</b></div><MatchStatus status={match.status}/></div>)}</div></aside>
    </div>
  </div></main>;
}
