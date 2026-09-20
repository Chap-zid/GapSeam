import "server-only";

export type FirebaseSession = { uid: string; name: string; token: string };

export async function getFirebaseSession(request: Request): Promise<FirebaseSession | null> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return { uid: "demo-user", name: "빈틈이음 체험 사용자", token: "" };
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!token || !apiKey) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { users?: { localId?: string; displayName?: string; email?: string }[] };
    const account = data.users?.[0];
    if (!account?.localId) return null;
    return { uid: account.localId, name: account.displayName || account.email?.split("@")[0] || "빈틈이음 사용자", token };
  } catch { return null; }
}

export async function hasValidFirebaseSession(request: Request) {
  return Boolean(await getFirebaseSession(request));
}

// Firebase ID 토큰으로 Firestore REST를 조회하면 동일한 보안 규칙이 적용됩니다.
// 따라서 매칭 당사자가 아닌 계정은 공동 문서함을 열 수 없습니다.
export async function canAccessMatch(session: FirebaseSession, matchId: string) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId || !session.token || !matchId) return false;
  try {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/matches/${encodeURIComponent(matchId)}`, {
      headers: { Authorization: `Bearer ${session.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const data = await response.json() as { fields?: { status?: { stringValue?: string } } };
    return data.fields?.status?.stringValue === "accepted";
  } catch { return false; }
}
