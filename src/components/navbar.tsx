"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Menu, X, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { useSession } from "./session-provider";

export function Navbar() {
  const { user, ready } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const dashboard = user?.role === "owner" ? "/owner/dashboard" : "/seeker/dashboard";
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  useEffect(() => {
    let active = true;
    if (!user || !auth?.currentUser) return;
    void auth.currentUser.getIdTokenResult().then((token) => { if (active) setIsAdmin(token.claims.admin === true); }).catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, [user]);
  const links = [
    { href: "/spaces", label: "공간 찾기" },
    { href: "/owner/new", label: "내 공간 등록" },
    { href: "/request/new", label: "공간 요청 등록" },
    { href: "/documents", label: "문서 도우미" },
    ...(user && isAdmin ? [{ href: "/admin/verification", label: "소유자 서류 검토" }] : []),
  ];
  return <header className="nav-wrap">
    <nav className="nav shell">
      <Link href="/" className="brand" onClick={() => setOpen(false)}><span className="brand-mark" aria-hidden="true"><Home size={17} strokeWidth={2.6}/></span>빈틈이음</Link>
      <button type="button" className="mobile-menu" onClick={() => setOpen(!open)} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls="primary-navigation">{open ? <X /> : <Menu />}</button>
      <div id="primary-navigation" className={`nav-links ${open ? "open" : ""}`}>
        {links.map((l) => <Link onClick={()=>setOpen(false)} className={pathname === l.href ? "active" : ""} href={l.href} key={l.href}>{l.label}</Link>)}
      </div>
      <div className="nav-actions">
        {ready && <><Link href={user ? "/mypage" : "/login"} className="account-link" onClick={() => setOpen(false)}>{user ? <><UserRound size={17}/> 마이페이지</> : "로그인"}</Link><Link href={user ? dashboard : "/login"} className="button small" onClick={() => setOpen(false)}>{user ? "내 활동" : "시작하기"}</Link></>}
      </div>
    </nav>
  </header>;
}
