"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue, type Variants } from "motion/react";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ArrowRight, Calculator, Check, ChevronDown, CircleHelp, FileCheck2, Handshake, Home, Landmark, Lightbulb, MapPinned, Search, ShieldCheck, Unlink, UserRound, X } from "lucide-react";

// 랜딩 스크롤 스토리. 장면마다 sticky 무대를 두고, 그 장면의 스크롤 진행도(p, 0~1)로 Motion 값을 만듭니다.
// 화면 뒤의 도형은 장면이 바뀔 때마다 다른 모양으로 모핑됩니다.

type P = MotionValue<number>;
type Pt = [number, number];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const spring = { type: "spring", stiffness: 140, damping: 18 } as const;

/* ---------- 배경 모핑 도형 ---------- */

const N = 72;
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
  polar((a) => 60 + 14 * Math.sin(2 * a + 0.6) + 5 * Math.cos(6 * a)),
  polar((a) => 62 + 12 * Math.sin(8 * a)),
  polar((a) => 64 + 10 * Math.sin(3 * a) + 6 * Math.cos(5 * a + 1)),
  polar((a) => 40 + 38 * Math.cos(a) ** 2),
  polar(() => 70),
  polar(ray([[0, -80], [68, -56], [62, 12], [0, 80], [-62, 12], [-68, -56]])),
  polar((a) => 66 + 8 * Math.sin(5 * a)),
  polar((a) => 70 / (Math.abs(Math.cos(a)) ** 4 + Math.abs(Math.sin(a)) ** 4) ** 0.25),
];
const PLACES = [
  { x: 0, y: -6, s: 1.15, o: 1 }, { x: -22, y: 2, s: 0.9, o: 0.8 }, { x: 24, y: 4, s: 0.95, o: 0.75 },
  { x: 28, y: 6, s: 1, o: 0.7 }, { x: 0, y: 4, s: 1.25, o: 0.6 }, { x: 30, y: -18, s: 0.7, o: 0.55 },
  { x: -30, y: 10, s: 0.9, o: 0.7 }, { x: 0, y: 0, s: 1.3, o: 0.5 }, { x: 0, y: 0, s: 1.1, o: 0.8 },
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

const CHAPTERS = ["시작", "질문", "현실", "원인", "사용자", "사용법", "안전", "비전"];

function Backdrop() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const svg = useRef<SVGSVGElement>(null), path = useRef<SVGPathElement>(null);
  const bounds = useRef<[number, number][]>([]);
  const [chapter, setChapter] = useState(0), [inside, setInside] = useState(true);

  const draw = (v: number) => {
    const b = bounds.current; if (!b.length || !svg.current || !path.current) return;
    let i = 0; b.forEach(([start], k) => { if (v >= start - 0.002) i = k; });
    const t = reduce ? 0 : smooth(0.55, 1, clamp((v - b[i][0]) / Math.max(1e-6, b[i][1] - b[i][0])));
    const j = Math.min(i + 1, SHAPES.length - 1), A = SHAPES[i], B = SHAPES[j], pa = PLACES[i], pb = PLACES[j];
    const mix = (u: number, w: number) => u + (w - u) * t;
    path.current.setAttribute("d", toPath(A.map((pt, k) => [pt[0] + (B[k][0] - pt[0]) * t, pt[1] + (B[k][1] - pt[1]) * t] as Pt)));
    svg.current.style.transform = `translate(-50%,-50%) translate(${mix(pa.x, pb.x)}vw,${mix(pa.y, pb.y)}vh) rotate(${((i + t) * 24).toFixed(1)}deg) scale(${mix(pa.s, pb.s).toFixed(3)})`;
    svg.current.style.opacity = mix(pa.o, pb.o).toFixed(3);
    setChapter(i); setInside(v <= b[b.length - 1][1] + 0.01);
  };
  useMotionValueEvent(scrollYProgress, "change", draw);
  useEffect(() => {
    const measure = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      bounds.current = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]")).map((s) => {
        const top = s.getBoundingClientRect().top + window.scrollY;
        return [top / max, (top + s.offsetHeight - window.innerHeight) / max];
      });
      draw(scrollYProgress.get());
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(document.body);
    return () => ro.disconnect();
  // draw는 렌더마다 새로 만들어지지만 ref만 읽으므로 최초 측정 시점의 것을 써도 됩니다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollYProgress]);

  const jump = (i: number) => {
    const scene = document.querySelectorAll<HTMLElement>("[data-scene]")[i];
    const nav = document.querySelector<HTMLElement>(".nav-wrap")?.offsetHeight ?? 72;
    if (scene) window.scrollTo({ top: scene.getBoundingClientRect().top + window.scrollY - nav + 1, behavior: "smooth" });
  };

  return <>
    <svg ref={svg} className="st-blob" viewBox="-100 -100 200 200" aria-hidden>
      <defs><linearGradient id="st-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd9a3"/><stop offset="1" stopColor="#fff1de"/></linearGradient></defs>
      <path ref={path} d={toPath(SHAPES[0])} fill="url(#st-fill)"/>
    </svg>
    <nav className={`st-dots${inside ? "" : " out"}`} aria-label="이야기 목차">
      {CHAPTERS.map((c, i) => <button key={c} className={i === chapter ? "on" : ""} onClick={() => jump(i)} aria-label={c}><span>{c}</span></button>)}
    </nav>
  </>;
}

