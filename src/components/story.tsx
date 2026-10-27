"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";
import { ArrowRight, Calculator, Check, ChevronDown, FileCheck2, Handshake, Home, Lightbulb, MapPinned, Search, ShieldCheck, UserRound, X } from "lucide-react";

// 스크롤 진행도(--p, 0~1)를 각 장면에 넣어주고, 화면 뒤의 도형을 장면마다 다른 모양으로 모핑합니다.
// 애니메이션 대부분은 CSS가 --p로 계산하고, 숫자·가로 이동처럼 CSS로 못 하는 부분만 여기서 처리합니다.

type Pt = [number, number];
const N = 72;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function polar(r: (a: number) => number): Pt[] {
  return Array.from({ length: N }, (_, k) => { const a = (k / N) * Math.PI * 2 - Math.PI / 2; const d = r(a); return [d * Math.cos(a), d * Math.sin(a)]; });
}
// 다각형도 중심에서 같은 각도로 점을 뽑아야 서로 자연스럽게 모핑됩니다.
function ray(poly: Pt[]) {
  return (a: number) => {
    const dx = Math.cos(a), dy = Math.sin(a); let best = 80;
    poly.forEach(([px, py], i) => {
      const [qx, qy] = poly[(i + 1) % poly.length]; const ex = qx - px, ey = qy - py;
      const det = ex * dy - dx * ey; if (Math.abs(det) < 1e-9) return;
      const t = (ex * py - px * ey) / det, u = (dx * py - dy * px) / det;
      if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    });
    return best;
  };
}

const SHAPES: Pt[][] = [
  polar(ray([[0, -80], [74, -12], [58, -12], [58, 72], [-58, 72], [-58, -12], [-74, -12]])),
  polar((a) => 62 + 12 * Math.sin(8 * a)),
  polar((a) => 64 + 10 * Math.sin(3 * a) + 6 * Math.cos(5 * a + 1)),
  polar((a) => 40 + 38 * Math.cos(a) ** 2),
  polar(() => 70),
  polar(ray([[0, -80], [68, -56], [62, 12], [0, 80], [-62, 12], [-68, -56]])),
  polar((a) => 70 / (Math.abs(Math.cos(a)) ** 4 + Math.abs(Math.sin(a)) ** 4) ** 0.25),
];
// 장면별 도형 위치(vw, vh), 크기, 투명도
const PLACES = [
  { x: 0, y: -6, s: 1.15, o: 1 },
  { x: 24, y: 4, s: 0.95, o: 0.75 },
  { x: -26, y: 8, s: 1, o: 0.7 },
  { x: 0, y: 4, s: 1.25, o: 0.6 },
  { x: 30, y: -18, s: 0.7, o: 0.55 },
  { x: -30, y: 10, s: 0.9, o: 0.7 },
  { x: 0, y: 0, s: 1.1, o: 0.8 },
];

function toPath(pts: Pt[]) {
  const f = (p: Pt) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
    d += `C${f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${f(p2)}`;
  }
  return d + "Z";
}

const CHAPTERS = ["시작", "현실", "원인", "사용자", "사용법", "안전"];
const CELLS = 134, USABLE = 87;
const STEPS = [
  { icon: MapPinned, title: "공간 이해", text: "사진과 주소로 상태와 주변 환경을 진단합니다" },
  { icon: Lightbulb, title: "활용 계획", text: "상권과 지역 수요로 활용안을 추천합니다" },
  { icon: Calculator, title: "경제성 판단", text: "예상 임대료를 방치 시 재산세와 비교합니다" },
  { icon: Search, title: "이용자 탐색", text: "조건이 맞는 이용 희망자를 자동으로 찾습니다" },
  { icon: Handshake, title: "연결과 승인", text: "소유자가 승인하면 제안이 전송됩니다" },
];
const GATES = [
  { title: "입력 확인", text: "근거가 부족하면 추천 대신 보완할 정보를 묻습니다" },
  { title: "형식 검증", text: "추천은 최대 3개, 점수는 0~100으로 제한합니다" },
  { title: "용도 검사", text: "주거·숙박·유흥·위험물 용도는 추천하지 않습니다" },
  { title: "소유자 승인", text: "소유자가 확인하고 승인해야 제안이 나갑니다" },
  { title: "변경 제한", text: "확정된 매칭은 누구도 수정하거나 지울 수 없습니다" },
];

