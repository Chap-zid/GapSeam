"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Building2, MapPin, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { watchAllSpaces } from "@/lib/services";
import type { Space } from "@/lib/types";

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("전체 지역");
  const [loading, setLoading] = useState(true);

  useEffect(() => watchAllSpaces((items) => { setSpaces(items); setLoading(false); }), []);

  const regions = useMemo(() => ["전체 지역", ...Array.from(new Set(spaces.map((space) => space.region).filter(Boolean)))], [spaces]);
  const filtered = useMemo(() => spaces.filter((space) => {
    const haystack = `${space.address} ${space.region} ${space.buildingType} ${space.description} ${(space.analysis?.suggestedUses || []).map((use) => use.name).join(" ")}`.toLowerCase();
    return (region === "전체 지역" || space.region === region) && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [spaces, query, region]);

  return <main className="page space-market-page"><div className="shell">
    <header className="market-head reveal"><div><p className="eyebrow">공개 공간 탐색</p><h1>등록된 공간을 먼저 살펴보세요.</h1><p>로그인하지 않아도 공간과 분석 결과를 볼 수 있습니다. 필요한 공간을 발견하면 내 요청 조건으로 적합도를 확인하고 직접 신청할 수 있습니다.</p></div><Link className="button" href="/request/new">내 공간 수요 등록</Link></header>
    <div className="market-filter reveal delay-1"><label><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="지역, 건물 유형, 추천 용도로 검색"/></label><label><SlidersHorizontal size={17}/><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label><span>공개 공간 <b>{filtered.length}</b>개</span></div>
    {loading ? <div className="market-empty"><span className="session-loader"/><p>공간 목록을 불러오고 있습니다.</p></div> : filtered.length === 0 ? <div className="market-empty"><Building2/><b>조건에 맞는 공간이 없습니다.</b><p>검색 조건을 바꾸거나 새로운 공간이 등록될 때까지 기다려주세요.</p></div> : <section className="space-market-grid">{filtered.map((space) => <article className="space-market-card" key={space.id}>
      <Link href={`/spaces/${space.id}`} className="space-market-image"><Image src={space.imageUrls?.[0] || "/images/space-hero.png"} width={720} height={460} alt={`${space.address} 공간`}/><span>{space.analysis ? "분석 완료" : "분석 진행 중"}</span></Link>
      <div className="space-market-body"><div className="space-market-location"><MapPin size={15}/><span>{space.region}</span></div><h2>{space.address}</h2><p>{space.buildingType} · {space.area}㎡ · {space.currentStatus}</p><div className="space-use-chips">{(space.analysis?.suggestedUses || []).slice(0, 3).map((use) => <span key={use.name}>{use.name}</span>)}</div><div className="space-market-bottom"><div><small>예상 이용료</small><b>{space.analysis?.estimatedPrice || "분석 후 공개"}</b></div><Link href={`/spaces/${space.id}`}>상세 보기 <ArrowRight size={15}/></Link></div></div>
    </article>)}</section>}
  </div></main>;
}
