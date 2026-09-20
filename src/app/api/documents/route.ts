import { NextResponse } from "next/server";
import { createDocument, listDocuments } from "@/lib/document-store";
import { canAccessMatch, getFirebaseSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getFirebaseSession(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const matchId = new URL(request.url).searchParams.get("matchId") || undefined;
  if (matchId && !(await canAccessMatch(session, matchId))) return NextResponse.json({ error: "이 매칭의 공동 문서에 접근할 권한이 없습니다." }, { status: 403 });
  return NextResponse.json({ documents: await listDocuments(matchId) });
}

export async function POST(request: Request) {
  const session = await getFirebaseSession(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const data = await request.formData();
    const file = data.get("file");
    const matchId = String(data.get("matchId") || "").trim() || undefined;
    if (matchId && !(await canAccessMatch(session, matchId))) return NextResponse.json({ error: "이 매칭의 공동 문서에 접근할 권한이 없습니다." }, { status: 403 });
    if (!(file instanceof File)) return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
    return NextResponse.json({ document: await createDocument(file, matchId) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "파일을 저장하지 못했습니다." }, { status: 400 });
  }
}
