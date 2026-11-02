"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, IdCard, RotateCcw, ShieldCheck } from "lucide-react";

// 시연용 예시입니다. 실제 신분증이나 서류를 올리지 않고 소유자 확인 절차를 단계별로 보여줍니다.
const SAMPLE = { name: "김공간", address: "대전광역시 동구 중앙로 215", birth: "900101-1●●●●●●" };

type Focus = "upload" | "idName" | "docName" | "address" | "done";
const STEPS: { focus: Focus; title: string; text: string; who: string }[] = [
  { focus: "upload", who: "소유자", title: "신분증과 소유 서류 제출", text: "공간을 등록한 뒤 분석 결과 화면에서 신분증 사본과 등기사항증명서(또는 토지대장·건축물대장)를 올립니다. 주민등록번호 뒷자리는 가린 상태로 제출하고, 자료는 공개되지 않으며 제출자와 검토 운영자만 볼 수 있습니다." },
  { focus: "idName", who: "운영자", title: "① 신분증 이름 대조", text: "신분증에 적힌 이름이 소유자가 입력한 이름과 같은지 확인합니다. 다른 사람의 신분증으로 신청하는 경우를 걸러냅니다." },
  { focus: "docName", who: "운영자", title: "② 서류상 소유자 대조", text: "등기사항증명서 갑구(소유권)에 적힌 소유자 이름이 신분증 이름과 같은지 확인합니다. 공동소유라면 공유자 중 한 명인지, 대리 제출이라면 위임 자료가 있는지 봅니다." },
  { focus: "address", who: "운영자", title: "③ 소재지 대조", text: "서류에 적힌 소재지가 빈틈이음에 등록한 공간 주소와 같은지 확인합니다. 지번 주소와 도로명 주소가 다르게 적혀 있으면 추가 자료를 요청합니다." },
  { focus: "done", who: "운영자 → 소유자", title: "확인 완료", text: "세 항목을 모두 체크해야 '소유 확인 완료'를 누를 수 있습니다. 하나라도 맞지 않으면 사유를 적어 보완을 요청하고, 소유자는 같은 화면에서 서류를 다시 냅니다. 이 표시는 서류 대조 기록이며 법적 소유권을 보증하지 않습니다." },
];

export default function VerificationDemoPage() {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const hl = (focus: Focus) => (current.focus === focus ? " demo-hl" : "");
  const checks = [
    { label: "신분증 이름 = 입력한 이름", done: step >= 1 },
    { label: "서류상 소유자 = 신분증 이름", done: step >= 2 },
    { label: "서류 소재지 = 등록 주소", done: step >= 3 },
  ];

  return <main className="page"><div className="shell">
    <div className="page-head reveal"><p className="eyebrow">시연용 · 예시 서류</p><h1>소유자 확인은 이렇게 진행돼요</h1><p>실제 신분증 대신 예시 서류로 운영자가 무엇을 대조하는지 단계별로 보여드립니다. 이 화면에서는 아무 파일도 저장되지 않습니다.</p></div>

    <ol className="demo-steps" aria-label="소유자 확인 단계">{STEPS.map((item, index) => <li key={item.focus}><button type="button" className={index === step ? "active" : index < step ? "done" : ""} onClick={() => setStep(index)}><span>{index < step ? <Check size={12}/> : index + 1}</span>{item.title}</button></li>)}</ol>

    <div className="demo-layout">
      <section className="demo-papers" aria-label="예시 서류">
        <div className={`demo-input${hl("idName")}`}><span>소유자가 입력한 이름</span><b>{SAMPLE.name}</b></div>
        <div className="demo-paper-grid">
          <article className={`demo-paper demo-id${hl("upload")}`}>
            <span className="demo-watermark">예시</span>
            <header><IdCard size={16}/> 주민등록증</header>
            <div className="demo-photo" aria-hidden="true"/>
            <dl><dt>이름</dt><dd className={hl("idName") + hl("docName")}>{SAMPLE.name}</dd><dt>주민등록번호</dt><dd>{SAMPLE.birth} <small>(뒷자리 가림)</small></dd><dt>주소</dt><dd>대전광역시 서구 ○○로 00</dd></dl>
          </article>
          <article className={`demo-paper demo-deed${hl("upload")}`}>
            <span className="demo-watermark">예시</span>
            <header><FileText size={16}/> 등기사항전부증명서(건물)</header>
            <dl><dt>소재지</dt><dd className={hl("address")}>{SAMPLE.address}</dd><dt>건물 내역</dt><dd>단독주택 · 1층 67㎡</dd></dl>
            <table><caption>갑구 (소유권에 관한 사항)</caption><thead><tr><th>등기 목적</th><th>권리자</th></tr></thead><tbody><tr><td>소유권 이전</td><td className={hl("docName")}>소유자 {SAMPLE.name}</td></tr></tbody></table>
          </article>
        </div>
        <div className={`demo-input${hl("address")}`}><span>빈틈이음에 등록한 공간 주소</span><b>{SAMPLE.address}</b></div>
      </section>

      <aside className="demo-guide">
        <p className="demo-who">{current.who}</p>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div className="demo-check"><b>운영자 대조 체크리스트</b>{checks.map((item) => <div key={item.label} className={item.done ? "on" : ""}><span>{item.done && <Check size={12}/>}</span>{item.label}</div>)}</div>
        {current.focus === "done" && <div className="status-panel success"><ShieldCheck/><div><b>소유자 서류 확인 완료</b><p>소유자의 공간 화면과 운영자 화면에 같은 상태가 표시됩니다.</p></div></div>}
        <div className="demo-nav">
          <button type="button" className="button secondary" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16}/> 이전</button>
          {step < STEPS.length - 1 ? <button type="button" className="button" onClick={() => setStep(step + 1)}>다음 단계 <ArrowRight size={16}/></button> : <button type="button" className="button" onClick={() => setStep(0)}><RotateCcw size={16}/> 처음부터</button>}
        </div>
        <p className="demo-note">실제 제출은 공간을 등록한 뒤 <Link href="/owner/dashboard">내 공간</Link> → 분석 결과 화면의 소유자 확인 카드에서 할 수 있습니다.</p>
      </aside>
    </div>
  </div></main>;
}
