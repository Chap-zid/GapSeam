import { NextRequest, NextResponse } from "next/server";
import { documentVersion, getDocument } from "@/lib/document-store";
import { hasValidFirebaseSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  if (!(await hasValidFirebaseSession(request))) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await context.params;
  const document = await getDocument(id);
  if (!document) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  const origin = new URL(request.url).origin;
  const serverOrigin = process.env.DOCUMENT_SERVER_CALLBACK_ORIGIN || origin;
  return NextResponse.json({
    document,
    editor: {
      document: { fileType: "docx", key: `${id}-${await documentVersion(id)}`, title: document.name, url: `${serverOrigin}/api/documents/${id}/file` },
      documentType: "word",
      editorConfig: { callbackUrl: `${serverOrigin}/api/documents/${id}/callback`, lang: "ko", mode: "edit", user: { id: "gapseam-user", name: "공간이음 사용자" }, customization: { autosave: true, forcesave: true } },
    },
  });
}
