"use client";

import Link from "next/link";
import { ArrowLeft, Building2, ClipboardCheck, FileText, Handshake, MessageCircle, Send, ShieldCheck, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { StatusBadge } from "@/components/ui";
import { auth } from "@/lib/firebase";
import { BROKER_NAME, agendaProgress, paperChecklist, trackAgenda } from "@/lib/broker";
import { getRequest, getSpace, sendBrokerMessage, sendChatMessage, watchChat, watchMatch } from "@/lib/services";
import type { ChatMessage, Space, SpaceMatch, SpaceRequest } from "@/lib/types";

function timeLabel(value: unknown) {
  if (!value) return "방금";
  const candidate = value as { toDate?: () => Date; seconds?: number };
  const date = typeof candidate.toDate === "function" ? candidate.toDate() : candidate.seconds ? new Date(candidate.seconds * 1000) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "방금" : date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL = { agreed: "정리됨", discussing: "논의 중", open: "미시작" } as const;

export default function MatchChatPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useSession();
  const [match, setMatch] = useState<SpaceMatch | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [request, setRequest] = useState<SpaceRequest | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [brokerBusy, setBrokerBusy] = useState(false);
  const [brokerError, setBrokerError] = useState("");
  const [brokerSource, setBrokerSource] = useState<"openai" | "fallback" | null>(null);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLFormElement>(null);

  useEffect(() => { if (!user) return; return watchMatch(id, setMatch); }, [id, user]);
  useEffect(() => {
    if (!match) return;
    void Promise.all([getSpace(match.spaceId), getRequest(match.requestId)]).then(([spaceData, requestData]) => { setSpace(spaceData); setRequest(requestData); });
    if (match.status !== "accepted") return;
    return watchChat(id, setMessages);
  }, [id, match]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // 협의 진행 상황은 모델을 부르지 않고 대화 내용에서 규칙으로 계산해 바로 반영합니다.
  const agenda = useMemo(() => trackAgenda(messages), [messages]);
  const progress = agendaProgress(agenda);
  const checklist = useMemo(() => paperChecklist(space, request), [space, request]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !text.trim() || sending) return;
    setSending(true); setError("");
    try { await sendChatMessage(id, user, text); setText(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "메시지를 보내지 못했습니다."); }
    finally { setSending(false); }
  }

  async function askBroker() {
    if (!user || brokerBusy) return;
    setBrokerBusy(true); setBrokerError("");
    try {
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch("/api/broker", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ matchId: id, match, space, request, messages }),
      });
      if (!response.ok) throw new Error("중개 에이전트를 부르지 못했습니다. 잠시 후 다시 시도해주세요.");
      const data = await response.json() as { briefing?: { reply?: string; nextSteps?: string[] }; source?: "openai" | "fallback" };
      setBrokerSource(data.source === "openai" ? "openai" : "fallback");
      setNextSteps(data.briefing?.nextSteps || []);
      // 에이전트 발언은 대화 기록에 남아 양측이 같은 내용을 봅니다.
      if (data.briefing?.reply) await sendBrokerMessage(id, user, data.briefing.reply);
    } catch (reason) { setBrokerError(reason instanceof Error ? reason.message : "중개 에이전트 호출에 실패했습니다."); }
    finally { setBrokerBusy(false); }
  }

  if (!ready || !user || !match) return <main className="page"><div className="shell market-empty"><span className="session-loader"/><p>연결 정보를 확인하고 있습니다.</p></div></main>;
  if (match.status !== "accepted") return <main className="page"><div className="shell market-empty"><MessageCircle/><b>매칭이 성사된 뒤 채팅이 열립니다.</b><p>상대방의 응답을 기다리거나 대시보드에서 현재 상태를 확인해주세요.</p><Link className="button small" href={`/${user.role}/dashboard`}>대시보드로</Link></div></main>;

  return <main className="page match-room-page"><div className="shell">
    <div className="match-room-top"><Link href={`/${user.role}/dashboard`}><ArrowLeft size={16}/> 대시보드</Link><StatusBadge status={match.status}/></div>
    <header className="match-room-head reveal"><div><p className="eyebrow">매칭 전용 협의 공간</p><h1>{space?.address || "공간 연결"}</h1><p>{request?.seekerName || "이용자"} · {request?.purpose || "공간 이용"} · 적합도 {match.score}%</p></div><Link className="button" href={`/matches/${id}/document`}><FileText size={18}/> 공동 문서 열기</Link></header>
    <div className="match-room-layout"><section className="chat-card"><div className="chat-title"><div><MessageCircle/><span><b>실시간 대화</b><small>매칭 참여자와 중개 에이전트가 함께 있습니다.</small></span></div><span className="live-chip">실시간 연결</span></div><div className="chat-log">
      {messages.length === 0 ? <div className="chat-empty"><Users/><b>첫 메시지를 보내보세요.</b><p>방문 일정, 이용료, 정비 범위처럼 합의가 필요한 내용을 대화로 정리할 수 있습니다. 중개 에이전트에게 진행 정리를 맡길 수도 있습니다.</p></div> : messages.map((message) => message.role === "agent"
        ? <div className="chat-broker" key={message.id}><div className="chat-broker-head"><Handshake size={15}/><b>{message.senderName || BROKER_NAME}</b><time>{timeLabel(message.createdAt)}</time></div><p>{message.text}</p><small>중개 진행을 돕는 안내이며, 법률 판단이나 계약 확정이 아닙니다.</small></div>
        : <div className={`chat-message ${message.senderId === user.uid ? "mine" : "theirs"}`} key={message.id}><div><b>{message.senderId === user.uid ? "나" : message.senderName}</b><time>{timeLabel(message.createdAt)}</time></div><p>{message.text}</p></div>)}<div ref={endRef}/>
    </div>{error && <p className="login-error chat-error" role="alert">{error}</p>}<form ref={composeRef} className="chat-compose" onSubmit={submit}><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();composeRef.current?.requestSubmit();} }} maxLength={1000} placeholder="메시지 입력 · Enter 전송 · Shift+Enter 줄바꿈"/><button className="button" disabled={sending || !text.trim()} aria-label="메시지 보내기"><Send size={18}/></button></form></section>

      <aside className="match-room-side">
        <section className="broker-card">
          <div className="broker-head"><span className="broker-avatar"><Handshake size={16}/></span><div><b>{BROKER_NAME}</b><small>양측 사이에서 협의 진행을 돕습니다.</small></div>{brokerSource && <span className={`engine-badge ${brokerSource}`}>{brokerSource === "openai" ? "실시간 모델" : "안정 모드"}</span>}</div>
          <div className="broker-progress"><div className="assist-progress-bar"><span style={{ width: `${progress}%` }}/></div><small>협의 진행률 {progress}% · 6개 항목 중 {agenda.filter((item) => item.status === "agreed").length}개 정리됨</small></div>
          <ul className="broker-agenda">{agenda.map((item) => <li key={item.key} className={item.status}><span className="broker-dot"/><div><b>{item.label}</b><small>{STATUS_LABEL[item.status]} · {item.note}</small></div></li>)}</ul>
          {brokerError && <p className="login-error" role="alert">{brokerError}</p>}
          <button type="button" className="button full-button" onClick={askBroker} disabled={brokerBusy}>{brokerBusy ? "대화를 정리하는 중..." : "중개 에이전트에게 정리 요청"}</button>
          {nextSteps.length > 0 && <div className="broker-next"><b><ClipboardCheck size={14}/> 다음에 정할 것</b><ol>{nextSteps.map((step) => <li key={step}>{step}</li>)}</ol></div>}
          <div className="broker-papers"><b>확인하면 좋은 서류</b><ul>{checklist.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <p className="broker-note">중개 에이전트는 진행 정리와 확인 항목 안내만 합니다. 권리관계 해석, 법률 자문, 계약 효력 판단은 하지 않으며 필요하면 공인중개사·전문가에게 확인해주세요.</p>
        </section>

        <section className="content-card"><div className="card-title"><h2>협의 정보</h2></div><div className="card-pad match-context"><div><Building2/><span>공간<b>{space?.buildingType || "-"} · {space?.area || "-"}㎡</b></span></div><div><Users/><span>이용 목적<b>{request?.purpose || "-"}</b></span></div><div><ShieldCheck/><span>예상 이용료<b>{match.approvedPrice || space?.analysis?.estimatedPrice || "협의"}</b></span></div></div></section>
        <section className="document-bridge"><FileText/><h2>대화 내용을 문서로 구체화하세요.</h2><p>Firestore로 양쪽 기기에 즉시 반영되는 협의 문서를 함께 작성하고, 문서 도우미로 누락된 인허가·안전·일정 항목을 검토할 수 있습니다.</p><Link className="button full-button" href={`/matches/${id}/document`}>공동 문서 작업 시작</Link><Link className="document-advanced-link" href={`/documents?matchId=${encodeURIComponent(id)}`}>DOCX 고급 편집 열기</Link><small>문서 수정은 계약 확정이 아니며 최종 내용은 양측이 직접 확인해야 합니다.</small></section>
      </aside>
    </div>
  </div></main>;
}
