"use client";

import Link from "next/link";
import { ArrowLeft, Building2, FileText, MessageCircle, Send, ShieldCheck, Users } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { StatusBadge } from "@/components/ui";
import { getRequest, getSpace, sendChatMessage, watchChat, watchMatch } from "@/lib/services";
import type { ChatMessage, Space, SpaceMatch, SpaceRequest } from "@/lib/types";

function timeLabel(value: unknown) {
  if (!value) return "방금";
  const candidate = value as { toDate?: () => Date; seconds?: number };
  const date = typeof candidate.toDate === "function" ? candidate.toDate() : candidate.seconds ? new Date(candidate.seconds * 1000) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "방금" : date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!user) return; return watchMatch(id, setMatch); }, [id, user]);
  useEffect(() => {
    if (!match) return;
    void Promise.all([getSpace(match.spaceId), getRequest(match.requestId)]).then(([spaceData, requestData]) => { setSpace(spaceData); setRequest(requestData); });
    if (match.status !== "accepted") return;
    return watchChat(id, setMessages);
  }, [id, match]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !text.trim() || sending) return;
    setSending(true); setError("");
    try { await sendChatMessage(id, user, text); setText(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "메시지를 보내지 못했습니다."); }
    finally { setSending(false); }
  }

  if (!ready || !user || !match) return <main className="page"><div className="shell market-empty"><span className="session-loader"/><p>연결 정보를 확인하고 있습니다.</p></div></main>;
  if (match.status !== "accepted") return <main className="page"><div className="shell market-empty"><MessageCircle/><b>매칭이 성사된 뒤 채팅이 열립니다.</b><p>상대방의 응답을 기다리거나 대시보드에서 현재 상태를 확인해주세요.</p><Link className="button small" href={`/${user.role}/dashboard`}>대시보드로</Link></div></main>;

  return <main className="page match-room-page"><div className="shell">
    <div className="match-room-top"><Link href={`/${user.role}/dashboard`}><ArrowLeft size={16}/> 대시보드</Link><StatusBadge status={match.status}/></div>
    <header className="match-room-head reveal"><div><p className="eyebrow">매칭 전용 협의 공간</p><h1>{space?.address || "공간 연결"}</h1><p>{request?.seekerName || "이용자"} · {request?.purpose || "공간 이용"} · 적합도 {match.score}%</p></div><Link className="button" href={`/documents?matchId=${encodeURIComponent(id)}`}><FileText size={18}/> 공동 문서 열기</Link></header>
    <div className="match-room-layout"><section className="chat-card"><div className="chat-title"><div><MessageCircle/><span><b>실시간 대화</b><small>매칭 참여자만 볼 수 있습니다.</small></span></div><span className="live-chip">실시간 연결</span></div><div className="chat-log">
      {messages.length === 0 ? <div className="chat-empty"><Users/><b>첫 메시지를 보내보세요.</b><p>방문 일정, 이용료, 정비 범위처럼 합의가 필요한 내용을 대화로 정리할 수 있습니다.</p></div> : messages.map((message) => <div className={`chat-message ${message.senderId === user.uid ? "mine" : "theirs"}`} key={message.id}><div><b>{message.senderId === user.uid ? "나" : message.senderName}</b><time>{timeLabel(message.createdAt)}</time></div><p>{message.text}</p></div>)}<div ref={endRef}/>
    </div>{error && <p className="login-error chat-error" role="alert">{error}</p>}<form className="chat-compose" onSubmit={submit}><textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} placeholder="상대방에게 보낼 메시지를 입력하세요."/><button className="button" disabled={sending || !text.trim()} aria-label="메시지 보내기"><Send size={18}/></button></form></section>
      <aside className="match-room-side"><section className="content-card"><div className="card-title"><h2>협의 정보</h2></div><div className="card-pad match-context"><div><Building2/><span>공간<b>{space?.buildingType || "-"} · {space?.area || "-"}㎡</b></span></div><div><Users/><span>이용 목적<b>{request?.purpose || "-"}</b></span></div><div><ShieldCheck/><span>예상 이용료<b>{match.approvedPrice || space?.analysis?.estimatedPrice || "협의"}</b></span></div></div></section><section className="document-bridge"><FileText/><h2>대화 내용을 문서로 구체화하세요.</h2><p>기존 문서 도우미에서 활용 계획서와 협의 문서를 함께 편집하고, 누락된 인허가·안전·일정 항목을 검토할 수 있습니다.</p><Link className="button full-button" href={`/documents?matchId=${encodeURIComponent(id)}`}>공동 문서 작업 시작</Link><small>문서 수정은 계약 확정이 아니며 최종 내용은 양측이 직접 확인해야 합니다.</small></section></aside>
    </div>
  </div></main>;
}
