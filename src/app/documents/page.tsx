"use client";

import { ArrowLeft, Bot, Clipboard, Download, FileCheck2, FileText, LoaderCircle, Plus, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { ChangeEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";

type DocumentItem = { id: string; name: string; updatedAt: string; size: number; text: string; matchId?: string };
type Finding = { level: string; title: string; detail: string };
type Review = { summary: string; findings: Finding[]; rewrite: string; nextActions: string[] };
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
    <div className="document-head reveal"><div><p className="eyebrow">공가 문서 도우미</p><h1>행동 강령의 공가 조항만 고치세요</h1><p>원본 DOCX를 직접 편집하고, 에이전트가 공가 활용과 직접 연결된 행동 강령 문장만 교체안으로 제시합니다.</p></div><label className="button document-upload"><Upload size={17}/>{uploading ? "업로드 중..." : "DOCX 파일 선택"}<input type="file" accept=".docx" onChange={upload} disabled={uploading}/></label></div>
    {error && <div className="document-alert" role="alert"><ShieldCheck size={18}/>{error}</div>}
    <div className="document-workspace">
      <aside className="document-list"><div className="document-list-title"><b>{matchId ? "공동 문서" : "최근 문서"}</b><label title="문서 추가"><Plus size={18}/><input type="file" accept=".docx" onChange={upload}/></label></div>{loading ? <p className="document-empty">불러오는 중...</p> : documents.length === 0 ? <div className="document-empty"><FileText/><b>아직 문서가 없습니다</b><span>{matchId ? "채팅 참여자와 편집할 DOCX 문서를 올려보세요." : "DOCX 계획서를 올려 시작하세요."}</span></div> : documents.map((item) => <button key={item.id} className={current?.id === item.id ? "active" : ""} onClick={() => void openDocument(item)}><FileText size={18}/><span><b>{item.name}</b><small>{new Date(item.updatedAt).toLocaleDateString("ko-KR")} · {Math.max(1, Math.round(item.size / 1024))}KB</small></span></button>)}</aside>
      <section className="document-editor-card"><div className="document-toolbar"><div><FileCheck2 size={17}/><b>{current?.name || "문서를 선택해주세요"}</b><span>자동 저장</span></div>{current && <a className="text-button" href={`/api/documents/${current.id}/file`} download><Download size={16}/> 내려받기</a>}</div><div className="document-editor">{current ? <div id="onlyoffice-editor"/> : <div className="document-editor-placeholder"><FileText/><b>편집할 문서를 선택하세요</b><span>Docker의 ONLYOFFICE 편집기에서 원본 DOCX를 그대로 수정합니다.</span></div>}</div></section>
      <aside className="document-agent"><div className="document-agent-head"><span><Bot size={19}/></span><div><b>행동 강령 교체</b><small>공가 관련 조항만</small></div></div><p className="agent-disclaimer">공가와 무관한 행동 강령은 건드리지 않습니다. 교체안은 편집기에서 직접 확인 후 적용합니다.</p><div className="document-quick"><button onClick={() => void ask("문서에서 공가 활용과 직접 관련된 행동 강령 조항만 찾아 교체안을 작성해줘")}><ShieldCheck/>공가 조항 찾기</button></div><label>교체할 행동 강령 문장<textarea value={selection} onChange={(e) => setSelection(e.target.value)} placeholder="문서에서 선택한 공가 관련 행동 강령을 붙여 넣으세요."/></label><label>교체 기준<textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="예: 주민 협의와 안전 책임을 분명히 해줘"/></label><button className="button document-ask" disabled={!current || reviewing} onClick={() => void ask(instruction || "문서에서 공가 활용과 직접 관련된 행동 강령 조항만 찾아 교체안을 작성해줘")}>{reviewing ? <><LoaderCircle className="spin"/> 교체안 작성 중...</> : "공가 조항 교체안 만들기"}</button>{review && <div className="document-review"><p>{review.summary}</p>{review.findings.map((item, index) => <div className="review-finding" key={`${item.title}-${index}`}><span>{item.level}</span><b>{item.title}</b><small>{item.detail}</small></div>)}{review.rewrite && <div className="review-rewrite"><b>교체안</b><p>{review.rewrite}</p><button type="button" className="copy-rewrite" onClick={() => void copyRewrite()}><Clipboard size={14}/>교체안 복사</button></div>}<b>다음 단계</b><ol>{review.nextActions.map((action) => <li key={action}>{action}</li>)}</ol></div>}</aside>
    </div>
  </div></main>;
}

export default function DocumentsPage() {
  return <Suspense fallback={<main className="document-page"><div className="shell market-empty"><span className="session-loader"/><p>문서 작업 공간을 준비하고 있습니다.</p></div></main>}><DocumentsContent/></Suspense>;
}
