import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Building2, Check, DatabaseZap, ShieldCheck, Users } from "lucide-react";

export default function Home() {
  return <main>
    <section className="hero shell">
      <div className="hero-copy">
        <p className="eyebrow">공간의 다음 쓰임을 찾습니다</p>
        <h1>비어 있는 공간을,<br/>필요한 사람에게.</h1>
        <p>방치된 공간의 가능성을 분석하고<br/>활용 방법부터 실제 이용자 연결까지 도와드립니다.</p>
        <div className="hero-actions">
          <Link className="button" href="/owner/new">내 공간 분석하기 <ArrowRight size={18}/></Link>
          <Link className="button secondary" href="/seeker/dashboard">공간 찾아보기</Link>
        </div>
      </div>
      <div className="hero-image">
        <Image src="/images/space-hero.png" width={1536} height={1024} priority alt="활용을 기다리는 오래된 단독주택"/>
        <div className="analysis-float">
          <div className="topline"><span className="check"><Check size={14}/></span> 공간 분석 완료</div>
          <div className="float-row"><span>추천 활용</span><b>3개</b></div>
          <div className="float-row"><span>조건이 맞는 이용자</span><b>7명</b></div>
        </div>
      </div>
    </section>
    <div className="trust-strip"><div className="shell trust-grid">
      <div className="trust-item"><Building2/><div><b>공간 가능성 분석</b><small>사진과 위치 정보를 함께 확인합니다</small></div></div>
      <div className="trust-item"><DatabaseZap/><div><b>비용과 수요 검토</b><small>예상 비용부터 이용 가격까지 계산합니다</small></div></div>
      <div className="trust-item"><ShieldCheck/><div><b>승인 후 안전하게 연결</b><small>소유자가 승인해야 제안이 전송됩니다</small></div></div>
    </div></div>
    <section className="section shell">
      <div className="section-head"><h2>등록만 하면, 활용 계획부터<br/>실제 연결까지 이어집니다.</h2><p>빈틈이음은 추천에서 멈추지 않습니다.<br/>분석 결과를 실제 수요와 비교해 다음 행동을 만듭니다.</p></div>
      <div className="steps">
        {[['01','공간 등록','기본 정보와 사진을 올려주세요.'],['02','활용 가능성 분석','상태와 주변 조건을 바탕으로 활용안을 만듭니다.'],['03','실제 수요 탐색','등록된 이용자 요청에서 조건이 맞는 사람을 찾습니다.'],['04','승인 후 연결','제안을 보내고 상대방의 응답을 실시간으로 확인합니다.']].map(([n,t,d])=><div className="step" key={n}><span className="step-num">STEP {n}</span><h3>{t}</h3><p>{d}</p></div>)}
      </div>
    </section>
    <section className="section soft"><div className="shell" style={{textAlign:'center'}}><Users size={34} color="#d47700" style={{margin:'0 auto 18px'}}/><h2 style={{fontSize:32,margin:'0 0 14px'}}>내 조건을 미리 등록해두세요.</h2><p style={{color:'#737373',lineHeight:1.7,margin:'0 0 26px'}}>찾고 있는 공간이 등록되면, 소유자의 검토를 거쳐<br/>실제 공간 제안을 받을 수 있습니다.</p><Link href="/login?role=seeker" className="button">공간 요청 등록하기 <ArrowRight size={18}/></Link></div></section>
  </main>;
}
