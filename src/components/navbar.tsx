"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, UserRound } from "lucide-react";
import { useState } from "react";
import { useSession } from "./session-provider";

export function Navbar() {
  const { user, ready } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dashboard = user?.role === "owner" ? "/owner/dashboard" : "/seeker/dashboard";
  const links = [
    { href: "/seeker/dashboard", label: "공간 찾기" },
    { href: "/owner/new", label: "내 공간 등록" },
    { href: "/request/new", label: "공간 요청 등록" },
    { href: "/documents", label: "문서 도우미" },
  ];
  return <header className="nav-wrap">
    <nav className="nav shell">
      <Link href="/" className="brand"><span className="brand-mark">빈</span>빈틈이음</Link>
      <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="메뉴">{open ? <X /> : <Menu />}</button>
      <div className={`nav-links ${open ? "open" : ""}`}>
        {links.map((l) => <Link onClick={()=>setOpen(false)} className={pathname === l.href ? "active" : ""} href={l.href} key={l.href}>{l.label}</Link>)}
      </div>
      <div className="nav-actions">
        {ready && <><Link href={user ? "/mypage" : "/login"} className="account-link">{user ? <><UserRound size={17}/> 마이페이지</> : "로그인"}</Link><Link href={user ? dashboard : "/login"} className="button small">{user ? "내 활동" : "시작하기"}</Link></>}
      </div>
    </nav>
  </header>;
}
