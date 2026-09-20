"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { auth } from "@/lib/firebase";
import { FIELD_LABELS, OPENING_LINE, QUICK_PROMPTS, extractFields, fallbackReply, missingFields, type AssistFields, type AssistKind, type AssistTurn } from "@/lib/assist";

type Message = AssistTurn & { id: string; filled?: string[] };

// 에이전트가 값을 한 번에 쏟아붓지 않고 항목을 하나씩 채워 넣는 간격입니다.
const FILL_INTERVAL = 320;

export function AgentAssistant({ kind, values, onFill }: { kind: AssistKind; values: AssistFields; onFill: (field: keyof AssistFields, value: AssistFields[keyof AssistFields]) => void }) {
  const [messages, setMessages] = useState<Message[]>([{ id: "opening", role: "assistant", content: OPENING_LINE[kind] }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [source, setSource] = useState<"openai" | "fallback" | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const latestValues = useRef(values);
  const timers = useRef<number[]>([]);

  useEffect(() => { latestValues.current = values; }, [values]);
  useEffect(() => () => { timers.current.forEach((timer) => window.clearTimeout(timer)); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  // 채울 항목을 순서대로 하나씩 반영해 에이전트가 양식을 적어 넣는 것처럼 보이게 합니다.
  const applyFields = useCallback((fields: AssistFields) => {
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined && value !== "" && value !== 0) as [keyof AssistFields, AssistFields[keyof AssistFields]][];
    if (!entries.length) return [];
    setFilling(true);
    entries.forEach(([key, value], index) => {
      const timer = window.setTimeout(() => {
        onFill(key, value);
        if (index === entries.length - 1) setFilling(false);
      }, index * FILL_INTERVAL);
      timers.current.push(timer);
    });
    return entries.map(([key]) => String(key));
  }, [onFill]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    const history = messages.map((message) => ({ role: message.role, content: message.content }));
    setMessages((old) => [...old, { id: `u-${Date.now()}`, role: "user", content: question }]);
    setBusy(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required");
      const response = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, message: question, history, current: latestValues.current }),
      });
      if (!response.ok) throw new Error(`Assist endpoint ${response.status}`);
      const result = await response.json() as { reply?: string; fields?: AssistFields; source?: "openai" | "fallback" };
      const filled = applyFields(result.fields || {});
      setSource(result.source === "openai" ? "openai" : "fallback");
      setMessages((old) => [...old, { id: `a-${Date.now()}`, role: "assistant", content: result.reply || "내용을 반영했습니다.", filled }]);
    } catch {
      // 네트워크나 모델이 막혀도 대화가 끊기지 않도록 브라우저에서 규칙 기반으로 채웁니다.
      const fields = extractFields(kind, question, latestValues.current);
      const filled = applyFields(fields);
      setSource("fallback");
      setMessages((old) => [...old, { id: `a-${Date.now()}`, role: "assistant", content: fallbackReply(kind, filled, missingFields(kind, { ...latestValues.current, ...fields })), filled }]);
    } finally {
      setBusy(false);
    }
  }, [applyFields, busy, kind, messages]);

  const missing = missingFields(kind, values);
  const ready = missing.length === 0;

  return <section className="assist-panel" aria-label="빈틈이음 에이전트 대화">
    <header className="assist-head">
      <span className="assist-avatar"><Sparkles size={15} /></span>
      <div>
        <b>빈틈이음 에이전트</b>
        <small>{filling ? "양식을 채우는 중" : busy ? "내용을 검토하는 중" : "대화로 양식을 채워드려요"}</small>
      </div>
      {source && <span className={`engine-badge ${source}`}>{source === "openai" ? "실시간 모델" : "안정 모드"}</span>}
    </header>

    <div className="assist-log" ref={logRef}>
      {messages.map((message) => <div key={message.id} className={`assist-msg ${message.role}`}>
        <p>{message.content}</p>
        {!!message.filled?.length && <div className="assist-filled">{message.filled.map((field) => <span key={field}>{FIELD_LABELS[field] || field} 입력됨</span>)}</div>}
      </div>)}
      {busy && <div className="assist-msg assistant"><span className="assist-typing"><i /><i /><i /></span></div>}
    </div>

    <div className="assist-progress">
      <div className="assist-progress-bar"><span style={{ width: `${Math.round(((4 - Math.min(missing.length, 4)) / 4) * 100)}%` }} /></div>
      <small>{ready ? "필수 항목이 모두 준비됐습니다." : `남은 필수 항목 · ${missing.map((field) => FIELD_LABELS[field] || field).join(", ")}`}</small>
    </div>

    {messages.length <= 1 && <div className="assist-quick">{QUICK_PROMPTS[kind].map((prompt) => <button type="button" key={prompt} onClick={() => void send(prompt)}>{prompt}</button>)}</div>}

    <form className="assist-input" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
      <textarea
        value={input}
        rows={2}
        placeholder="예: 대전 동구에 안 쓰는 1층 주택이 있어요"
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }}
      />
      <button type="submit" aria-label="보내기" disabled={busy || !input.trim()}><ArrowUp size={17} /></button>
    </form>
    <p className="assist-note">에이전트가 채운 값은 언제든 직접 수정할 수 있습니다.</p>
  </section>;
}
