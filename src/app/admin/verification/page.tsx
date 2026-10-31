"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FileCheck2, FileText, IdCard, LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { auth } from "@/lib/firebase";
import { getSpace, loadOwnerProof, reviewOwnerVerification, watchOwnerVerificationQueue, type OwnerVerificationChecks, type OwnerVerificationReview } from "@/lib/services";

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
  const [checks, setChecks] = useState<Record<string, OwnerVerificationChecks>>({});
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const previewUrls = useRef<string[]>([]);
  const requestedSpaces = useRef(new Set<string>());

  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  // 서류 소재지와 대조할 수 있도록 등록된 공간 주소를 함께 보여줍니다.
  useEffect(() => {
    items.forEach((item) => {
      if (requestedSpaces.current.has(item.spaceId)) return;
      requestedSpaces.current.add(item.spaceId);
      void getSpace(item.spaceId).then((space) => setAddresses((current) => ({ ...current, [item.spaceId]: space?.address || "삭제되었거나 찾을 수 없는 공간" }))).catch(() => setAddresses((current) => ({ ...current, [item.spaceId]: "주소를 불러오지 못했습니다" })));
    });
  }, [items]);

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

  const checksFor = (item: OwnerVerificationReview): OwnerVerificationChecks => checks[item.id] ?? item.checks ?? { idName: false, docName: false, address: false };
  const toggleCheck = (item: OwnerVerificationReview, key: keyof OwnerVerificationChecks) => setChecks((current) => { const base = current[item.id] ?? item.checks ?? { idName: false, docName: false, address: false }; return { ...current, [item.id]: { ...base, [key]: !base[key] } }; });

  async function decide(item: OwnerVerificationReview, status: "verified" | "rejected") {
    if (!user || busyId) return;
    const note = notes[item.id]?.trim() || "";
    if (status === "rejected" && !note) { setError("반려 사유를 입력해주세요."); return; }
    setBusyId(item.id); setError("");
    try { await reviewOwnerVerification(item.spaceId, user.uid, status, note, checksFor(item)); }
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
    <header className="admin-review-head"><div><p className="eyebrow">운영자 검토</p><h1>소유자 서류 확인</h1><p>신분증의 이름, 공적 서류의 소유자 이름, 서류 소재지와 공간 주소를 대조하고 결과와 근거를 기록하세요.</p></div><span className="admin-claim"><ShieldCheck size={17}/>관리자 인증됨</span></header>
    <div className="admin-review-summary"><div><span>검토 대기</span><b>{counts.pending}</b></div><div><span>확인 완료</span><b>{counts.verified}</b></div><div><span>보완 요청</span><b>{counts.rejected}</b></div></div>
    <nav className="admin-review-filters" aria-label="검토 상태 필터">{(["pending", "all", "verified", "rejected"] as ReviewFilter[]).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "pending" ? "대기" : value === "all" ? "전체" : value === "verified" ? "확인 완료" : "보완 요청"}</button>)}</nav>
    {error && <p className="login-error" role="alert">{error}</p>}
    <div className="admin-review-list">{visible.length === 0 ? <div className="admin-review-empty"><FileCheck2/><b>{filter === "pending" ? "검토 대기 서류가 없습니다." : "표시할 제출 서류가 없습니다."}</b></div> : visible.map((item) => {
      const idPaths = item.idPaths || []; const hasId = idPaths.length > 0; const itemChecks = checksFor(item); const allChecked = itemChecks.idName && itemChecks.docName && itemChecks.address; const address = addresses[item.spaceId] || "주소를 불러오는 중";
      const proofs = (paths: string[], kind: "id" | "doc") => paths.map((path) => {
        const key = `${item.id}:${path}`; const url = previews[key]; const filename = path.split("/").at(-1)?.replace(/^\d+-(?:id|doc)?\d+-/, "") || "첨부 서류";
        return <section className="admin-proof" key={path}><div className="admin-proof-title">{kind === "id" ? <IdCard size={17}/> : <FileText size={17}/>}<b>{filename}</b><button type="button" disabled={busyId === key} onClick={() => void openProof(item, path)}>{busyId === key ? <LoaderCircle className="spin" size={15}/> : url ? "서류 열림" : "보안 확인 후 열기"}</button></div>{url && (filename.toLowerCase().endsWith(".pdf") ? <iframe title={`${filename} 미리보기`} src={url}/> : <Image src={url} alt={`${filename} 미리보기`} width={900} height={650} unoptimized/>)}</section>;
      });
      return <article className="admin-review-item" key={item.id}>
      <header><div><span className={`status-badge ${item.status === "verified" ? "accepted" : item.status === "rejected" ? "rejected" : "proposed"}`}>{item.status === "verified" ? "확인 완료" : item.status === "rejected" ? "보완 요청" : "검토 대기"}</span><h2>{item.legalName}</h2><p>공간 ID {item.spaceId} · 제출 {dateLabel(item.submittedAt)}</p></div><Link href={`/spaces/${item.spaceId}`} target="_blank" rel="noreferrer">공개 공간 정보 열기</Link></header>
      <div className="admin-review-meta"><span>소유자 계정 ID</span><code>{item.ownerId}</code><span>등록 주소</span><b>{address}</b><span>첨부</span><b>신분증 {idPaths.length}개 · 소유 서류 {item.proofPaths.length}개</b></div>
      <div className="admin-proof-columns"><div><h3>신분증</h3>{hasId ? <div className="admin-proof-list">{proofs(idPaths, "id")}</div> : <p className="admin-proof-missing">신분증 없이 제출된 이전 신청입니다. 보완 요청으로 신분증 제출을 요청하세요.</p>}</div><div><h3>소유 증빙 서류</h3><div className="admin-proof-list">{proofs(item.proofPaths, "doc")}</div></div></div>
      {item.reviewNote && <p className="admin-review-note-existing"><b>이전 검토 메모</b>{item.reviewNote}</p>}
      {item.status !== "verified" && <fieldset className="admin-check-list" disabled={busyId === item.id}><legend>대조 체크리스트</legend>
        <label><input type="checkbox" checked={itemChecks.idName} disabled={!hasId} onChange={() => toggleCheck(item, "idName")}/><span>신분증의 이름이 입력한 이름(<b>{item.legalName}</b>)과 같습니다.</span></label>
        <label><input type="checkbox" checked={itemChecks.docName} disabled={!hasId} onChange={() => toggleCheck(item, "docName")}/><span>소유 서류의 소유자(공유자) 이름이 신분증의 이름과 같습니다.</span></label>
        <label><input type="checkbox" checked={itemChecks.address} onChange={() => toggleCheck(item, "address")}/><span>서류의 소재지가 등록 주소(<b>{address}</b>)와 같습니다.</span></label>
      </fieldset>}
      {item.status !== "verified" && <div className="admin-review-decision"><label>검토 근거 및 보완 사유<textarea maxLength={1000} value={notes[item.id] ?? (item.status === "rejected" ? item.reviewNote : "")} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="이름·소재지 일치 여부와 확인 근거를 기록하세요. 반려 시 소유자가 보완할 내용을 구체적으로 적어주세요."/></label><div><button type="button" className="button secondary" disabled={busyId === item.id} onClick={() => void decide(item, "rejected")}>보완 요청</button><button type="button" className="button" disabled={busyId === item.id || !hasId || !allChecked} title={!hasId ? "신분증이 있어야 확인 완료할 수 있습니다." : !allChecked ? "체크리스트 세 항목을 모두 확인해주세요." : undefined} onClick={() => void decide(item, "verified")}>{busyId === item.id ? "저장 중..." : "소유 확인 완료"}</button></div></div>}
    </article>; })}</div>
    <aside className="admin-review-guideline"><b>검토 기준</b><p>① 신분증의 이름과 제출자가 입력한 이름, ② 등기사항증명서·토지대장·건축물대장의 소유자 이름과 신분증의 이름, ③ 서류 소재지와 등록된 공간 주소가 모두 일치할 때만 확인 완료합니다. 공동소유·대리 제출·주소 불일치는 추가 자료를 요청하세요. 이 확인은 제출 서류의 대조 기록이며 법률상 권리나 실제 소유권을 보증하지 않습니다. 주민등록번호 등 민감정보를 검토 메모에 옮기지 마세요.</p></aside>
  </div></main>;
}