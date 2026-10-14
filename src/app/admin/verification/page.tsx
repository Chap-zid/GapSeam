"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FileCheck2, FileText, LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { auth } from "@/lib/firebase";
import { loadOwnerProof, reviewOwnerVerification, watchOwnerVerificationQueue, type OwnerVerificationReview } from "@/lib/services";

type ReviewFilter = "all" | "pending" | "verified" | "rejected";

function dateLabel(value: unknown) {
  if (!value) return "시간 정보 없음";
  const timestamp = value as { toDate?: () => Date; seconds?: number };
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : typeof timestamp.seconds === "number" ? new Date(timestamp.seconds * 1000) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "시간 정보 없음" : date.toLocaleString("ko-KR");
}

export default function OwnerVerificationAdminPage() {
  const { user, ready } = useSession();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [items, setItems] = useState<OwnerVerificationReview[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const previewUrls = useRef<string[]>([]);

  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    let active = true;
    let stop = () => {};
    if (!ready) return;
    if (!user || !auth?.currentUser) { void Promise.resolve().then(() => { if (active) setChecking(false); }); return () => { active = false; }; }
    void auth.currentUser.getIdTokenResult().then((token) => {
      if (!active) return;
      if (token.claims.admin !== true) { setChecking(false); return; }
      setAuthorized(true);
      stop = watchOwnerVerificationQueue(setItems, (reason) => {
        if (active) { setError(reason.message); setChecking(false); }
      });
      setChecking(false);
    }).catch(() => { if (active) { setError("관리자 권한을 확인하지 못했습니다. 다시 로그인해주세요."); setChecking(false); } });
    return () => { active = false; stop(); };
  }, [ready, user]);

  async function openProof(item: OwnerVerificationReview, path: string) {
    const key = `${item.id}:${path}`;
    if (previews[key]) return;
    setBusyId(key); setError("");
    try {
      const url = await loadOwnerProof(item.spaceId, item.ownerId, path);
      previewUrls.current.push(url);
      setPreviews((current) => ({ ...current, [key]: url }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "서류를 안전하게 열지 못했습니다."); }
    finally { setBusyId(""); }
  }

  async function decide(item: OwnerVerificationReview, status: "verified" | "rejected") {
    if (!user || busyId) return;
    const note = notes[item.id]?.trim() || "";
    if (status === "rejected" && !note) { setError("반려 사유를 입력해주세요."); return; }
    setBusyId(item.id); setError("");
    try { await reviewOwnerVerification(item.spaceId, user.uid, status, note); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "검토 결과를 저장하지 못했습니다."); }
    finally { setBusyId(""); }
  }

  const visible = items.filter((item) => filter === "all" || item.status === filter);
  const counts = {
    pending: items.filter((item) => item.status === "pending").length,
    verified: items.filter((item) => item.status === "verified").length,
    rejected: items.filter((item) => item.status === "rejected").length,
  };

  if (checking || !ready) return <main className="page"><div className="shell market-empty"><span className="session-loader"/><p>관리자 권한을 확인하고 있습니다.</p></div></main>;
  if (!authorized) return <main className="page"><div className="shell market-empty"><ShieldAlert/><b>관리자 전용 화면입니다.</b><p>Firebase Auth의 admin 커스텀 클레임이 있는 계정만 접근할 수 있습니다.</p><Link className="button small" href="/">홈으로</Link></div></main>;

  return <main className="page admin-review-page"><div className="shell">
    <header className="admin-review-head"><div><p className="eyebrow">운영자 검토</p><h1>소유자 서류 확인</h1><p>공간 주소와 공적 서류의 소유자 이름을 대조하고 결과와 근거를 기록하세요.</p></div><span className="admin-claim"><ShieldCheck size={17}/>관리자 인증됨</span></header>
    <div className="admin-review-summary"><div><span>검토 대기</span><b>{counts.pending}</b></div><div><span>확인 완료</span><b>{counts.verified}</b></div><div><span>보완 요청</span><b>{counts.rejected}</b></div></div>
    <nav className="admin-review-filters" aria-label="검토 상태 필터">{(["pending", "all", "verified", "rejected"] as ReviewFilter[]).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "pending" ? "대기" : value === "all" ? "전체" : value === "verified" ? "확인 완료" : "보완 요청"}</button>)}</nav>
    {error && <p className="login-error" role="alert">{error}</p>}
    <div className="admin-review-list">{visible.length === 0 ? <div className="admin-review-empty"><FileCheck2/><b>{filter === "pending" ? "검토 대기 서류가 없습니다." : "표시할 제출 서류가 없습니다."}</b></div> : visible.map((item) => <article className="admin-review-item" key={item.id}>
      <header><div><span className={`status-badge ${item.status === "verified" ? "accepted" : item.status === "rejected" ? "rejected" : "proposed"}`}>{item.status === "verified" ? "확인 완료" : item.status === "rejected" ? "보완 요청" : "검토 대기"}</span><h2>{item.legalName}</h2><p>공간 ID {item.spaceId} · 제출 {dateLabel(item.submittedAt)}</p></div><Link href={`/spaces/${item.spaceId}`} target="_blank" rel="noreferrer">공개 공간 정보 열기</Link></header>
      <div className="admin-review-meta"><span>소유자 계정 ID</span><code>{item.ownerId}</code><span>서류 수</span><b>{item.proofPaths.length}개</b></div>
      <div className="admin-proof-list">{item.proofPaths.map((path) => {
        const key = `${item.id}:${path}`; const url = previews[key]; const filename = path.split("/").at(-1)?.replace(/^\d+-\d+-/, "") || "첨부 서류";
        return <section className="admin-proof" key={path}><div className="admin-proof-title"><FileText size={17}/><b>{filename}</b><button type="button" disabled={busyId === key} onClick={() => void openProof(item, path)}>{busyId === key ? <LoaderCircle className="spin" size={15}/> : url ? "서류 열림" : "보안 확인 후 열기"}</button></div>{url && (filename.toLowerCase().endsWith(".pdf") ? <iframe title={`${filename} 미리보기`} src={url}/> : <Image src={url} alt={`${filename} 미리보기`} width={900} height={650} unoptimized/>)}</section>;
      })}</div>
      {item.reviewNote && <p className="admin-review-note-existing"><b>이전 검토 메모</b>{item.reviewNote}</p>}
      {item.status !== "verified" && <div className="admin-review-decision"><label>검토 근거 및 보완 사유<textarea maxLength={1000} value={notes[item.id] ?? (item.status === "rejected" ? item.reviewNote : "")} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="서류 이름·주소 일치 여부와 확인 근거를 기록하세요. 반려 시 소유자가 보완할 내용을 구체적으로 적어주세요."/></label><div><button type="button" className="button secondary" disabled={busyId === item.id} onClick={() => void decide(item, "rejected")}>보완 요청</button><button type="button" className="button" disabled={busyId === item.id} onClick={() => void decide(item, "verified")}>{busyId === item.id ? "저장 중..." : "소유 확인 완료"}</button></div></div>}
    </article>)}</div>
    <aside className="admin-review-guideline"><b>검토 기준</b><p>공간 주소와 서류 소재지, 제출자 이름과 소유자 이름이 일치하는지 확인합니다. 공동소유·대리 제출·주소 불일치는 추가 자료를 요청하세요. 이 확인은 제출 서류의 대조 기록이며 법률상 권리나 실제 소유권을 보증하지 않습니다. 주민등록번호 등 불필요한 민감정보를 검토 메모에 복사하지 마세요.</p></aside>
  </div></main>;
}