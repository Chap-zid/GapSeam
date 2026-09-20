"use client";

import { ArrowLeft, Bot, Clipboard, Download, FileCheck2, FileText, LoaderCircle, Plus, ShieldCheck, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { ChangeEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";

type DocumentItem = { id: string; name: string; updatedAt: string; size: number; text: string; matchId?: string };
type Finding = { level: string; title: string; detail: string };
type DocumentGuide = { name: string; reason: string; status: string };
type Review = { summary: string; findings: Finding[]; rewrite: string; requiredDocuments: DocumentGuide[]; questions: string[]; nextActions: string[] };
type EditorConfig = Record<string, unknown>;

declare global { interface Window { DocsAPI?: { DocEditor: new (id: string, config: EditorConfig) => { destroyEditor: () => void } } } }

const serverUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_URL || "http://localhost:8080";

async function authHeaders(): Promise<HeadersInit> {
  const token = await auth?.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function DocumentsContent() {
  const matchId = useSearchParams().get("matchId") || "";
  const [documents, setDocuments] = useState<DocumentItem[]>([]); const [current, setCurrent] = useState<DocumentItem | null>(null);
  const [config, setConfig] = useState<EditorConfig | null>(null); const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(true); const [uploading, setUploading] = useState(false); const [error, setError] = useState("");
  const [instruction, setInstruction] = useState(""); const [selection, setSelection] = useState(""); const [review, setReview] = useState<Review | null>(null); const [reviewing, setReviewing] = useState(false);
  const editor = useRef<{ destroyEditor: () => void } | null>(null);

  const openDocument = useCallback(async (item: DocumentItem) => {
    setCurrent(item); setReview(null); setError("");
    const response = await fetch(`/api/documents/${item.id}`, { cache: "no-store", headers: await authHeaders() });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "문서를 열지 못했습니다."); return; }
    setConfig(data.editor);
  }, []);

  useEffect(() => { void authHeaders().then((headers) => fetch(`/api/documents${matchId ? `?matchId=${encodeURIComponent(matchId)}` : ""}`, { cache: "no-store", headers })).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }).then((data) => { setDocuments(data.documents || []); if (data.documents?.[0]) void openDocument(data.documents[0]); }).catch((reason) => setError(reason instanceof Error ? reason.message : "문서 목록을 불러오지 못했습니다.")).finally(() => setLoading(false)); }, [openDocument, matchId]);
  useEffect(() => {
    if (!scriptReady || !config || !window.DocsAPI) return;
    editor.current?.destroyEditor();
    editor.current = new window.DocsAPI.DocEditor("onlyoffice-editor", { ...config, width: "100%", height: "100%" });
    return () => { editor.current?.destroyEditor(); editor.current = null; };
  }, [config, scriptReady]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setUploading(true); setError("");
    const body = new FormData(); body.append("file", file); if (matchId) body.append("matchId", matchId);
    try { const response = await fetch("/api/documents", { method: "POST", body, headers: await authHeaders() }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setDocuments((old) => [data.document, ...old]); await openDocument(data.document); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "업로드하지 못했습니다."); }
    finally { setUploading(false); event.target.value = ""; }
  }

  async function ask(prompt: string) {
    if (!current) return; setReviewing(true); setError("");
    try { const response = await fetch("/api/documents/review", { method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ text: current.text, instruction: prompt, selection }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setReview(data.review); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "검토하지 못했습니다."); }
    finally { setReviewing(false); }
  }

  async function copyRewrite() {
    if (!review?.rewrite) return;
    try { await navigator.clipboard.writeText(review.rewrite); }
    catch { setError("교체안을 복사하지 못했습니다. 텍스트를 직접 선택해 복사해주세요."); }
  }

  return <main className="document-page"><Script src={`${serverUrl}/web-apps/apps/api/documents/api.js`} onLoad={() => setScriptReady(true)} onError={() => setError("문서 편집 서버가 꺼져 있습니다. Docker를 실행한 뒤 새로고침해주세요.")}/><div className="shell">
    {matchId && <div className="document-collab-bar"><div><FileCheck2/><span><b>매칭 공동 문서함</b><small>이 채팅방에서 합의할 계획서와 협의 문서를 함께 관리합니다.</small></span></div><Link href={`/matches/${matchId}`}><ArrowLeft size={15}/> 채팅으로 돌아가기</Link></div>}
    <div className="document-head reveal"><div><p className="eyebrow">공가 문서 도우미</p><h1>문서를 편집하며 공가 계획을 점검하세요</h1><p>원본 DOCX를 직접 편집하고 권한·안전·행정 절차를 검토합니다. 행동 강령 교체는 공가 관련 조항만 제안합니다.</p></div><label className="button document-upload"><Upload size={17}/>{uploading ? "업로드 중..." : "DOCX 파일 선택"}<input type="file" accept=".docx" onChange={upload} disabled={uploading}/></label></div>
    {error && <div className="document-alert" role="alert"><ShieldCheck size={18}/>{error}</div>}
    <div className="document-workspace">
      <aside className="document-list"><div className="document-list-title"><b>{matchId ? "공동 문서" : "최근 문서"}</b><label title="문서 추가"><Plus size={18}/><input type="file" accept=".docx" onChange={upload}/></label></div>{loading ? <p className="document-empty">불러오는 중...</p> : documents.length === 0 ? <div className="document-empty"><FileText/><b>아직 문서가 없습니다</b><span>{matchId ? "채팅 참여자와 편집할 DOCX 문서를 올려보세요." : "DOCX 계획서를 올려 시작하세요."}</span></div> : documents.map((item) => <button key={item.id} className={current?.id === item.id ? "active" : ""} onClick={() => void openDocument(item)}><FileText size={18}/><span><b>{item.name}</b><small>{new Date(item.updatedAt).toLocaleDateString("ko-KR")} · {Math.max(1, Math.round(item.size / 1024))}KB</small></span></button>)}</aside>
      <section className="document-editor-card"><div className="document-toolbar"><div><FileCheck2 size={17}/><b>{current?.name || "문서를 선택해주세요"}</b><span>자동 저장</span></div>{current && <a className="text-button" href={`/api/documents/${current.id}/file`} download><Download size={16}/> 내려받기</a>}</div><div className="document-editor">{current ? <div id="onlyoffice-editor"/> : <div className="document-editor-placeholder"><FileText/><b>편집할 문서를 선택하세요</b><span>Docker의 ONLYOFFICE 편집기에서 원본 DOCX를 그대로 수정합니다.</span></div>}</div></section>
      <aside className="document-agent"><div className="document-agent-head"><span><Bot size={19}/></span><div><b>AI 문서 검토</b><small>공가 행정·안전 기준</small></div></div><p className="agent-disclaimer">참고용 검토이며 허가 가능성이나 법률 판단을 대신하지 않습니다. 행동 강령 교체는 공가 관련 조항만 다룹니다.</p><div className="document-quick"><button onClick={() => void ask("공가 활용 계획의 권한, 건축·토지, 안전, 행정 절차 누락을 찾아줘")}><ShieldCheck/>필수 절차 점검</button><button onClick={() => void ask("현재 계획에 필요한 공통 문서와 조건부 행정서식을 분류하고 관할 기관 확인사항을 알려줘")}><FileText/>필요 서식 분류</button><button onClick={() => void ask("문서 작성에 빠진 정보만 질문으로 정리해줘")}><Sparkles/>누락 정보 질문</button><button onClick={() => void ask("모호한 표현을 책임 주체와 완료 기준이 보이도록 행정 문체로 고쳐줘")}><FileCheck2/>행정 문체 점검</button><button onClick={() => void ask("문서에서 공가 활용과 직접 관련된 행동 강령 조항만 찾아 교체안을 작성해줘")}><Clipboard/>공가 행동 강령 교체</button></div><label>검토하거나 바꿀 문장<textarea value={selection} onChange={(e) => setSelection(e.target.value)} placeholder="공가 관련 행동 강령 조항이나 검토할 문장을 붙여 넣으세요. 비워두면 문서 전체를 기준으로 검토합니다."/></label><label>문서에 질문하기<textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="예: 지자체 상담 전에 무엇을 확인해야 해?"/></label><button className="button document-ask" disabled={!current || reviewing || (!instruction.trim() && !selection.trim())} onClick={() => void ask(instruction || "공가 활용 계획의 누락과 행정 절차를 점검해줘")}>{reviewing ? <><LoaderCircle className="spin"/> 검토 중...</> : "에이전트에게 묻기"}</button>{review && <div className="document-review"><p>{review.summary}</p>{review.findings.map((item, index) => <div className="review-finding" key={`${item.title}-${index}`}><span>{item.level}</span><b>{item.title}</b><small>{item.detail}</small></div>)}{!!review.requiredDocuments.length && <div className="document-guides"><b>필요 서식</b>{review.requiredDocuments.map((item) => <div key={item.name}><span>{item.status}</span><strong>{item.name}</strong><small>{item.reason}</small></div>)}</div>}{!!review.questions.length && <div className="document-questions"><b>확인 질문</b><ol>{review.questions.map((question) => <li key={question}>{question}</li>)}</ol></div>}{review.rewrite && <div className="review-rewrite"><b>{instruction.includes("행동 강령") ? "행동 강령 교체안" : "수정 제안"}</b><p>{review.rewrite}</p><button type="button" className="copy-rewrite" onClick={() => void copyRewrite()}><Clipboard size={14}/>{instruction.includes("행동 강령") ? "교체안 복사" : "수정안 복사"}</button></div>}<b>다음 확인</b><ol>{review.nextActions.map((action) => <li key={action}>{action}</li>)}</ol></div>}</aside>
    </div>
  </div></main>;
}

export default function DocumentsPage() {
  return <Suspense fallback={<main className="document-page"><div className="shell market-empty"><span className="session-loader"/><p>문서 작업 공간을 준비하고 있습니다.</p></div></main>}><DocumentsContent/></Suspense>;
}