export function Story() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current; if (!el) return;
    const scenes = Array.from(el.querySelectorAll<HTMLElement>("[data-scene]"));
    const blob = el.querySelector<HTMLElement>(".st-blob"), path = el.querySelector<SVGPathElement>(".st-blob path");
    const bar = el.querySelector<HTMLElement>(".st-progress"), dots = Array.from(el.querySelectorAll<HTMLElement>(".st-dots button"));
    const total = el.querySelector<HTMLElement>("[data-num=total]"), usable = el.querySelector<HTMLElement>("[data-num=usable]");
    const track = el.querySelector<HTMLElement>(".st-track"), cards = Array.from(el.querySelectorAll<HTMLElement>(".st-step"));
    const gates = Array.from(el.querySelectorAll<HTMLElement>(".st-gate-copy > div"));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, lastKey = "";

    const update = () => {
      frame = 0;
      const still = motion.matches, vh = window.innerHeight;
      const nav = document.querySelector<HTMLElement>(".nav-wrap")?.offsetHeight ?? 72;
      let active = 0, activeP = 0;
      scenes.forEach((scene, i) => {
        const r = scene.getBoundingClientRect(), span = r.height - (vh - nav);
        const p = still ? Number(scene.dataset.rest ?? 1) : clamp(span > 0 ? (nav - r.top) / span : r.top < nav ? 1 : 0);
        scene.style.setProperty("--p", p.toFixed(4));
        scene.style.setProperty("--e", smooth(0, 1, p).toFixed(4));
        if (r.top <= vh * 0.5) { active = i; activeP = p; }
        const kind = scene.dataset.scene;
        if (kind === "count") {
          if (total) total.textContent = Math.round(134000 * smooth(0.02, 0.4, p)).toLocaleString("ko-KR");
          if (usable) usable.textContent = Math.round(87000 * smooth(0.45, 0.8, p)).toLocaleString("ko-KR");
          scene.classList.toggle("st-phase-2", p > 0.42);
        }
        if (kind === "flow" && track) {
          const q = smooth(0.06, 0.94, p), stage = track.parentElement?.clientWidth ?? 0;
          track.style.transform = still ? "" : `translate3d(${(-q * Math.max(0, track.scrollWidth - stage)).toFixed(1)}px,0,0)`;
          const on = Math.round(q * (cards.length - 1));
          cards.forEach((c, k) => c.classList.toggle("on", still || k === on));
        }
        if (kind === "safety") {
          const on = Math.min(GATES.length - 1, Math.floor(clamp(p * 1.05) * GATES.length));
          gates.forEach((g, k) => g.classList.toggle("on", k === on));
        }
      });

      const t = smooth(0.55, 1, activeP), next = Math.min(active + 1, SHAPES.length - 1);
      const key = `${active}:${t.toFixed(3)}`;
      if (path && blob && key !== lastKey) {
        lastKey = key;
        const a = SHAPES[active], b = SHAPES[next], pa = PLACES[active], pb = PLACES[next];
        path.setAttribute("d", toPath(a.map((pt, k) => [pt[0] + (b[k][0] - pt[0]) * t, pt[1] + (b[k][1] - pt[1]) * t] as Pt)));
        const mix = (u: number, v: number) => u + (v - u) * t;
        blob.style.transform = `translate(-50%,-50%) translate(${mix(pa.x, pb.x)}vw,${mix(pa.y, pb.y)}vh) rotate(${((active + t) * 24).toFixed(1)}deg) scale(${mix(pa.s, pb.s).toFixed(3)})`;
        blob.style.opacity = mix(pa.o, pb.o).toFixed(3);
      }
      const doc = document.documentElement;
      if (bar) bar.style.transform = `scaleX(${clamp(window.scrollY / Math.max(1, doc.scrollHeight - vh)).toFixed(4)})`;
      const last = scenes[scenes.length - 1]?.getBoundingClientRect().bottom ?? 0;
      dots.forEach((d, k) => d.classList.toggle("on", k === active && last > vh * 0.5));
      el.classList.toggle("st-past", last < vh * 0.5);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };

    const reveal = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); reveal.unobserve(e.target); } }), { threshold: 0.2 });
    el.querySelectorAll("[data-reveal]").forEach((n) => reveal.observe(n));

    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    motion.addEventListener("change", queue);
    return () => { cancelAnimationFrame(frame); reveal.disconnect(); window.removeEventListener("scroll", queue); window.removeEventListener("resize", queue); motion.removeEventListener("change", queue); };
  }, []);

  const jump = (i: number) => {
    const scene = root.current?.querySelectorAll<HTMLElement>("[data-scene]")[i];
    const nav = document.querySelector<HTMLElement>(".nav-wrap")?.offsetHeight ?? 72;
    if (scene) window.scrollTo({ top: scene.getBoundingClientRect().top + window.scrollY - nav + 1, behavior: "smooth" });
  };

  return <main className="st" ref={root}>
    <div className="st-progress" aria-hidden />
    <svg className="st-blob" viewBox="-100 -100 200 200" aria-hidden>
      <defs><linearGradient id="st-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd9a3"/><stop offset="1" stopColor="#fff1de"/></linearGradient></defs>
      <path d={toPath(SHAPES[0])} fill="url(#st-fill)"/>
    </svg>
    <nav className="st-dots" aria-label="이야기 목차">
      {CHAPTERS.map((c, i) => <button key={c} onClick={() => jump(i)} aria-label={c}><span>{c}</span></button>)}
    </nav>

    <section className="st-scene st-hero" data-scene="hero" data-rest="0" style={{ "--len": 2.4 } as CSSProperties}>
      <div className="st-stage">
        <div className="st-hero-copy">
          <p className="st-kicker">빈집 활용 AI 에이전트</p>
          <h1>비어 있는 공간을,<br/>필요한 사람에게.</h1>
          <span className="st-hint">내려서 이야기 보기 <ChevronDown size={18}/></span>
        </div>
        <div className="st-hero-photo">
          <Image src="/images/space-hero.png" width={1536} height={1024} preload sizes="100vw" alt="몇 년째 비어 있는 단독주택"/>
          <p>이 집은 몇 년째<br/>비어 있습니다.</p>
        </div>
      </div>
    </section>

    <section className="st-scene st-count" data-scene="count" data-rest="1" style={{ "--len": 3 } as CSSProperties}>
      <div className="st-stage">
        <div className="st-split">
          <div className="st-count-copy">
            <h2>전국의 빈집</h2>
            <div className="st-num"><b data-num="total">0</b><span>호</span></div>
            <div className="st-num st-num-use"><b data-num="usable">0</b><span>호는 지금도 쓸 수 있습니다</span></div>
            <small>행정안전부 전국 빈집 조사</small>
          </div>
          <div className="st-cells" aria-hidden>
            {Array.from({ length: CELLS }, (_, i) => { const r = (i * 37) % CELLS; return <i key={i} className={r < USABLE ? "use" : ""} style={{ "--i": i, "--r": r } as CSSProperties}/>; })}
          </div>
        </div>
      </div>
    </section>

    <section className="st-scene st-why" data-scene="why" data-rest="1" style={{ "--len": 3 } as CSSProperties}>
      <div className="st-stage">
        <div className="st-why-inner">
          <h2>빈집이 아니라,<br/><em>구조</em>가 문제였습니다.</h2>
          <div className="st-why-cards">
            {[["철거하면 세금이 오릅니다", "나대지가 되면 재산세 부담이 커집니다"], ["무엇에, 얼마에 쓸지 모릅니다", "활용 방법과 적정 가격을 판단하기 어렵습니다"], ["이어줄 길이 없습니다", "공간도 수요도 있지만 연결 수단이 부족합니다"]].map(([t, d], k) =>
              <article key={t} style={{ "--k": k } as CSSProperties}><span>0{k + 1}</span><h3>{t}</h3><p>{d}</p></article>)}
          </div>
          <small>국회입법조사처, 2024</small>
        </div>
      </div>
    </section>

    <section className="st-scene st-users" data-scene="users" data-rest="1" style={{ "--len": 3.2 } as CSSProperties}>
      <div className="st-stage">
        <div className="st-users-inner">
          <div className="st-swap"><h2>양쪽 모두 막혀 있었습니다.</h2><h2>AI 에이전트가 둘을 잇습니다.</h2></div>
          <div className="st-pair">
            <article className="st-side st-left"><Home size={26}/><h3>공가 소유자</h3>{["어디에 쓸지 모름", "가격을 정하기 어려움", "이용자를 찾기 어려움"].map((t) => <span key={t}><X size={14}/><Check size={14}/>{t}</span>)}</article>
            <svg className="st-link" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden><line className="base" x1="0" y1="2" x2="100" y2="2" pathLength={1}/><line className="live" x1="0" y1="2" x2="100" y2="2" pathLength={1}/></svg>
            <div className="st-core"><b>빈</b><small>빈틈이음</small></div>
            <article className="st-side st-right"><UserRound size={26}/><h3>공간 이용 희망자</h3>{["빈 공간 정보가 없음", "예산·위치가 맞지 않음", "상태를 일일이 확인"].map((t) => <span key={t}><X size={14}/><Check size={14}/>{t}</span>)}</article>
          </div>
        </div>
      </div>
    </section>

    <section className="st-scene st-flow" data-scene="flow" data-rest="1" style={{ "--len": 5 } as CSSProperties}>
      <div className="st-stage">
        <div className="st-flow-inner">
          <div className="st-flow-head"><h2>등록부터 연결까지, 다섯 단계</h2><div className="st-rail"><i/></div></div>
          <div className="st-viewport">
            <div className="st-track">
              {STEPS.map(({ icon: Icon, title, text }, k) => <article className="st-step" key={title}><span>0{k + 1}</span><Icon size={34}/><h3>{title}</h3><p>{text}</p></article>)}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="st-scene st-safety" data-scene="safety" data-rest="1" style={{ "--len": 4 } as CSSProperties}>
      <div className="st-stage">
        <div className="st-safety-inner">
          <h2><ShieldCheck size={30}/> AI가 틀려도,<br/>바로 실행되지 않습니다.</h2>
          <div className="st-gates">
            <div className="st-pipe"><i/></div>
            {GATES.map((g, k) => <div className="st-gate" key={g.title} style={{ "--k": k } as CSSProperties}><b>{k + 1}</b><span>{g.title}</span></div>)}
          </div>
          <div className="st-gate-copy">{GATES.map((g) => <div key={g.title}><h3>{g.title}</h3><p>{g.text}</p></div>)}</div>
        </div>
      </div>
    </section>

    <section className="st-use shell">
      <h2 data-reveal>직접 써보세요</h2>
      <div className="st-use-grid">
        {[
          { icon: Home, title: "공간 소유자", text: "사진과 주소만 올리면 활용안과 수익을 분석합니다", href: "/owner/new", cta: "내 공간 분석하기" },
          { icon: Search, title: "공간 이용자", text: "원하는 조건을 말하면 맞는 공간을 추천합니다", href: "/spaces", cta: "공간 찾아보기" },
          { icon: FileCheck2, title: "문서 도우미", text: "활용계획서의 누락된 절차를 AI가 점검합니다", href: "/documents", cta: "문서 작성하기" },
        ].map(({ icon: Icon, title, text, href, cta }, k) => <Link href={href} key={title} className="st-use-card" data-reveal style={{ "--k": k } as CSSProperties}>
          <Icon size={28}/><h3>{title}</h3><p>{text}</p><span>{cta} <ArrowRight size={16}/></span>
        </Link>)}
      </div>
    </section>

    <section className="st-end" data-reveal>
      <h2>빈 공간에,<br/>다음 이야기를.</h2>
      <div><Link className="button" href="/login">시작하기 <ArrowRight size={18}/></Link><Link className="button secondary" href="/spaces">공간 둘러보기</Link></div>
    </section>
  </main>;
}
