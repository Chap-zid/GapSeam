// 주소 문자열에서 매칭에 사용할 지역 표기("대전 동구")를 추출합니다.
// VWorld 정제 주소와 사용자가 직접 입력한 희망 지역 모두 같은 규칙으로 정규화합니다.
const SIDO = [
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
  { names: ["전라남도", "전남"], short: "전남" },
  { names: ["경상북도", "경북"], short: "경북" },
  { names: ["경상남도", "경남"], short: "경남" },
  { names: ["제주특별자치도", "제주도", "제주"], short: "제주" },
] as const;

export const UNKNOWN_REGION = "지역 미확인";

export function extractRegion(address: string): string {
  const tokens = String(address || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return UNKNOWN_REGION;
  const sido = SIDO.find((entry) => (entry.names as readonly string[]).includes(tokens[0]));
  // 시·도 이름이 없으면 앞 두 토큰을 그대로 지역 표기로 사용합니다.
  if (!sido) return tokens.slice(0, 2).join(" ");
  if (sido.short === "세종") return "세종";
  const district = tokens.slice(1).find((token) => token.length >= 2 && /[시군구]$/.test(token));
  return district ? `${sido.short} ${district}` : sido.short;
}

export function sidoOf(region: string): string {
  return extractRegion(region).split(" ")[0] || "";
}

// exact: 같은 시군구 / sido: 같은 시도 / none: 무관
export function regionAffinity(left: string, right: string): "exact" | "sido" | "none" {
  const a = extractRegion(left);
  const b = extractRegion(right);
  if (!a || !b || a === UNKNOWN_REGION || b === UNKNOWN_REGION) return "none";
  if (a === b || a.includes(b) || b.includes(a)) return "exact";
  return sidoOf(a) && sidoOf(a) === sidoOf(b) ? "sido" : "none";
}
