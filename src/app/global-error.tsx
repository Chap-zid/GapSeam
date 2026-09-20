"use client";

import { useEffect } from "react";

// 레이아웃 자체가 실패한 경우를 위한 마지막 방어선입니다. 자체 html/body를 렌더링합니다.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Global error", error.message, error.digest); }, [error]);
  return <html lang="ko"><body style={{ margin: 0, fontFamily: "Pretendard, Arial, sans-serif", background: "#fff", color: "#222" }}>
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 460 }}>
        <div style={{ width: 45, height: 45, borderRadius: 12, background: "#fff6e9", color: "#a65e00", display: "grid", placeItems: "center", fontWeight: 850, fontSize: 12, margin: "0 auto 18px" }}>이음</div>
        <h1 style={{ fontSize: 24, margin: "0 0 10px" }}>일시적인 오류가 발생했습니다.</h1>
        <p style={{ color: "#737373", fontSize: 14, lineHeight: 1.7, margin: "0 0 22px" }}>등록된 공간과 요청 정보는 안전하게 보관되어 있습니다.</p>
        <button onClick={reset} style={{ minHeight: 50, padding: "0 22px", borderRadius: 12, border: "1px solid #f99d26", background: "#f99d26", color: "#24180a", fontWeight: 750, cursor: "pointer" }}>다시 시도</button>
      </div>
    </main>
  </body></html>;
}