/* ---------- 공용 조각 ---------- */

function Scene({ name, len, rest = 1, children }: { name: string; len: number; rest?: number; children: (p: P) => ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const still = useMotionValue(rest);
  const p = reduce ? still : scrollYProgress;
  // 수백 개 칸처럼 CSS로 처리하는 게 가벼운 효과를 위해 --p도 함께 넣어둡니다.
  useMotionValueEvent(p, "change", (v) => ref.current?.style.setProperty("--p", v.toFixed(4)));
  useEffect(() => { ref.current?.style.setProperty("--p", p.get().toFixed(4)); }, [p]);
  return <section ref={ref} className={`st-scene st-${name}`} data-scene={name} style={{ "--len": len } as CSSProperties}>
    <div className="st-stage">{children(p)}</div>
  </section>;
}

// 스크롤에 맞춰 단어가 하나씩 또렷해집니다. "*"로 시작하는 단어는 강조, "|"는 줄바꿈입니다.
function Words({ text, p, from, to }: { text: string; p: P; from: number; to: number }) {
  const words = text.split(" "), count = words.filter((w) => w !== "|").length, step = (to - from) / count;
  let n = 0;
  return <>{words.map((w, i) => w === "|" ? <br key={i}/> : <Fragment key={i}><Word p={p} at={from + step * n++} len={step * 2} word={w}/>{" "}</Fragment>)}</>;
}
function Word({ p, at, len, word }: { p: P; at: number; len: number; word: string }) {
  const opacity = useTransform(p, [at, at + len], [0.12, 1]);
  const y = useTransform(p, [at, at + len], [16, 0]);
  const filter = useTransform(p, [at, at + len], ["blur(6px)", "blur(0px)"]);
  const hot = word.startsWith("*");
  return <motion.span className={hot ? "hot" : undefined} style={{ opacity, y, filter, display: "inline-block" }}>{hot ? word.slice(1) : word}</motion.span>;
}

const letter: Variants = {
  hide: { opacity: 0, y: "0.55em", rotate: 6, filter: "blur(10px)" },
  show: { opacity: 1, y: 0, rotate: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 160, damping: 16 } },
};
const letters: Variants = { hide: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.1 } } };
function Letters({ text }: { text: string }) {
  return <>{Array.from(text).map((c, i) => <motion.span key={i} variants={letter} style={{ display: "inline-block", whiteSpace: "pre" }}>{c}</motion.span>)}</>;
}

function Counter({ value }: { value: P }) {
  const smoothValue = useSpring(value, { stiffness: 90, damping: 22 });
  const text = useTransform(smoothValue, (v) => Math.round(v).toLocaleString("ko-KR"));
  return <motion.b>{text}</motion.b>;
}

