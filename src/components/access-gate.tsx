"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "./session-provider";
import { roleForPath } from "@/lib/navigation";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const { user, ready, error, logout } = useSession();
  const role = roleForPath(pathname);
  const protectedPage = !!role || pathname === "/mypage" || pathname.startsWith("/documents");
  useEffect(() => {
    if (ready && !user && !error && protectedPage) router.replace("/login?next=" + encodeURIComponent(pathname) + (role ? "&role=" + role : ""));
  }, [ready, user, error, protectedPage, pathname, role, router]);
  if (!protectedPage) return children;
  if (!ready || !user) return <main className="page"><div className="shell session-wait" role="status">{error ? <><h2>로그인을 확인해주세요</h2><p>{error}</p><button className="button" onClick={() => void logout()}>로그인 다시 시작</button></> : <><span className="session-loader"/><p>로그인 상태를 확인하고 있습니다.</p></>}</div></main>;
  if (role && user.role !== role) return <main className="page"><div className="shell session-wait"><h1>{role === "owner" ? "공간 소유자" : "공간 이용자"}로 이용할 수 있는 메뉴예요.</h1><p>마이페이지에서 이용 역할을 전환한 뒤 계속해주세요. 기존 활동은 그대로 보관됩니다.</p><Link className="button" href={"/mypage?next=" + encodeURIComponent(pathname)}>마이페이지에서 역할 전환</Link><Link className="text-button" href={"/" + user.role + "/dashboard"}>내 활동으로 돌아가기</Link></div></main>;
  return <div key={user.uid + user.role}>{children}</div>;
}
