"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, ShieldAlert } from "lucide-react";

// 화면 어딘가에서 예외가 나도 흰 화면 대신 복구 경로를 보여줍니다.
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Page error", error.message, error.digest); }, [error]);
  return <main className="page"><div className="shell session-wait" role="alert">
    <div className="role-icon"><ShieldAlert /></div>
    <h1 style={{ margin: 0 }}>화면을 불러오는 중 문제가 생겼습니다.</h1>
    <p>입력하신 내용과 등록된 공간 정보는 그대로 보관되어 있습니다. 잠시 후 다시 시도해주세요.</p>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
      <button className="button" onClick={reset}><RefreshCw size={17} /> 다시 시도</button>
      <Link className="button secondary" href="/">처음 화면으로</Link>
    </div>
  </div></main>;
}