// 마우스 위치를 따라 살짝 기울어지는 카드
function Tilt({ className, index = 0, children }: { className: string; index?: number; children: ReactNode }) {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [9, -9]), { stiffness: 220, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-9, 9]), { stiffness: 220, damping: 18 });
  const move = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5);
  };
  return <motion.article className={className} style={{ rotateX, rotateY, transformPerspective: 900 }} onPointerMove={move} onPointerLeave={() => { mx.set(0); my.set(0); }}
    initial={{ opacity: 0, y: 70, scale: 0.94 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.3 }}
    transition={{ type: "spring", stiffness: 90, damping: 16, delay: index * 0.08 }}>{children}</motion.article>;
}

// 포인터를 따라 끌려오는 버튼
function Magnetic({ children }: { children: ReactNode }) {
  const x = useSpring(0, { stiffness: 260, damping: 14 }), y = useSpring(0, { stiffness: 260, damping: 14 });
  return <motion.span className="st-magnet" style={{ x, y }}
    onPointerMove={(e) => { if (e.pointerType !== "mouse") return; const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * 0.35); y.set((e.clientY - r.top - r.height / 2) * 0.35); }}
    onPointerLeave={() => { x.set(0); y.set(0); }}>{children}</motion.span>;
}

/* ---------- 장면 ---------- */

function Hero({ p }: { p: P }) {
  const opacity = useTransform(p, [0, 0.35], [1, 0]);
  const y = useTransform(p, [0, 0.5], ["0vh", "-12vh"]);
  const scale = useTransform(p, [0, 0.5], [1, 0.86]);
  const clipPath = useTransform(p, (v) => { const k = (1 - smooth(0, 1, v)).toFixed(4); return `inset(calc(66% * ${k}) calc(var(--side) * ${k}) 0px calc(var(--side) * ${k}) round 28px)`; });
  const imgScale = useTransform(p, [0, 1], [1.22, 1]);
  const shade = useTransform(p, [0.55, 0.85], [0, 1]);
  const capOpacity = useTransform(p, [0.62, 0.82], [0, 1]), capY = useTransform(p, [0.62, 0.82], [40, 0]);
  return <>
    <motion.div className="st-hero-copy" style={{ opacity, y, scale }}>
      <motion.p className="st-kicker" initial={{ opacity: 0, y: 14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring}>FINDER(KE) · 빈집 활용 AI 에이전트</motion.p>
      <motion.h1 aria-label="비어 있는 공간을, 필요한 사람에게." initial="hide" animate="show" variants={letters}>
        <span aria-hidden><Letters text="비어 있는 공간을,"/><br/><Letters text="필요한 사람에게."/></span>
      </motion.h1>
      <motion.span className="st-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>내려서 이야기 보기 <ChevronDown size={18}/></motion.span>
    </motion.div>
    <motion.div className="st-hero-photo" style={{ clipPath }} initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 55, damping: 16, delay: 0.55 }}>
      <motion.div className="st-hero-img" style={{ scale: imgScale }}>
        <Image src="/images/space-hero.png" width={1536} height={1024} preload sizes="100vw" alt="몇 년째 비어 있는 단독주택"/>
      </motion.div>
      <motion.i className="st-shade" style={{ opacity: shade }}/>
      <motion.p style={{ opacity: capOpacity, y: capY }}>이 집은 몇 년째<br/>비어 있습니다.</motion.p>
    </motion.div>
  </>;
}

function Question({ p }: { p: P }) {
  return <div className="st-question-copy"><h2><Words p={p} from={0.05} to={0.7} text="공가는 늘어나는데, | 왜 아무도 *활용하지 *않을까?"/></h2></div>;
}

