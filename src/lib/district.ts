// 주소가 가려져 있거나("양수로*길 *-*") 희망 지역을 "대전 동구"처럼 지역명으로만 적은 경우
// VWorld 주소 좌표 변환(getCoord)이 실패합니다. 이때 VWorld 행정구역 검색으로
// 읍·면·동 또는 시·군·구의 중심점을 찾아 "행정구역 기준" 좌표로 씁니다.
// 서버·브라우저·테스트가 같이 쓰므로 런타임 import 없이 작성합니다.

const SIDO: { names: string[]; short: string }[] = [
  { names: ["서울특별시", "서울시", "서울"], short: "서울" },
  { names: ["부산광역시", "부산시", "부산"], short: "부산" },
  { names: ["대구광역시", "대구시", "대구"], short: "대구" },
  { names: ["인천광역시", "인천시", "인천"], short: "인천" },
  { names: ["광주광역시", "광주시", "광주"], short: "광주" },
  { names: ["대전광역시", "대전시", "대전"], short: "대전" },
  { names: ["울산광역시", "울산시", "울산"], short: "울산" },
  { names: ["세종특별자치시", "세종시", "세종"], short: "세종" },
  { names: ["경기도", "경기"], short: "경기" },
  { names: ["강원특별자치도", "강원도", "강원"], short: "강원" },
  { names: ["충청북도", "충북"], short: "충북" },
  { names: ["충청남도", "충남"], short: "충남" },
  { names: ["전북특별자치도", "전라북도", "전북"], short: "전북" },
  { names: ["전남광주통합특별시", "전라남도", "전남"], short: "전남" },
  { names: ["경상북도", "경북"], short: "경북" },
  { names: ["경상남도", "경남"], short: "경남" },
  { names: ["제주특별자치도", "제주도", "제주"], short: "제주" },
];

export function sidoShort(token: string) {
  return SIDO.find((entry) => entry.names.includes(token))?.short || "";
}

const ADMIN_TOKEN = /(시|군|구|읍|면|동|가|리)$/;

// 주소 앞부분에서 행정구역 이름만 뽑습니다. 별표·숫자가 나오거나 도로명이 시작되면 멈춥니다.
export function districtTokens(address: string) {
  const tokens = String(address || "").trim().split(/\s+/).filter(Boolean);
  const result: string[] = [];
  for (const [index, token] of tokens.entries()) {
    if (/[*\d]/.test(token)) break;
    if (index === 0 && sidoShort(token)) { result.push(token); continue; }
    if (!ADMIN_TOKEN.test(token) || /(로|길)$/.test(token)) break;
    result.push(token);
  }
  return result;
}

export type DistrictLevel = "sido" | "sigungu" | "gu" | "eupmyeondong";

export function districtLevel(token: string, previous?: string): DistrictLevel {
  if (sidoShort(token)) return "sido";
  if (/(읍|면|동|가|리)$/.test(token)) return "eupmyeondong";
  if (/구$/.test(token) && previous && /시$/.test(previous) && !sidoShort(previous)) return "gu";
  return "sigungu";
}

// VWorld 행정구역 검색의 category입니다. 일반구는 시·군·구 목록에 같이 나오는 경우도 있어 두 단계를 차례로 시도합니다.
export const DISTRICT_CATEGORIES: Record<DistrictLevel, string[]> = {
  sido: ["L1"],
  sigungu: ["L2"],
  gu: ["L3", "L2"],
  eupmyeondong: ["L4", "L3"],
};

function normalizeTitle(text: string) {
  return String(text || "").replace(/<[^>]+>/g, "").trim().split(/\s+/).map((token) => sidoShort(token) || token).join(" ");
}

export type DistrictHit = { code: string; title: string; longitude: number; latitude: number };

// 같은 이름의 읍·면·동이 여러 시군구에 있으므로 앞의 행정구역 이름이 모두 들어 있는 결과만 받습니다.
export function pickDistrictItem(items: unknown[], tokens: string[]): DistrictHit | null {
  const wanted = tokens.map((token) => sidoShort(token) || token);
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { id?: unknown; title?: unknown; point?: { x?: unknown; y?: unknown } };
    const title = normalizeTitle(String(item.title ?? ""));
    const titleTokens = title.split(" ");
    if (!wanted.every((token) => titleTokens.includes(token))) continue;
    const longitude = Number(item.point?.x);
    const latitude = Number(item.point?.y);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    return { code: String(item.id ?? ""), title: String(item.title ?? "").replace(/<[^>]+>/g, "").trim(), longitude, latitude };
  }
  return null;
}

// 시·군·구까지만 남긴 토큰입니다. 실거래가 API의 지역 코드(LAWD_CD)는 시·군·구 단위입니다.
export function sigunguTokens(address: string) {
  const tokens = districtTokens(address);
  let last = -1;
  tokens.forEach((token, index) => { const level = districtLevel(token, tokens[index - 1]); if (level === "sigungu" || level === "gu") last = index; });
  return last >= 0 ? tokens.slice(0, last + 1) : tokens.filter((token) => sidoShort(token));
}
