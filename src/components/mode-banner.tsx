"use client";

import { isFirebaseReady } from "@/lib/firebase";

export function ModeBanner() {
  if (isFirebaseReady) return null;
  return <div className="mode-note">로컬 데모 모드 · 두 기기 실시간 시연은 Firebase 환경 변수를 연결해주세요.</div>;
}
