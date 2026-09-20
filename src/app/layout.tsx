import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/session-provider";
import { Navbar } from "@/components/navbar";
import { ModeBanner } from "@/components/mode-banner";
import { AccessGate } from "@/components/access-gate";

export const metadata: Metadata = { title: "공간이음 — 비어 있는 공간을, 필요한 사람에게", description: "방치된 공간의 가능성을 분석하고 실제 이용자까지 연결합니다." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><SessionProvider><ModeBanner/><Navbar /><AccessGate>{children}</AccessGate><footer className="site-footer"><div className="shell"><b>공간이음</b><span>비어 있는 공간에, 다음 이야기를.</span><small>공간과 사람을 잇습니다.</small></div></footer></SessionProvider></body></html>;
}