const CELLS = 134, USABLE = 87;
function Count({ p }: { p: P }) {
  const total = useTransform(p, [0.02, 0.4], [0, 134000]);
  const usable = useTransform(p, [0.45, 0.8], [0, 87000]);
  const show = useTransform(p, [0.4, 0.5], [0, 1]), showY = useTransform(p, [0.4, 0.5], [24, 0]);
  return <div className="st-split">
    <div className="st-count-copy">
      <h2>전국의 빈집</h2>
      <div className="st-num"><Counter value={total}/><span>호</span></div>
      <motion.div className="st-num st-num-use" style={{ opacity: show, y: showY }}><Counter value={usable}/><span>호는 지금도 쓸 수 있습니다</span></motion.div>
      <small>행정안전부 전국 빈집 조사</small>
    </div>
    <div className="st-cells" aria-hidden>
      {Array.from({ length: CELLS }, (_, i) => { const r = (i * 37) % CELLS; return <i key={i} className={r < USABLE ? "use" : ""} style={{ "--i": i, "--r": r } as CSSProperties}/>; })}
    </div>
  </div>;
}

const CAUSES = [
  { icon: Landmark, title: "철거하면 세금이 오릅니다", text: "빈집을 허물어 나대지가 되면 재산세 부담이 커집니다." },
  { icon: CircleHelp, title: "무엇에, 얼마에 쓸지 모릅니다", text: "소유자 혼자서는 활용 방법과 적정 가격을 판단하기 어렵습니다." },
  { icon: Unlink, title: "이어줄 길이 없습니다", text: "쓸 수 있는 공간도, 찾는 사람도 있지만 둘을 연결할 수단이 없습니다." },
];
const ARRIVE = [0, 0.3, 0.6];
function Cause({ p }: { p: P }) {
  return <div className="st-cause-grid">
    <div className="st-cause-copy">
      <h2>방치의 문제가 아니라,<br/><em>선택하기 어려운 구조</em>의<br/>문제였습니다.</h2>
      <small>국회입법조사처, 2024</small>
    </div>
    <div className="st-deck">{CAUSES.map((c, k) => <CauseCard key={c.title} p={p} k={k} {...c}/>)}</div>
  </div>;
}
// 다음 카드가 위로 쌓일 때마다 아래 카드는 조금씩 작아집니다.
function CauseCard({ p, k, icon: Icon, title, text }: { p: P; k: number; icon: typeof Landmark; title: string; text: string }) {
  const y = useTransform(p, [ARRIVE[k] - 0.2, ARRIVE[k]], ["120%", "0%"]);
  const rotate = useTransform(p, [ARRIVE[k] - 0.2, ARRIVE[k]], [10, 0]);
  const scale = useTransform(p, (v) => 1 - 0.06 * ARRIVE.slice(k + 1).reduce((n, a) => n + smooth(a - 0.2, a, v), 0));
  const filter = useTransform(scale, (s) => `brightness(${(1 - (1 - s) * 1.2).toFixed(3)})`);
  return <motion.article style={{ y, rotate, scale, filter, "--k": k } as unknown as CSSProperties}>
    <span>0{k + 1}</span><Icon size={40}/><h3>{title}</h3><p>{text}</p>
  </motion.article>;
}

