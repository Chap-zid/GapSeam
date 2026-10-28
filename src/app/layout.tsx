import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SessionProvider } from "@/components/session-provider";
import { Navbar } from "@/components/navbar";
import { ModeBanner } from "@/components/mode-banner";
import { AccessGate } from "@/components/access-gate";
import { version } from "../../package.json";

export const metadata: Metadata = { title: "빈틈이음 — 비어 있는 공간을, 필요한 사람에게", description: "방치된 공간의 가능성을 분석하고 실제 이용자까지 연결합니다." };

const paperlogy = localFont({
  src: [
    { path: "./fonts/Paperlogy-4Regular.woff2", weight: "400" },
    { path: "./fonts/Paperlogy-6SemiBold.woff2", weight: "600" },
    { path: "./fonts/Paperlogy-7Bold.woff2", weight: "700" },
    { path: "./fonts/Paperlogy-8ExtraBold.woff2", weight: "800" },
  ],
  variable: "--font-paperlogy",
  display: "swap",
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" className={paperlogy.variable}><body><SessionProvider><ModeBanner/><Navbar /><AccessGate>{children}</AccessGate><footer className="site-footer"><div className="shell"><b>빈틈이음</b><span>비어 있는 공간에, 다음 이야기를.</span><small>v{version}</small></div></footer></SessionProvider></body></html>;
}
