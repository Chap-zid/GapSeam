"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { MatchStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: MatchStatus }) {
  const map = { candidate: "검토 중", proposed: "제안 도착", applied: "신청 검토 중", accepted: "매칭 성사", rejected: "종료" };
  return <span className={`status-badge ${status}`}>{map[status]}</span>;
}

export function MatchStatus({ status }: { status: MatchStatus }) {
  if (status === "accepted") return <div className="status-panel success"><span className="status-icon"><Check /></span><div><b>매칭이 성사되었습니다.</b><p>이용자와 세부 일정 및 이용 조건을 조율해보세요.</p></div></div>;
  if (status === "rejected") return <div className="status-panel muted"><span className="status-icon"><X /></span><div><b>이번 연결은 성사되지 않았습니다.</b><p>조건에 맞는 다른 이용자를 계속 찾아보겠습니다.</p></div></div>;
  if (status === "applied") return <div className="status-panel waiting"><span className="pulse-dot"/><div><b>공간 이용 신청이 전달되었습니다.</b><p>공간 소유자의 응답을 기다리고 있습니다.</p></div></div>;
  return <div className="status-panel waiting"><span className="pulse-dot"/><div><b>연결 요청을 보냈습니다.</b><p>이용자의 응답을 기다리고 있습니다. 상태는 실시간으로 반영됩니다.</p></div></div>;
}

// 소유자가 AI 추정 이용료를 확인하고 확정해야 제안이 나갑니다. AI 값이 그대로 전달되지 않습니다.
export function ConfirmModal({ open, onClose, onConfirm, loading, target, price, onPriceChange }: { open: boolean; onClose: () => void; onConfirm: () => void; loading?: boolean; target?: string; price?: string; onPriceChange?: (value: string) => void }) {
  if (!open) return null;
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal">
    <div className="modal-icon">이음</div><h2>{target || "이 이용자"}에<br/>공간 활용 제안을 보낼까요?</h2>
    <p>보내기 전에 이용료를 확인해주세요. 아래 금액이 이용자에게 전달됩니다.</p>
    <label className="price-approve">
      <span>이용자에게 전달할 이용료</span>
      <input value={price ?? ""} onChange={(event) => onPriceChange?.(event.target.value)} placeholder="예: 월 35~45만 원" />
      <small>에이전트가 제안한 참고 금액입니다. 그대로 두거나 직접 고칠 수 있습니다.</small>
    </label>
    <div className="share-list"><span>공간 위치</span><span>면적</span><span>확정 이용료</span><span>공간 특징</span></div>
    <p className="modal-note">수락 전에는 연락처가 공개되지 않으며, 이 제안만으로 계약이 성립하지 않습니다.</p>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>취소</button><button className="button" disabled={loading || !(price ?? "").trim()} onClick={onConfirm}>{loading ? "보내는 중..." : "확인하고 제안 보내기"}</button></div>
  </div></div>;
}

// 점수가 툭 나타나지 않고 계산되듯 올라가게 합니다.
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const start = performance.now();
    const step = (now: number) => {
      if (reduced) { setShown(value); return; }
      const progress = Math.min((now - start) / duration, 1);
      // 처음엔 빠르게 올라가다 끝에서 천천히 멈춥니다.
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    let frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <span className="count-up">{shown}</span>;
}