function Chip({ text, linked, i }: { text: string; linked: boolean; i: number }) {
  return <motion.span animate={{ backgroundColor: linked ? "#fff0dc" : "#f4f1ec", color: linked ? "#8a4f00" : "#8a8378" }} transition={{ delay: linked ? 0.15 + i * 0.08 : 0 }}>
    <AnimatePresence mode="wait" initial={false}>
      <motion.i key={String(linked)} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={{ type: "spring", stiffness: 400, damping: 20, delay: linked ? 0.15 + i * 0.08 : 0 }}>
        {linked ? <Check size={14}/> : <X size={14}/>}
      </motion.i>
    </AnimatePresence>{text}
  </motion.span>;
}
const OWNER = ["어디에 쓸지 모름", "가격을 정하기 어려움", "이용자를 찾기 어려움"];
const SEEKER = ["빈 공간 정보가 없음", "예산·위치가 맞지 않음", "상태를 일일이 확인"];
function Users({ p }: { p: P }) {
  const [linked, setLinked] = useState(() => p.get() > 0.5);
  useMotionValueEvent(p, "change", (v) => setLinked(v > 0.5));
  const lx = useTransform(p, [0, 0.5], ["-7vw", "0vw"]), rx = useTransform(p, [0, 0.5], ["7vw", "0vw"]);
  const sideOpacity = useTransform(p, [0, 0.5], [0.5, 1]);
  const draw = useTransform(p, [0.28, 0.55], [0, 1]);
  const core = useSpring(useTransform(p, [0.45, 0.6], [0, 1]), { stiffness: 260, damping: 15 });
  const coreRotate = useTransform(core, [0, 1], [-120, 0]);
  return <div className="st-users-inner">
    <div className="st-swap">
      <AnimatePresence mode="wait" initial={false}>
        <motion.h2 key={String(linked)} className={linked ? "hot" : ""} initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -24, filter: "blur(8px)" }} transition={{ duration: 0.35 }}>
          {linked ? "AI 에이전트가 둘을 잇습니다." : "양쪽 모두 막혀 있었습니다."}
        </motion.h2>
      </AnimatePresence>
    </div>
    <div className="st-pair">
      <motion.article className="st-side" style={{ x: lx, opacity: sideOpacity }}><Home size={26}/><h3>공가 소유자</h3>{OWNER.map((t, i) => <Chip key={t} text={t} linked={linked} i={i}/>)}</motion.article>
      <svg className="st-link" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden>
        <line className="base" x1="0" y1="2" x2="100" y2="2"/>
        <motion.line className="live" x1="0" y1="2" x2="100" y2="2" style={{ pathLength: draw }}/>
      </svg>
      <div className="st-core"><motion.div style={{ scale: core, rotate: coreRotate }}><b>빈</b><small>빈틈이음</small></motion.div></div>
      <motion.article className="st-side" style={{ x: rx, opacity: sideOpacity }}><UserRound size={26}/><h3>공간 이용 희망자</h3>{SEEKER.map((t, i) => <Chip key={t} text={t} linked={linked} i={i}/>)}</motion.article>
    </div>
  </div>;
}

const STEPS = [
  { icon: MapPinned, title: "공간 이해", text: "사진과 주소로 상태와 주변 환경을 진단합니다", demo: ["사진", "주소", "면적", "건물 상태"] },
  { icon: Lightbulb, title: "활용 계획", text: "상권과 지역 수요로 활용안을 추천합니다", demo: ["카페", "공유 오피스", "서재"] },
  { icon: Calculator, title: "경제성 판단", text: "예상 임대료를 방치 시 재산세와 비교합니다", demo: ["월 임대료", "예상 수익", "재산세"] },
  { icon: Search, title: "이용자 탐색", text: "조건이 맞는 이용 희망자를 자동으로 찾습니다", demo: ["용도", "지역", "면적", "예산"] },
  { icon: Handshake, title: "연결과 승인", text: "소유자가 확인하고 승인하면 제안이 전송됩니다", demo: ["조건 확인", "가격 수정", "승인"] },
];
function Flow({ p }: { p: P }) {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null), shift = useRef(0);
  const [on, setOn] = useState(0);
  useEffect(() => {
    const measure = () => { const t = track.current; if (t) shift.current = Math.max(0, t.scrollWidth - (t.parentElement?.clientWidth ?? 0)); };
    measure();
    const ro = new ResizeObserver(measure); if (track.current) ro.observe(track.current);
    return () => ro.disconnect();
  }, []);
  const x = useTransform(p, (v) => -smooth(0.06, 0.94, v) * shift.current);
  const rail = useTransform(p, [0.06, 0.94], [0, 1]);
  useMotionValueEvent(p, "change", (v) => setOn(Math.round(smooth(0.06, 0.94, v) * (STEPS.length - 1))));
  return <div className="st-flow-inner">
    <div className="st-flow-head"><h2>등록부터 연결까지, 다섯 단계</h2><div className="st-rail"><motion.i style={{ scaleX: rail }}/></div></div>
    <div className="st-viewport">
      <motion.div className="st-track" ref={track} style={{ x: reduce ? 0 : x }}>
        {STEPS.map(({ icon: Icon, title, text, demo }, k) => { const active = reduce || k === on; return <motion.article className={`st-step${active ? " on" : ""}`} key={title}
          animate={{ scale: active ? 1 : 0.92, opacity: active ? 1 : 0.42 }} transition={{ type: "spring", stiffness: 200, damping: 24 }}>
          <span className="st-step-num">0{k + 1}</span><Icon size={34}/><h3>{title}</h3><p>{text}</p>
          <div className="st-demo">{demo.map((d, i) => <motion.em key={d} animate={{ opacity: active ? 1 : 0, y: active ? 0 : 12 }} transition={{ type: "spring", stiffness: 260, damping: 20, delay: active ? 0.1 + i * 0.06 : 0 }}>{d}</motion.em>)}</div>
        </motion.article>; })}
      </motion.div>
    </div>
  </div>;
}

