"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { hasNativeGoogleSignIn, nativeGoogleIdToken, nativeGoogleSignOut } from "@/lib/native-app";
import { getDemoUser } from "@/lib/demo-store";
import type { Role, UserProfile } from "@/lib/types";

type SessionValue = {
  user: UserProfile | null; ready: boolean; error: string;
  signInGoogle: (role: Role) => Promise<void>;
  chooseRole: (role: Role) => Promise<UserProfile>;
  logout: () => Promise<void>;
};
const SessionContext = createContext<SessionValue | null>(null);
const ROLE_KEY = "binteum-ieum-pending-role";
// 로컬 데모 모드에서만 쓰는 탭별 체험 역할입니다. 탭마다 다른 역할로 두 기기 시연을 흉내 낼 수 있습니다.
const DEMO_ROLE_KEY = "binteum-ieum-demo-role";
// 이 탭에서 고른 역할입니다. 계정의 기본 역할(users 문서)보다 우선해서, 다른 탭의 역할 전환에 끌려가지 않습니다.
const TAB_ROLE_KEY = "binteum-ieum-tab-role";
function tabRole(): Role | null {
  const value = sessionStorage.getItem(TAB_ROLE_KEY);
  return value === "owner" || value === "seeker" ? value : null;
}
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    localStorage.removeItem("binteum-ieum-session");
    if (!auth || !db) {
      const demoRole = DEMO_MODE ? sessionStorage.getItem(DEMO_ROLE_KEY) : null;
      queueMicrotask(() => { if (demoRole === "owner" || demoRole === "seeker") setUser(getDemoUser(demoRole)); setReady(true); });
      return;
    }
    let stopProfile = () => {};
    let generation = 0;
    const stopAuth = onAuthStateChanged(auth, (account) => {
      const current = ++generation;
      stopProfile(); setUser(null); setError("");
      if (!account || account.isAnonymous) { setReady(true); return; }
      setReady(false);
      stopProfile = onSnapshot(doc(db!, "users", account.uid), async (snapshot) => {
        if (current !== generation) return;
        const saved = snapshot.data();
        if (saved?.role === "owner" || saved?.role === "seeker") {
          setUser({ uid: account.uid, name: account.displayName || saved.name || "빈틈이음 회원", role: tabRole() || saved.role, email: account.email || "" });
          sessionStorage.removeItem(ROLE_KEY); setReady(true); return;
        }
        const role: Role = sessionStorage.getItem(ROLE_KEY) === "owner" ? "owner" : "seeker";
        try {
          await setDoc(doc(db!, "users", account.uid), { uid: account.uid, name: account.displayName || "빈틈이음 회원", role }, { merge: true });
        } catch {
          if (current === generation) { setError("회원 정보를 저장하지 못했습니다. 연결을 확인하고 다시 시도해주세요."); setReady(true); }
        }
      }, () => {
        if (current === generation) { setError("회원 정보를 불러오지 못했습니다. 잠시 후 다시 로그인해주세요."); setReady(true); }
      });
    }, () => { setError("로그인 상태를 확인하지 못했습니다."); setReady(true); });
    return () => { generation++; stopAuth(); stopProfile(); };
  }, []);
  const signInGoogle = useCallback(async (role: Role) => {
    if ((!auth || !db) && DEMO_MODE) { sessionStorage.setItem(DEMO_ROLE_KEY, role); setUser(getDemoUser(role)); return; }
    if (!auth || !db) throw new Error("Firebase 연결 설정을 확인해주세요.");
    sessionStorage.setItem(ROLE_KEY, role);
    sessionStorage.setItem(TAB_ROLE_KEY, role);
    if (hasNativeGoogleSignIn()) {
      // Android 앱: WebView에서는 Google 팝업이 차단되므로 네이티브 계정 선택으로 받은 ID 토큰으로 같은 Firebase 계정에 로그인합니다.
      await signInWithCredential(auth, GoogleAuthProvider.credential(await nativeGoogleIdToken()));
      return;
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  }, []);
  const chooseRole = useCallback(async (role: Role) => {
    if ((!auth || !db) && DEMO_MODE && user) { sessionStorage.setItem(DEMO_ROLE_KEY, role); const updated = getDemoUser(role); setUser(updated); return updated; }
    if (!auth?.currentUser || auth.currentUser.isAnonymous || !db || !user) throw new Error("먼저 Google 계정으로 로그인해주세요.");
    sessionStorage.setItem(TAB_ROLE_KEY, role);
    await setDoc(doc(db, "users", user.uid), { role }, { merge: true });
    const updated = { ...user, role }; setUser(updated); return updated;
  }, [user]);
  const logout = useCallback(async () => {
    if (auth) await signOut(auth);
    await nativeGoogleSignOut();
    localStorage.removeItem("binteum-ieum-session"); sessionStorage.removeItem(ROLE_KEY); sessionStorage.removeItem(DEMO_ROLE_KEY); sessionStorage.removeItem(TAB_ROLE_KEY);
    setUser(null); setError(""); setReady(true);
  }, []);
  return <SessionContext.Provider value={{ user, ready, error, signInGoogle, chooseRole, logout }}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
