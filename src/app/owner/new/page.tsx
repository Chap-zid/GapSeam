"use client";

import { Check, FileText, ImagePlus, MapPinned } from "lucide-react";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentAssistant } from "@/components/agent-assistant";
import { useSession } from "@/components/session-provider";
import { BUILDING_TYPES, FACILITY_OPTIONS, SPACE_STATUSES, type AssistFields } from "@/lib/assist";
import { extractRegion } from "@/lib/region";
import { saveSpace, submitOwnerVerification } from "@/lib/services";

type SpaceForm = { address: string; area: string; buildingType: string; currentStatus: string; description: string; facilities: string[]; repairNeeds: string };
const EMPTY: SpaceForm = { address: "", area: "", buildingType: "", currentStatus: "", description: "", facilities: [], repairNeeds: "" };

export default function SpaceFormPage() {
  const router=useRouter(); const {user}=useSession(); const [photos,setPhotos]=useState<{file:File;preview:string}[]>([]); const [proofFiles,setProofFiles]=useState<File[]>([]); const [legalName,setLegalName]=useState(""); const [dragging,setDragging]=useState(false); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const [form,setForm]=useState<SpaceForm>(EMPTY); const [flash,setFlash]=useState<Record<string,boolean>>({}); const timers=useRef<number[]>([]); const previewUrls=useRef<string[]>([]);
  // 에이전트가 채운 항목은 잠시 강조해서 어떤 값이 바뀌었는지 보이게 합니다.
  const fill=useCallback((field:keyof AssistFields,value:AssistFields[keyof AssistFields])=>{ setForm((old)=>({...old,[field]:Array.isArray(value)?value:String(value)}) as SpaceForm); setFlash((old)=>({...old,[field]:true})); timers.current.push(window.setTimeout(()=>setFlash((old)=>({...old,[field]:false})),1100)); },[]);
  useEffect(()=>()=>{ timers.current.forEach((timer)=>window.clearTimeout(timer)); },[]);
  useEffect(()=>()=>{ previewUrls.current.forEach((url)=>URL.revokeObjectURL(url)); },[]);
  const set=<K extends keyof SpaceForm>(field:K,value:SpaceForm[K])=>setForm((old)=>({...old,[field]:value}));
  const cls=(field:string)=>`field${flash[field]?' field-flash':''}`;
  const toggleFacility=(value:string)=>set('facilities',form.facilities.includes(value)?form.facilities.filter((item)=>item!==value):[...form.facilities,value]);
  function addImages(selected:FileList|File[]){
    const incoming=Array.from(selected); const valid=incoming.filter((file)=>file.type.startsWith('image/')&&file.size<=10*1024*1024);
    const additions=valid.slice(0,Math.max(0,5-photos.length)).map((file)=>{const preview=URL.createObjectURL(file);previewUrls.current.push(preview);return{file,preview};});
    setPhotos((current)=>[...current,...additions]);
    if(valid.length!==incoming.length)setError('사진은 이미지 파일이며 장당 10MB 이하여야 합니다.');
    else if(photos.length+valid.length>5)setError('사진은 최대 5장까지 등록할 수 있습니다.');
    else setError('');
  }
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); if(!user||user.role!=='owner')return;
    const area=Number(form.area);
    if(!form.address.trim()||!Number.isFinite(area)||area<=0||!form.buildingType){ setError("주소, 면적, 건물 종류는 반드시 입력해주세요."); return; }
    if(Boolean(legalName.trim())!==Boolean(proofFiles.length)){ setError("소유자 확인을 신청하려면 서류상 이름과 증빙 서류를 모두 입력해주세요."); return; }
    if(proofFiles.some((file)=>!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)){setError("소유 확인 서류는 PDF, JPG, PNG, WebP 파일이며 개별 15MB 이하여야 합니다.");return;}
    setSaving(true); setError("");
    let savedSpaceId="";
    try {
      savedSpaceId=await saveSpace({ownerId:user.uid,address:form.address.trim(),region:extractRegion(form.address),area,buildingType:form.buildingType,description:form.description.trim(),currentStatus:form.currentStatus||'공가',facilities:form.facilities,repairNeeds:form.repairNeeds.trim()},photos.map((photo)=>photo.file));
      if(proofFiles.length)await submitOwnerVerification(savedSpaceId,user.uid,legalName,proofFiles);
      router.push(`/agent/${savedSpaceId}`);
    }
    catch { if(savedSpaceId){router.push(`/agent/${savedSpaceId}?verification=failed`);return;} setError("공간을 저장하지 못했습니다. 입력 내용은 유지되니 다시 시도해주세요."); setSaving(false); }
  }
  return <main className="page"><div className="shell">
    <div className="page-head reveal"><p className="eyebrow">내 공간 등록</p><h1>공간을 등록해주세요</h1><p>직접 입력하셔도 되고, 오른쪽 에이전트에게 말로 설명하셔도 됩니다.</p></div>
    <div className="form-layout"><form className="form-card reveal" onSubmit={submit}>
      <section className="form-section"><h2>기본 정보</h2><div className="form-grid">
        <div className={`${cls('address')} full`}><label>주소 <span className="required">*</span></label><input name="address" value={form.address} onChange={(e)=>set('address',e.target.value)} placeholder="예: 대전광역시 동구 중앙로 215" required/><p className="help">{form.address.trim()?<>인식된 지역 <b>{extractRegion(form.address)}</b> · 토지·건축물대장의 소재지와 대조해주세요.</>:'토지대장·건축물대장의 지번 또는 도로명 주소를 확인해주세요. 건물번호까지 입력하면 VWorld가 주변 정보를 조회합니다.'}</p></div>
        <div className={cls('area')}><label>면적 <span className="required">*</span></label><input name="area" type="number" min="1" value={form.area} onChange={(e)=>set('area',e.target.value)} placeholder="예: 67" required/><p className="help">단위: ㎡ · 건축물대장의 연면적과 전용면적을 구분해 확인해주세요.</p></div>
        <div className={cls('buildingType')}><label>건물 종류 <span className="required">*</span></label><select name="buildingType" value={form.buildingType} onChange={(e)=>set('buildingType',e.target.value)} required><option value="">선택해주세요</option>{BUILDING_TYPES.map((v)=><option key={v}>{v}</option>)}</select><p className="help">건축물대장의 주용도와 실제 상태를 함께 확인해주세요.</p></div>
        <div className={cls('currentStatus')}><label>현재 상태</label><select name="currentStatus" value={form.currentStatus} onChange={(e)=>set('currentStatus',e.target.value)}><option value="">선택해주세요</option>{SPACE_STATUSES.map((v)=><option key={v}>{v}</option>)}</select></div>
        <div className={`${cls('description')} full`}><label>공간 설명</label><textarea name="description" value={form.description} onChange={(e)=>set('description',e.target.value)} placeholder="예: 한동안 사용하지 않은 1층 단독주택입니다. 마당과 독립 출입구가 있습니다."/></div>
      </div></section>
      <section className="form-section"><h2>시설 및 정비 <small>선택</small></h2><div className={`checks${flash.facilities?' field-flash':''}`}>{FACILITY_OPTIONS.map((v)=><label className="check-label" key={v}><input type="checkbox" checked={form.facilities.includes(v)} onChange={()=>toggleFacility(v)}/>{v}</label>)}</div><div className={cls('repairNeeds')} style={{marginTop:18}}><label>알고 있는 수리 필요사항</label><input name="repairNeeds" value={form.repairNeeds} onChange={(e)=>set('repairNeeds',e.target.value)} placeholder="예: 벽면 도색과 출입문 정비가 필요합니다."/></div></section>
      <section className="form-section"><h2>소유자 확인 <small>선택</small></h2><p className="help">서류상 이름과 등기사항증명서·토지대장·건축물대장 등 확인 자료를 운영자가 대조합니다. 주민등록번호 등 불필요한 식별정보는 가린 뒤 제출해주세요.</p><div className="field" style={{marginTop:16}}><label>공적 서류에 적힌 소유자 이름</label><input value={legalName} onChange={(event)=>setLegalName(event.target.value)} maxLength={100} placeholder="서류 표기와 동일하게 입력"/></div><label className="proof-upload"><input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event)=>setProofFiles(Array.from(event.target.files||[]).slice(0,3))}/><FileText size={20}/><span><b>{proofFiles.length?`${proofFiles.length}개 서류 선택됨`:'소유 확인 서류 첨부'}</b><small>{proofFiles.map((file)=>file.name).join(' · ')||'PDF, JPG, PNG, WebP · 최대 3개 · 개별 15MB'}</small></span></label><p className="help">확인 자료는 공개되지 않으며 제출자와 검토 운영자만 접근할 수 있습니다. 심사 완료 전에는 소유 인증으로 표시되지 않습니다.</p></section>
      <section className="form-section"><h2>공간 사진 <small>3~5장 권장</small></h2><label className={`dropzone${dragging?' is-dragging':''}`} onDragOver={(event)=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={(event)=>{event.preventDefault();setDragging(false);addImages(event.dataTransfer.files);}}><input type="file" multiple accept="image/*" onChange={(event)=>{if(event.target.files)addImages(event.target.files);event.target.value='';}}/><ImagePlus size={29}/><b>{photos.length?`${photos.length}장의 사진을 선택했습니다`:'사진을 끌어다 놓거나 클릭해서 선택하세요'}</b><span>이미지 파일 · 최대 5장 · 장당 10MB 이하</span></label>{photos.length>0&&<div className="thumbs">{photos.map((photo,index)=><Image key={`${photo.file.name}-${photo.file.lastModified}`} width={94} height={70} src={photo.preview} alt={`공간 사진 미리보기 ${index+1}`} unoptimized/>)}</div>}</section>
      {error&&<p className="login-error" role="alert">{error}</p>}<button className="button form-submit" disabled={saving}>{saving?'공간을 안전하게 등록하고 있습니다...':'공간 분석 시작'}</button>
    </form><div className="form-aside"><AgentAssistant kind="space" values={{address:form.address,area:Number(form.area)||undefined,buildingType:form.buildingType,currentStatus:form.currentStatus,description:form.description,facilities:form.facilities,repairNeeds:form.repairNeeds}} onFill={fill}/><aside className="side-card reveal delay-2"><div className="role-icon"><MapPinned/></div><h3>사진이 부족해도 괜찮아요</h3><ul><li><Check size={17}/>공간의 외관과 내부 상태를 함께 확인합니다.</li><li><Check size={17}/>위치와 주변 생활 인프라를 비교합니다.</li><li><Check size={17}/>정비비와 적정 이용료를 참고용으로 계산합니다.</li><li><Check size={17}/>등록된 실제 공간 수요를 탐색합니다.</li></ul><span className="demo-chip">업로드 실패 시 예시 사진으로 분석을 이어갑니다.</span></aside></div></div>
  </div></main>;
}
