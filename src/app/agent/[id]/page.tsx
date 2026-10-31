"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BrainCircuit, Check, CircleDollarSign, IdCard, MapPin, Search, ShieldAlert, ShieldCheck, Wrench, X } from "lucide-react";
import { ConfirmModal, CountUp } from "@/components/ui";
import { useBlockStrayFileDrop } from "@/components/file-drop";
import { OwnerVerificationFields } from "@/components/owner-verification-fields";
import { useSession } from "@/components/session-provider";
import { isFirebaseReady } from "@/lib/firebase";
import { isGoodMatch } from "@/lib/matching";
import type { Confidence } from "@/lib/safety";
import { finishAnalysis, getOwnerVerification, getSpace, ownerVerificationInputError, rankRequests, sendProposal, submitOwnerVerification, type RankedRequest } from "@/lib/services";
import { type Space } from "@/lib/types";

const steps = ["공간 기본정보 확인","사진에서 공간 상태 분석","주변 환경 확인","활용 가능한 용도 비교","예상 비용 및 가격 계산","조건이 맞는 이용자 탐색","연결 가능성 검토"];

export default function AgentPage(){
  const {id}=useParams<{id:string}>(); const router=useRouter(); const searchParams=useSearchParams(); const {user}=useSession(); const [step,setStep]=useState(0); const [space,setSpace]=useState<Space|null>(null); const [candidates,setCandidates]=useState<RankedRequest[]>([]); const [verification,setVerification]=useState<Awaited<ReturnType<typeof getOwnerVerification>>>(null);
  const [spaceReady,setSpaceReady]=useState(false);
  const [analysisSource,setAnalysisSource]=useState<"openai"|"fallback"|null>(null); const [locationSource,setLocationSource]=useState<"vworld"|"openai"|"fallback"|null>(null);
  const [blocked,setBlocked]=useState<Confidence|null>(null); const [modal,setModal]=useState(false); const [sending,setSending]=useState(false); const [sendError,setSendError]=useState("");
  const [price,setPrice]=useState(""); const [reused,setReused]=useState(false); const [unavailable,setUnavailable]=useState(false); const analysisStarted=useRef(false); const acknowledged=useRef(false);
  const [proofOpen,setProofOpen]=useState(false); const [legalName,setLegalName]=useState(""); const [idFiles,setIdFiles]=useState<File[]>([]); const [proofFiles,setProofFiles]=useState<File[]>([]); const [proofSaving,setProofSaving]=useState(false); const [proofError,setProofError]=useState("");
  useBlockStrayFileDrop();

  // 이미 분석을 마친 공간은 다시 들어와도 처음부터 재분석하지 않고 저장된 결과를 바로 보여줍니다.
  useEffect(()=>{ getSpace(id).then((loaded)=>{
    setSpace(loaded);
    if(!loaded?.analysis)return;
    analysisStarted.current=true; setReused(true); setStep(steps.length); setPrice(loaded.analysis.estimatedPrice);
    void rankRequests(loaded).then(setCandidates);
  }).finally(()=>setSpaceReady(true)); },[id]);
  useEffect(()=>{ if(!user)return; void getOwnerVerification(id,user.uid).then(setVerification).catch(()=>setVerification(null)); },[id,user]);

  const analyze=useCallback((target:Space,acknowledge:boolean)=>{
    return finishAnalysis(target,acknowledge).then((result)=>{
      setAnalysisSource(result.source); setLocationSource(result.locationSource);
      // Confidence Threshold: 근거가 부족하면 결과를 만들지 않고 추가 정보를 요청합니다.
      if(result.blocked || !result.analysis){ setUnavailable(result.blocked==="unavailable"); setBlocked(result.confidence); return null; }
      setBlocked(null); setUnavailable(false); const analysis=result.analysis!;
      setSpace((current)=>current?{...current,analysis}:current);
      setPrice(analysis.estimatedPrice);
      return rankRequests({...target,analysis});
    }).then((ranked)=>{ if(ranked) setCandidates(ranked); });
  },[]);

  useEffect(()=>{ if(!space)return; if(step>=steps.length){ if(analysisStarted.current)return; analysisStarted.current=true; void analyze(space,false); return; } const timer=setTimeout(()=>setStep((v)=>v+1), step===0?650:900); return()=>clearTimeout(timer); },[step,space,analyze]);

  const done=step>=steps.length; const analysis=space?.analysis;
  const top=candidates[0]||null; const goodMatches=candidates.filter((item)=>isGoodMatch(item.match)).length;
  const subtitle=useMemo(()=> blocked&&unavailable?"입력한 공간 정보는 저장되어 있습니다. 잠시 후 다시 시도해주세요.":blocked?"판단에 필요한 근거가 부족해 분석을 멈췄습니다.":reused?"이전에 마친 분석 결과입니다. 공간 정보가 바뀌었다면 다시 분석할 수 있습니다.":done?"분석과 실제 수요 비교를 마쳤습니다. 아래 결과를 확인해주세요.":"공간 상태와 주변 조건을 확인하고 활용 가능성과 실제 수요를 비교하고 있습니다.",[done,blocked,reused,unavailable]);

  function proceedAnyway(){ if(!space)return; acknowledged.current=true; setBlocked(null); void analyze(space,true); }
  function retryAnalysis(){ if(!space)return; setBlocked(null); setUnavailable(false); void analyze(space,acknowledged.current); }
  function rerun(){ setReused(false); setBlocked(null); setUnavailable(false); acknowledged.current=false; setCandidates([]); setAnalysisSource(null); setLocationSource(null); analysisStarted.current=false; setStep(0); }

  // 소유 확인을 건너뛰었거나 보완 요청을 받은 소유자는 여기서 신분증과 소유 서류를 다시 제출합니다.
  async function submitProof(){
    if(!user||!space||proofSaving)return;
    const message=ownerVerificationInputError(legalName,idFiles,proofFiles); if(message){ setProofError(message); return; }
    setProofSaving(true); setProofError("");
    try { await submitOwnerVerification(space.id,user.uid,legalName,idFiles,proofFiles); setVerification(await getOwnerVerification(space.id,user.uid)); setProofOpen(false); setIdFiles([]); setProofFiles([]); }
    catch (reason) { setProofError(reason instanceof Error && reason.message ? reason.message : "서류를 제출하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요."); }
    finally { setProofSaving(false); }
  }

  async function confirm(){
    if(!space||!analysis||!top||sending)return; setSending(true); setSendError("");
    try { await sendProposal({...space,analysis},top.request,top.match,price); setModal(false); router.push('/owner/dashboard?proposed=1'); }
    catch (error) { setSendError(error instanceof Error && error.message ? error.message : "제안을 보내지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요."); setModal(false); }
    finally { setSending(false); }
  }

  if (!space) return <main className="agent-page"><div className="shell market-empty">{spaceReady ? <><b>등록된 공간을 찾을 수 없습니다.</b><Link className="button small" href="/owner/dashboard">내 공간으로 돌아가기</Link></> : <><span className="session-loader"/><p>등록된 공간을 불러오고 있습니다.</p></>}</div></main>;

  return <main className="agent-page"><div className="shell">
    <div className="agent-head reveal"><div className="agent-icon">{blocked?<ShieldAlert/>:done?<Check/>:<BrainCircuit/>}</div><p className="eyebrow">빈틈이음 에이전트</p><h1>{blocked&&unavailable?'분석 서비스에 잠시 연결하지 못했습니다.':blocked?'조금 더 알려주셔야 판단할 수 있어요.':done?'이 공간의 활용 계획을 찾았습니다.':'이 공간의 활용 방법을 찾고 있습니다.'}</h1><p>{subtitle}</p></div>
    {searchParams.get("verification")==="failed"&&!verification&&<div className="status-panel waiting"><ShieldAlert/><div><b>공간은 등록됐지만 소유 확인 서류를 제출하지 못했습니다.</b><p>{isFirebaseReady?"아래 소유자 확인에서 신분증과 소유 서류를 다시 제출해주세요.":"로컬 데모 모드에서는 서류 제출을 사용할 수 없습니다."}</p></div></div>}
    {verification&&<div className={`status-panel ${verification.status==="verified"?"success":verification.status==="pending"?"waiting":"muted"}`}><ShieldCheck/><div><b>{verification.status==="verified"?"소유자 서류 확인 완료":verification.status==="pending"?"소유자 서류 검토 중":"소유자 서류 보완 필요"}</b><p>{verification.reviewNote|| (verification.status==="pending"?"운영자가 신분증과 소유 서류의 이름, 공간 소재지를 대조하고 있습니다.":verification.status==="verified"?"운영자 검토를 완료했습니다.":"운영자 메모를 확인하고 보완 서류를 다시 제출해주세요.")}</p></div></div>}
    {isFirebaseReady&&user&&space.ownerId===user.uid&&(!verification||verification.status==="rejected")&&<section className="result verification-card"><div className="result-head"><div><p className="eyebrow" style={{marginBottom:7}}>소유자 확인</p><h2>{verification?.status==="rejected"?"보완 서류를 다시 제출해주세요.":"신분증과 소유 서류로 소유자 확인을 신청하세요."}</h2></div><IdCard color="#bd6d08"/></div><div className="result-body">
      {proofOpen?<><p className="help" style={{margin:0}}>운영자가 신분증의 이름, 서류상 소유자 이름, 서류 소재지와 공간 주소를 대조합니다. 확인 자료는 공개되지 않습니다.</p><OwnerVerificationFields legalName={legalName} onLegalName={setLegalName} idFiles={idFiles} onIdFiles={setIdFiles} proofFiles={proofFiles} onProofFiles={setProofFiles} onError={setProofError}/>{proofError&&<p className="login-error" role="alert">{proofError}</p>}<div className="guard-actions"><button type="button" className="button" disabled={proofSaving} onClick={()=>void submitProof()}>{proofSaving?"서류를 제출하고 있습니다...":"확인 서류 제출"}</button><button type="button" className="button secondary" disabled={proofSaving} onClick={()=>setProofOpen(false)}>닫기</button></div></>
      :<button type="button" className="button secondary" onClick={()=>setProofOpen(true)}>신분증·소유 서류 제출하기</button>}
    </div></section>}
    <div className="agent-layout"><aside className="timeline-card"><h2>업무 진행 상황</h2><ol className="timeline">{steps.map((label,i)=><li key={label} className={i<step?'done':i===step&&!done?'active':''}><span className="timeline-dot">{i<step&&<Check size={12}/>}</span><span>{label}</span></li>)}</ol></aside>
      <div className="agent-work">
        <section className="discovery"><div className="discovery-head"><Search size={18}/><b>{done?'확인된 공간 정보':'정보를 확인하고 있습니다'}</b>{locationSource&&<span className={`engine-badge ${locationSource==='vworld'||locationSource==='openai'?'openai':'fallback'}`}>{locationSource==='vworld'?'VWorld 주변 데이터':locationSource==='openai'?'AI 주소 기반 추정':'주변 데이터 확인 필요'}</span>}{analysisSource&&!blocked&&<span className={`engine-badge ${analysisSource}`}>{analysisSource==='openai'?'실시간 모델 분석':'분석 확인 필요'}</span>}{reused&&<><span className="engine-badge openai">저장된 분석 결과</span><button type="button" className="text-button rerun-button" onClick={rerun}>다시 분석</button></>}</div>{step<2?<><div className="skeleton"/><div className="skeleton short"/></>:<div className="finding-grid"><div className="finding"><span>공간 상태</span><b>{blocked?'확인 필요':analysis?.condition || '분석 대기'}</b></div>{step>=3&&<div className="finding"><span>주변 환경</span><b>{blocked?'조회 결과 부족':done?analysis?.surroundingEnvironment || '분석 대기':'등록 주소로 주변 시설을 조회하고 있습니다.'}</b></div>}</div>}</section>

        {blocked&&unavailable&&<section className="result guard-card"><div className="result-head"><div><p className="eyebrow" style={{marginBottom:7}}>분석 중단 · 연결 오류</p><h2>분석 서버에서 결과를 받지 못했습니다.</h2></div><ShieldAlert color="#bd6d08"/></div><div className="result-body">
          <p style={{margin:'0 0 18px',color:'#666',fontSize:14,lineHeight:1.7}}>근거가 부족해서가 아니라 분석 서버 또는 로그인 확인에 실패했습니다. 등록한 공간은 그대로 저장되어 있으니 잠시 후 다시 시도해주세요. 계속 실패하면 다시 로그인한 뒤 내 공간 대시보드에서 이 공간을 열어주세요.</p>
          <div className="guard-actions"><button type="button" className="button" onClick={retryAnalysis}>다시 시도</button><Link className="button secondary" href="/owner/dashboard">내 공간으로</Link></div>
        </div></section>}
        {blocked&&!unavailable&&<section className="result guard-card"><div className="result-head"><div><p className="eyebrow" style={{marginBottom:7}}>분석 중단 · 근거 부족</p><h2>추측으로 결과를 만들지 않았습니다.</h2></div><ShieldAlert color="#bd6d08"/></div><div className="result-body">
          <p style={{margin:'0 0 18px',color:'#666',fontSize:14,lineHeight:1.7}}>지금 정보로는 활용 방안과 가격을 신뢰도 있게 판단할 수 없습니다. 근거 충족도는 <b style={{color:'#222'}}><CountUp value={blocked.score}/>점</b>으로, 분석을 진행하는 기준(45점)에 미치지 못합니다.</p>
          <ul className="guard-list">{blocked.signals.map((signal)=><li key={signal.key} className={signal.ok?'ok':'off'}><span className="guard-mark">{signal.ok?<Check size={13}/>:<X size={13}/>}</span><div><b>{signal.label}</b><small>{signal.detail}</small></div></li>)}</ul>
          <div className="guard-actions"><Link className="button" href="/owner/new">정보 보완해서 다시 등록</Link><button type="button" className="button secondary" onClick={proceedAnyway}>참고용으로만 분석 진행</button></div>
          <p className="fineprint">참고용으로 진행하면 결과가 추정에 가깝다는 점을 감안해 확인해주세요.</p>
        </div></section>}

        {!blocked && analysis && <>
        {step>=4&&<section className="result"><div className="result-head"><h2>추천 활용 방안</h2><span className="status-badge accepted">규칙 검토 완료</span></div><div className="result-body"><div className="use-list">{analysis.suggestedUses.map((use,i)=><div className="use-card" key={use.name}><span className="use-rank">{i+1}</span><div><h3>{use.name}</h3><p>{use.reasons.join(' · ')}</p>{use.caution&&<p className="use-caution"><AlertTriangle size={13}/>{use.caution}</p>}</div><div className="score"><CountUp value={use.score}/><small>%</small></div></div>)}</div>{!!analysis.safetyNotes?.length&&<div className="safety-note"><b><ShieldAlert size={14}/> 규칙 기반 안전 필터</b><ul>{analysis.safetyNotes.map((note)=><li key={note}>{note}</li>)}</ul></div>}</div></section>}
        {step>=5&&<section className="result"><div className="result-head"><h2>활용했을 때 예상되는 비용</h2><CircleDollarSign color="#bd6d08"/></div><div className="result-body"><div className="cost-grid"><div className="cost-item"><span>예상 정비비</span><b>{analysis.estimatedRepairCost}</b></div><div className="cost-item"><span>예상 이용료</span><b>{analysis.estimatedPrice}</b></div><div className="cost-item"><span>예상 연간 수입</span><b>{analysis.estimatedIncome}</b></div><div className="cost-item"><span>예상 회수기간</span><b>{analysis.paybackPeriod}</b></div></div><p className="fineprint">현재 입력된 정보와 주변 데이터를 바탕으로 계산한 참고용 예상치입니다. 실제 이용료는 소유자가 확정합니다.</p></div></section>}
        {step>=6&&<section className="result"><div className="result-head"><h2>방치와 활용 비교</h2><Wrench color="#bd6d08"/></div><div className="result-body"><div className="compare"><div className="compare-card"><h3>방치</h3><div className="compare-row"><span>초기 비용</span><b>낮음</b></div><div className="compare-row"><span>예상 수익</span><b>0원</b></div><div className="compare-row"><span>관리</span><b>지속 필요</b></div></div><div className="compare-card active"><h3>활용</h3><div className="compare-row"><span>초기 정비비</span><b>발생</b></div><div className="compare-row"><span>예상 이용료</span><b>{analysis.estimatedPrice}</b></div><div className="compare-row"><span>관리</span><b>이용자와 분담 가능</b></div></div></div><p className="fineprint">현재 정보 기준으로 활용 가능성이 높은 공간입니다. 최종 결정 전 현장 확인을 권장합니다.</p></div></section>}
        {done&&top&&<section className="result"><div className="result-head"><div><p className="eyebrow" style={{marginBottom:7}}>실제 수요 탐색 완료</p><h2>이 공간을 찾고 있는 사람이 있습니다.</h2></div><MapPin color="#bd6d08"/></div><div className="result-body"><ul className="search-log"><li><Check size={15}/>등록된 요청 <b><CountUp value={candidates.length}/>건</b>을 검토했습니다.</li><li><Check size={15}/>지역·면적·예산 조건을 만족한 후보 <b><CountUp value={goodMatches}/>명</b>을 찾았습니다.</li><li><Check size={15}/>가장 적합한 이용자와의 매칭도 <b><CountUp value={top.match.score}/>점</b></li></ul><div className="match-card"><div className="match-card-head"><div><h3>{top.request.seekerName}</h3><p>{top.request.description}</p></div><div className="match-score"><CountUp value={top.match.score}/><small style={{fontSize:12}}>%</small></div></div><div className="match-data"><div><span>희망 지역</span><b>{top.request.region}</b></div><div><span>면적</span><b>{top.request.minArea}~{top.request.maxArea||top.request.minArea}㎡</b></div><div><span>예산</span><b>월 {top.request.maxBudget}만 원 이하</b></div><div><span>이용 기간</span><b>{top.request.period}</b></div></div><div className="match-reason"><strong><CountUp value={top.match.score}/>% 적합</strong><ul className="match-reason-list">{top.match.factors.map((factor)=><li key={factor.key} title={`${factor.label} ${factor.points}/${factor.max} · ${factor.detail}`}>{factor.summary}</li>)}</ul></div>{sendError&&<p className="login-error" role="alert">{sendError}</p>}<button className="button" onClick={()=>{setSendError("");setModal(true);}}>연결 제안 검토하기</button></div></div></section>}
        </>}
      </div>
    </div>
    <ConfirmModal open={modal} loading={sending} target={top?.request.seekerName} price={price} onPriceChange={setPrice} onClose={()=>setModal(false)} onConfirm={confirm}/>
  </div></main>;
}
