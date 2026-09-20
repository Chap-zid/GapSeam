"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowUpRight, Building2, Check, ClipboardList, LogOut, Users } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { watchMatches, watchRequests, watchSpaces } from "@/lib/services";
import type { Role, Space, SpaceMatch, SpaceRequest } from "@/lib/types";
import { afterLogin } from "@/lib/navigation";

function MyPage() {
  const { user, chooseRole, logout } = useSession();
  const router = useRouter(); const params = useSearchParams();
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const [spaces,setSpaces]=useState<Space[]>([]); const [requests,setRequests]=useState<SpaceRequest[]>([]); const [matches,setMatches]=useState<SpaceMatch[]>([]);
  useEffect(()=>{
    if(!user)return;
    const stops=[watchSpaces(user.uid,setSpaces),watchRequests(user.uid,setRequests),watchMatches(user.role,user.uid,setMatches)];
    return()=>stops.forEach(stop=>stop());
  },[user]);
  if(!user)return null;
  async function changeRole(role:Role) {
    setBusy(true);setError("");
    try {
      await chooseRole(role);
      router.replace(afterLogin(role,params.get("next")));
    } catch {setError("역할을 변경하지 못했습니다. 잠시 후 다시 시도해주세요.");} finally {setBusy(false);}
  }
  async function leave() {
    setBusy(true);setError("");
    try {await logout();router.replace("/");} catch {setError("로그아웃에 실패했습니다. 다시 시도해주세요.");setBusy(false);}
  }
  return <main className="page mypage"><div className="shell">
    <div className="page-head"><p className="eyebrow">MY SPACE EUM</p><h1>마이페이지</h1><p>나의 계정과 공간의 다음 이야기를 관리하세요.</p></div>
    <section className="profile-banner"><div className="profile-avatar">{user.name.slice(0,1)}</div><div><span className="profile-tag">Google 계정으로 로그인됨</span><h2>{user.name}님</h2><p>{user.email || "Google 연결 계정"}</p></div><Link href={"/"+user.role+"/dashboard"} className="button secondary">내 활동 보기 <ArrowUpRight size={17}/></Link></section>
    <div className="account-stats"><Link href="/owner/dashboard"><Building2/><span>등록한 공간<b>{spaces.length}<small>개</small></b></span><ArrowUpRight size={18}/></Link><Link href="/seeker/dashboard"><ClipboardList/><span>등록한 요청<b>{requests.length}<small>개</small></b></span><ArrowUpRight size={18}/></Link><Link href={"/"+user.role+"/dashboard"}><Users/><span>현재 역할의 성사된 연결<b>{matches.filter(m=>m.status==="accepted").length}<small>건</small></b></span><ArrowUpRight size={18}/></Link></div>
    <div className="account-settings"><section><p className="eyebrow">이용 설정</p><h2>지금 어떤 공간을<br/>이어볼까요?</h2><p>계정은 하나, 역할은 자유롭게.<br/>전환해도 등록한 공간과 요청은 유지됩니다.</p></section><div className="account-options">{([{role:"owner",title:"공간 소유자",description:"내 공간을 등록하고, 활용 방법과 이용자를 찾아요.",Icon:Building2},{role:"seeker",title:"공간 이용자",description:"필요한 조건을 등록하고, 공간 제안을 받아요.",Icon:Users}] as const).map(({role,title,description,Icon})=><button className={"account-role "+(user.role===role?"selected":"")} key={role} disabled={busy||user.role===role} onClick={()=>changeRole(role)}><Icon/><span><b>{title}</b><small>{description}</small></span>{user.role===role?<span className="current-role"><Check size={14}/> 이용 중</span>:<ArrowUpRight size={18}/>}</button>)}</div></div>
    {error&&<p className="login-error" role="alert">{error}</p>}
    <div className="logout-row"><div><b>계정에서 로그아웃</b><p>활동 내역은 계정에 안전하게 보관됩니다.</p></div><button className="button secondary" disabled={busy} onClick={leave}><LogOut size={17}/>{busy?"처리 중…":"로그아웃"}</button></div>
  </div></main>;
}
export default function MyPageRoute(){return <Suspense><MyPage/></Suspense>;}
