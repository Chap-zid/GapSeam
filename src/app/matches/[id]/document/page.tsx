"use client";

import Link from "next/link";
import { ArrowLeft, Bot, Check, FileCheck2, FileText, LoaderCircle, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";
import { auth } from "@/lib/firebase";
import { saveMatchDocument, watchMatch, watchMatchDocument } from "@/lib/services";
import type { MatchDocument, SpaceMatch } from "@/lib/types";

type Finding = { level: string; title: string; detail: string };
type Review = { summary: string; findings: Finding[]; rewrite: string; nextActions: string[] };

const TEMPLATE = `1. 공간 및 이용 목적
- 대상 공간:
- 활용 목적:

2. 이용 조건
- 이용 기간:
- 예상 이용료:
- 관리비 및 공과금:

3. 정비와 관리 범위
- 소유자 담당:
- 이용자 담당:

4. 일정 및 확인 사항
- 현장 방문 일정:
- 인허가·안전 확인:
- 다음 협의 일정:`;

function updatedLabel(value: unknown) {
  if (!value) return "아직 저장되지 않음";
  const candidate = value as { toDate?: () => Date; seconds?: number };
  const date = typeof candidate.toDate === "function" ? candidate.toDate() : candidate.seconds ? new Date(candidate.seconds * 1000) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "방금 저장됨" : date.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MatchDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useSession();
  const [match, setMatch] = useState<SpaceMatch | null>(null);
  const [remote, setRemote] = useState<MatchDocument | null>(null);
  const [title, setTitle] = useState("공간 활용 공동 협의서");
  const [content, setContent] = useState(TEMPLATE);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [remotePending, setRemotePending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [instruction, setInstruction] = useState("합의가 필요한 조건과 빠진 확인 사항을 찾아줘");
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => { if (!user) return; return watchMatch(id, setMatch); }, [id, user]);
  useEffect(() => {
    if (!user || match?.status !== "accepted") return;
    return watchMatchDocument(id, (item) => {
      setRemote(item);
      if (!item) return;
      if (dirtyRef.current && item.updatedBy !== user.uid) { setRemotePending(true); return; }
      setTitle(item.title); setContent(item.content || TEMPLATE); setRemotePending(false);
    });
  }, [id, match?.status, user]);

  function loadRemote() {
    if (!remote) return;
    setTitle(remote.title); setContent(remote.content || TEMPLATE); dirtyRef.current = false; setDirty(false); setRemotePending(false);
  }

  async function save() {
    if (!user || !match || saving) return;
    setSaving(true); setError("");
    try { await saveMatchDocument(id, user, title, content); dirtyRef.current = false; setDirty(false); setRemotePending(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "공동 문서를 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  async function ask() {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) { setError("다시 로그인한 뒤 문서 검토를 요청해주세요."); return; }
    setReviewing(true); setError("");
    try {
      const response = await fetch("/api/documents/review", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: content, instruction, selection: "" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "문서를 검토하지 못했습니다.");
      setReview(data.review as Review);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "문서를 검토하지 못했습니다."); }
    finally { setReviewing(false); }
  }

  if (!ready || !user || !match) return <main className="page"><div className="shell market-empty"><span className="session-loader"/><p>공동 문서 권한을 확인하고 있습니다.</p></div></main>;
  if (match.status !== "accepted") return <main className="page"><div className="shell market-empty"><FileText/><b>성사된 매칭에서만 공동 문서를 편집할 수 있습니다.</b><Link className="button small" href={`/${user.role}/dashboard`}>대시보드로</Link></div></main>;

  return <main className="page shared-document-page"><div className="shell">
    <div className="shared-doc-nav"><Link href={`/matches/${id}`}><ArrowLeft size={16}/> 채팅으로 돌아가기</Link><div><span className="live-chip">Firestore 실시간 동기화</span><Link href={`/documents?matchId=${encodeURIComponent(id)}`}>DOCX 고급 편집 <FileCheck2 size={15}/></Link></div></div>
    <header className="shared-doc-head reveal"><div><p className="eyebrow">매칭 공동 협의 문서</p><h1>대화에서 합의한 내용을 함께 정리하세요.</h1><p>저장할 때 상대방 화면에도 즉시 반영되며, 문서 도우미가 누락된 절차와 모호한 조건을 검토합니다.</p></div><button className="button" disabled={saving || !dirty} onClick={() => void save()}><Save size={17}/>{saving ? "저장 중..." : dirty ? "공유 저장" : "저장됨"}</button></header>
    {remotePending && <div className="document-alert"><RefreshCw size={17}/><span>상대방이 새 버전을 저장했습니다. 현재 작성 내용을 덮어쓸 수 있으니 확인 후 불러오세요.</span><button onClick={loadRemote}>새 버전 불러오기</button></div>}
    {error && <div className="document-alert" role="alert"><ShieldCheck size={17}/>{error}</div>}
    <div className="shared-doc-layout"><section className="shared-doc-editor"><div className="shared-doc-toolbar"><div><span className="sync-dot"/><span>{remote ? `${remote.updatedByName}님 수정 · ${updatedLabel(remote.updatedAt)}` : "첫 문서를 작성해주세요."}</span></div><small>{content.length.toLocaleString()} / 50,000자</small></div><input className="shared-doc-title" value={title} maxLength={120} onChange={(event) => { setTitle(event.target.value); dirtyRef.current = true; setDirty(true); }}/><textarea className="shared-doc-content" value={content} maxLength={50_000} onChange={(event) => { setContent(event.target.value); dirtyRef.current = true; setDirty(true); }}/><div className="shared-doc-foot"><span><Check size={14}/> 저장한 버전은 매칭 당사자만 볼 수 있습니다.</span><button className="button small" disabled={saving || !dirty} onClick={() => void save()}><Save size={15}/> 공유 저장</button></div></section>
      <aside className="shared-doc-agent"><div className="document-agent-head"><span><Bot size={19}/></span><div><b>문서 도우미</b><small>협의 조건·행정·안전 검토</small></div></div><p className="agent-disclaimer">검토 결과는 참고용이며 계약이나 법률 판단을 대신하지 않습니다.</p><div className="shared-doc-prompts">{["합의되지 않은 비용과 책임 범위를 찾아줘", "현장 방문 전에 확인할 항목을 정리해줘", "인허가·안전 절차의 누락을 점검해줘"].map((prompt) => <button key={prompt} onClick={() => setInstruction(prompt)}>{prompt}</button>)}</div><label>검토 요청<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)}/></label><button className="button full-button" disabled={reviewing || !content.trim()} onClick={() => void ask()}>{reviewing ? <><LoaderCircle className="spin"/> 검토 중...</> : "현재 문서 검토하기"}</button>{review && <div className="document-review"><p>{review.summary}</p>{review.findings.map((item, index) => <div className="review-finding" key={`${item.title}-${index}`}><span>{item.level}</span><b>{item.title}</b><small>{item.detail}</small></div>)}{review.rewrite && <div className="review-rewrite"><b>수정 제안</b><p>{review.rewrite}</p><button onClick={() => { setContent((old) => `${old}\n\n[문서 도우미 수정 제안]\n${review.rewrite}`); dirtyRef.current = true; setDirty(true); }}>문서에 덧붙이기</button></div>}<b>다음 확인</b><ol>{review.nextActions.map((action) => <li key={action}>{action}</li>)}</ol></div>}</aside>
    </div>
  </div></main>;
}
