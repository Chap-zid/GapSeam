import { NextResponse } from "next/server";
import { createDocument, listDocuments } from "@/lib/document-store";
import { hasValidFirebaseSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await hasValidFirebaseSession(request))) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({ documents: await listDocuments() });
}

export async function POST(request: Request) {
  if (!(await hasValidFirebaseSession(request))) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
    return NextResponse.json({ document: await createDocument(file) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "파일을 저장하지 못했습니다." }, { status: 400 });
  }
}