const GATES = [
  { title: "입력 확인", text: "근거가 부족하면 추천 대신 보완할 정보를 묻습니다" },
  { title: "형식 검증", text: "추천은 최대 3개, 점수는 0~100으로 제한합니다" },
  { title: "용도 검사", text: "주거·숙박·유흥·위험물 용도는 추천하지 않습니다" },
  { title: "소유자 승인", text: "소유자가 확인하고 승인해야 제안이 나갑니다" },
  { title: "변경 제한", text: "확정된 매칭은 누구도 수정하거나 지울 수 없습니다" },
];
const gateAt = (v: number) => Math.min(GATES.length - 1, Math.floor(clamp(v * 1.05) * GATES.length));
function Safety({ p }: { p: P }) {
  const [on, setOn] = useState(() => gateAt(p.get()));
  useMotionValueEvent(p, "change", (v) => setOn(gateAt(v)));
  const fill = useTransform(p, (v) => `${(clamp((v * 5.25 - 0.5) / 4) * 100).toFixed(2)}%`);
  return <div className="st-safety-inner">
    <h2><ShieldCheck size={30}/> AI가 틀려도,<br/>바로 실행되지 않습니다.</h2>
    <div className="st-gates">
      <div className="st-pipe"><motion.i style={{ width: fill }}/></div>
      {GATES.map((g, k) => <div className="st-gate" key={g.title}>
        <motion.b animate={{ scale: k <= on ? 1.12 : 1, backgroundColor: k <= on ? "#f99d26" : "#ffffff", borderColor: k <= on ? "#f99d26" : "#e4ddd3", color: k <= on ? "#ffffff" : "#a39a8e" }} transition={{ type: "spring", stiffness: 380, damping: 16 }}>{k + 1}</motion.b>
        <span className={k <= on ? "lit" : ""}>{g.title}</span>
      </div>)}
    </div>
    <div className="st-gate-copy">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={on} initial={{ opacity: 0, y: 18, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -18, filter: "blur(6px)" }} transition={{ duration: 0.3 }}>
          <h3>{GATES[on].title}</h3><p>{GATES[on].text}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  </div>;
}

// 주황 원이 퍼지면서 화면이 뒤집히고, 같은 문장이 흰 글씨로 바뀝니다.
function Vision({ p }: { p: P }) {
  const clipPath = useTransform(p, (v) => `circle(${(smooth(0.35, 0.85, v) * 150).toFixed(2)}% at 50% 58%)`);
  const subOpacity = useTransform(p, [0.2, 0.35], [0, 1]);
  const body = (live: boolean) => <div className="st-vision-copy">
    <h2>{live ? <Words p={p} from={0} to={0.3} text="방치되는 공간을 | 다시 *도시의 *자원으로."/> : <>방치되는 공간을<br/>다시 <span className="hot">도시의 자원으로.</span></>}</h2>
    <motion.p style={{ opacity: live ? subOpacity : 1 }}>지속 가능한 도시와 주거지를 빈틈이음으로 만들겠습니다.</motion.p>
  </div>;
  return <>
    {body(true)}
    <motion.div className="st-vision-fill" style={{ clipPath }} aria-hidden>{body(false)}</motion.div>
  </>;
}

