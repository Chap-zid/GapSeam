"use client";

import { Check, FileText } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentAssistant } from "@/components/agent-assistant";
import { useSession } from "@/components/session-provider";
import { PERIODS, type AssistFields } from "@/lib/assist";
import { saveRequest } from "@/lib/services";

type RequestForm = { purpose: string; description: string; region: string; minArea: string; maxArea: string; maxBudget: string; people: string; period: string };
const EMPTY: RequestForm = { purpose: "", description: "", region: "", minArea: "", maxArea: "", maxBudget: "", people: "", period: "" };

export default function RequestFormPage() {
  const router = useRouter(); const { user } = useSession(); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const [form,setForm]=useState<RequestForm>(EMPTY); const [flash,setFlash]=useState<Record<string,boolean>>({}); const timers=useRef<number[]>([]);
  // 에이전트가 채운 항목은 잠시 강조해서 어떤 값이 바뀌었는지 보이게 합니다.
  const fill=useCallback((field:keyof AssistFields,value:AssistFields[keyof AssistFields])=>{ setForm((old)=>({...old,[field]:Array.isArray(value)?value.join(", "):String(value)}) as RequestForm); setFlash((old)=>({...old,[field]:true})); timers.current.push(window.setTimeout(()=>setFlash((old)=>({...old,[field]:false})),1100)); },[]);
  useEffect(()=>()=>{ timers.current.forEach((timer)=>window.clearTimeout(timer)); },[]);
  const set=<K extends keyof RequestForm>(field:K,value:RequestForm[K])=>setForm((old)=>({...old,[field]:value}));
  const cls=(field:string)=>`field${flash[field]?' field-flash':''}`;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(!user||user.role!=='seeker')return;
    const minArea=Number(form.minArea); const maxBudget=Number(form.maxBudget);
    if(!form.purpose.trim()||!form.region.trim()||!Number.isFinite(minArea)||minArea<=0||!Number.isFinite(maxBudget)||maxBudget<=0){ setError("활용 목적, 희망 지역, 최소 면적, 월 최대 예산은 반드시 입력해주세요."); return; }
    setSaving(true); setError("");
    try { await saveRequest({ seekerId:user.uid, seekerName:user.name, purpose:form.purpose.trim(), description:form.description.trim(), region:form.region.trim(), minArea, maxArea:Number(form.maxArea)||0, maxBudget, people:Number(form.people)||1, period:form.period||'1년 이상' });
      router.push('/seeker/dashboard?created=1'); }
    catch {setError("요청을 저장하지 못했습니다. 입력 내용은 유지되니 다시 시도해주세요."); setSaving(false);}
  }
  return <main className="page"><div className="shell">
    <div className="page-head reveal"><p className="eyebrow">공간 수요 등록</p><h1>필요한 공간을 알려주세요</h1><p>직접 입력하셔도 되고, 오른쪽 에이전트에게 말로 설명하셔도 됩니다.</p></div>
    <form className="form-layout" onSubmit={submit}><div className="form-card reveal">
      <section className="form-section"><h2>어떤 공간이 필요한가요?</h2><div className="form-grid">
        <div className={`${cls('purpose')} full`}><label>공간 활용 목적 <span className="required">*</span></label><input name="purpose" value={form.purpose} onChange={(e)=>set('purpose',e.target.value)} placeholder="예: 도자기 공방" required/></div>
        <div className={`${cls('description')} full`}><label>필요한 공간 설명</label><textarea name="description" value={form.description} onChange={(e)=>set('description',e.target.value)} placeholder="예: 4명이 사용할 도자기 공방을 찾고 있습니다. 작업과 소규모 클래스를 함께 진행할 예정입니다."/></div>
      </div></section>
      <section className="form-section"><h2>희망 조건</h2><div className="form-grid">
        <div className={`${cls('region')} full`}><label>희망 지역 <span className="required">*</span></label><input name="region" value={form.region} onChange={(e)=>set('region',e.target.value)} placeholder="예: 대전 동구" required/></div>
        <div className={cls('minArea')}><label>최소 면적 <span className="required">*</span></label><input name="minArea" type="number" min="1" value={form.minArea} onChange={(e)=>set('minArea',e.target.value)} placeholder="예: 50" required/><p className="help">단위: ㎡</p></div>
        <div className={cls('maxArea')}><label>최대 면적</label><input name="maxArea" type="number" min="1" value={form.maxArea} onChange={(e)=>set('maxArea',e.target.value)} placeholder="예: 80"/><p className="help">단위: ㎡</p></div>
        <div className={cls('maxBudget')}><label>월 최대 예산 <span className="required">*</span></label><input name="maxBudget" type="number" min="1" value={form.maxBudget} onChange={(e)=>set('maxBudget',e.target.value)} placeholder="예: 50" required/><p className="help">단위: 만 원</p></div>
        <div className={cls('people')}><label>이용 인원</label><input name="people" type="number" min="1" value={form.people} onChange={(e)=>set('people',e.target.value)} placeholder="예: 4"/></div>
        <div className={`${cls('period')} full`}><label>희망 이용 기간</label><select name="period" value={form.period} onChange={(e)=>set('period',e.target.value)}><option value="">선택해주세요</option>{PERIODS.map((v)=><option key={v}>{v}</option>)}</select></div>
      </div></section>
      {error&&<p className="login-error" role="alert">{error}</p>}<button className="button form-submit" disabled={saving}>{saving?'요청을 등록하고 있습니다...':'공간 요청 등록하기'}</button>
    </div><div className="form-aside"><AgentAssistant kind="request" values={{purpose:form.purpose,description:form.description,region:form.region,minArea:Number(form.minArea)||undefined,maxArea:Number(form.maxArea)||undefined,maxBudget:Number(form.maxBudget)||undefined,people:Number(form.people)||undefined,period:form.period}} onFill={fill}/><aside className="side-card reveal delay-2"><div className="role-icon"><FileText/></div><h3>등록하면 이렇게 진행돼요</h3><ul><li><Check size={17}/>입력한 조건이 구조화되어 저장됩니다.</li><li><Check size={17}/>새 공간이 등록되면 조건을 자동으로 비교합니다.</li><li><Check size={17}/>소유자가 승인한 제안만 전달됩니다.</li><li><Check size={17}/>수락 전에는 연락처가 공개되지 않습니다.</li></ul></aside></div></form>
  </div></main>;
}
