"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Role, UserProfile } from "@/lib/types";

type SessionValue = {
  user: UserProfile | null; ready: boolean; error: string;
  signInGoogle: (role: Role) => Promise<void>;
  chooseRole: (role: Role) => Promise<UserProfile>;
  logout: () => Promise<void>;
};
const SessionContext = createContext<SessionValue | null>(null);
const ROLE_KEY = "binteum-ieum-pending-role";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    localStorage.removeItem("binteum-ieum-session");
    if (!auth || !db) { queueMicrotask(() => setReady(true)); return; }
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
          setUser({ uid: account.uid, name: account.displayName || saved.name || "빈틈이음 회원", role: saved.role, email: account.email || "" });
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
    if (!auth || !db) throw new Error("Firebase 연결 설정을 확인해주세요.");
    sessionStorage.setItem(ROLE_KEY, role);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  }, []);
  const chooseRole = useCallback(async (role: Role) => {
    if (!auth?.currentUser || auth.currentUser.isAnonymous || !db || !user) throw new Error("먼저 Google 계정으로 로그인해주세요.");
    await setDoc(doc(db, "users", user.uid), { role }, { merge: true });
    const updated = { ...user, role }; setUser(updated); return updated;
  }, [user]);
  const logout = useCallback(async () => {
    if (auth) await signOut(auth);
    localStorage.removeItem("binteum-ieum-session"); sessionStorage.removeItem(ROLE_KEY);
    setUser(null); setError(""); setReady(true);
  }, []);
  return <SessionContext.Provider value={{ user, ready, error, signInGoogle, chooseRole, logout }}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