const TEAM = [
  { name: "민준기", role: "팀장", work: ["프로젝트 총괄", "서비스 기획", "서비스 흐름 설계"] },
  { name: "오혜성", role: "설계자", work: ["AI 추천 기능 설계", "가격 산정 로직", "AI 기능 설명 자료"] },
  { name: "김태민", role: "디자이너", work: ["UI/UX 설계", "프론트엔드 개발", "서비스 시연"] },
  { name: "김선민", role: "발표자", work: ["발표 자료 제작", "발표와 질의응답", "시장·사례 조사"] },
  { name: "이민주", role: "개발자", work: ["API 연동", "데이터 검증·백엔드", "발표와 질의응답"] },
];
const USES = [
  { icon: Home, title: "공간 소유자", text: "사진과 주소만 올리면 활용안과 수익을 분석합니다", href: "/owner/new", cta: "내 공간 분석하기" },
  { icon: Search, title: "공간 이용자", text: "원하는 조건을 말하면 맞는 공간을 추천합니다", href: "/spaces", cta: "공간 찾아보기" },
  { icon: FileCheck2, title: "문서 도우미", text: "활용계획서의 누락된 절차를 AI가 점검합니다", href: "/documents", cta: "문서 작성하기" },
];
const rise = { initial: { opacity: 0, y: 40 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.5 }, transition: spring };

export function Story() {
  const { scrollYProgress } = useScroll();
  const bar = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
  return <MotionConfig reducedMotion="user"><main className="st">
    <motion.div className="st-progress" style={{ scaleX: bar }} aria-hidden/>
    <Backdrop/>

    <Scene name="hero" len={2.4} rest={0}>{(p) => <Hero p={p}/>}</Scene>
    <Scene name="question" len={2.2}>{(p) => <Question p={p}/>}</Scene>
    <Scene name="count" len={3}>{(p) => <Count p={p}/>}</Scene>
    <Scene name="cause" len={3.4}>{(p) => <Cause p={p}/>}</Scene>
    <Scene name="users" len={3}>{(p) => <Users p={p}/>}</Scene>
    <Scene name="flow" len={5}>{(p) => <Flow p={p}/>}</Scene>
    <Scene name="safety" len={4}>{(p) => <Safety p={p}/>}</Scene>
    <Scene name="vision" len={3}>{(p) => <Vision p={p}/>}</Scene>

    <section className="st-team shell">
      <motion.p className="st-kicker" {...rise}>대전대신고등학교 · 2026 AI 동행 프로젝트 메이커톤</motion.p>
      <motion.h2 {...rise}>이 이야기를 만든 팀, FINDER(KE)</motion.h2>
      <div className="st-team-grid">
        {TEAM.map((m, i) => <Tilt className="st-member" index={i} key={m.name}>
          <i>{m.name[0]}</i><small>{m.role}</small><h3>{m.name}</h3>
          <ul>{m.work.map((w) => <li key={w}>{w}</li>)}</ul>
        </Tilt>)}
      </div>
      <motion.p className="st-motto" {...rise}>한 목표를 위해, 다 같이 달렸습니다.</motion.p>
    </section>

    <section className="st-use shell">
      <motion.h2 {...rise}>직접 써보세요</motion.h2>
      <div className="st-use-grid">
        {USES.map(({ icon: Icon, title, text, href, cta }, i) => <Tilt className="st-use-card" index={i} key={title}>
          <Link href={href}><Icon size={28}/><h3>{title}</h3><p>{text}</p><span>{cta} <ArrowRight size={16}/></span></Link>
        </Tilt>)}
      </div>
    </section>

    <section className="st-end">
      <motion.h2 aria-label="빈 공간에, 다음 이야기를." initial="hide" whileInView="show" viewport={{ once: true, amount: 0.6 }} variants={letters}>
        <span aria-hidden><Letters text="빈 공간에,"/><br/><Letters text="다음 이야기를."/></span>
      </motion.h2>
      <motion.div {...rise} transition={{ ...spring, delay: 0.5 }}>
        <Magnetic><Link className="button" href="/login">시작하기 <ArrowRight size={18}/></Link></Magnetic>
        <Magnetic><Link className="button secondary" href="/spaces">공간 둘러보기</Link></Magnetic>
      </motion.div>
    </section>
  </main></MotionConfig>;
}
