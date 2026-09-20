"use client";
import { AlertCircle, ArrowUpRight, Building2, Check, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { Role } from "@/lib/types";
import { useSession } from "@/components/session-provider";
import { afterLogin } from "@/lib/navigation";

function Login() {
  const router = useRouter(); const params = useSearchParams();
  const { user, ready, error: sessionError, signInGoogle } = useSession();
  const [role, setRole] = useState<Role>(params.get("role") === "owner" ? "owner" : "seeker");
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    if (!ready || !user) return;
    router.replace(afterLogin(user.role, params.get("next")));
  }, [user, ready, params, router]);
  async function login() {
    setError(""); setLoading(true);
    try { await signInGoogle(role); }
    catch (cause) {
      const code = (cause as { code?: string }).code;
      const messages: Record<string, string> = {
        "auth/popup-closed-by-user": "로그인이 취소되었습니다. 준비되면 다시 시작해주세요.",
        "auth/popup-blocked": "브라우저에서 팝업을 허용한 뒤 다시 눌러주세요.",
        "auth/unauthorized-domain": "이 주소에서 Google 로그인을 사용할 수 없습니다. 관리자에게 문의해주세요.",
        "auth/network-request-failed": "네트워크 연결을 확인한 뒤 다시 시도해주세요.",
        "auth/operation-not-allowed": "Google 로그인이 아직 활성화되지 않았습니다.",
      };
      setError(messages[code || ""] || "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally { setLoading(false); }
  }
  if (!ready || user) return <main className="page"><div className="shell session-wait" role="status"><span className="session-loader"/><p>{user ? "내 활동으로 이동합니다." : "로그인 상태를 확인하고 있습니다."}</p></div></main>;
  return <main className="page white auth-page"><div className="shell auth-layout">
    <section className="auth-intro"><p className="eyebrow">새로운 쓰임, 새로운 연결</p><h1>당신의 공간 이야기를<br/>이어서 시작하세요.</h1><p>비어 있던 공간에 가능성을 더하고,<br/>그 공간이 필요한 사람을 만나는 곳.</p><div className="connection-art" aria-hidden="true"><span className="art-home"><Building2 size={46}/></span><span className="art-line"/><span className="art-person"><Users size={42}/></span><span className="art-caption">SPACE · PEOPLE · CONNECTION</span></div><div className="auth-benefits"><span><Check size={16}/> 계정 하나로 활동 보관</span><span><Check size={16}/> 필요한 순간 역할 전환</span></div></section>
    <section className="login-panel"><p className="eyebrow">공간이음에 오신 것을 환영해요</p><h2>로그인 / 회원가입</h2><p>처음이라면 이용 목적을 선택해주세요.<br/>이미 가입했다면 기존 역할로 이어집니다.</p><div className="role-options" role="group" aria-label="처음 이용할 역할">{([{value:"owner",title:"공간 소유자",copy:"내 공간의 활용 방법 찾기",Icon:Building2},{value:"seeker",title:"공간 이용자",copy:"필요한 공간 제안받기",Icon:Users}] as const).map(({value,title,copy,Icon})=><button key={value} type="button" className={"role-option " + (role === value ? "selected" : "")} aria-pressed={role === value} disabled={loading} onClick={()=>setRole(value)}><Icon size={23}/><span><b>{title}</b><small>{copy}</small></span><span className="selection-dot">{role===value&&<Check size={12}/>}</span></button>)}</div>
      {(error||sessionError)&&<div className="login-error" role="alert"><AlertCircle size={18}/><span>{error||sessionError}</span></div>}
      <button className="google-button" disabled={loading} onClick={login}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-3-.4-4.5H24v8.5h11a9.5 9.5 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.8 6-15.4Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.3 12.3 0 0 1 0-7.8v-5.4H5.7a20 20 0 0 0 0 18.6l6.9-5.4Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.7 1 7.8 3l5.9-5.9A19.8 19.8 0 0 0 24 3 20.4 20.4 0 0 0 5.7 14.2l6.9 5.4c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>{loading ? "Google 계정 확인 중…" : "Google로 계속하기"}<ArrowUpRight size={17}/></button><p className="login-footnote">별도의 비밀번호 없이 안전하게 로그인합니다.<br/>처음 로그인하면 공간이음 계정이 생성됩니다.</p>
    </section></div></main>;
}
export default function LoginPage() { return <Suspense><Login/></Suspense>; }
