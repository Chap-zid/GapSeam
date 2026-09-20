import { NextRequest, NextResponse } from "next/server";
import { documentVersion, getDocument } from "@/lib/document-store";
import { canAccessMatch, getFirebaseSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function documentServerOrigin(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const configuredOrigin = process.env.DOCUMENT_SERVER_CALLBACK_ORIGIN;
  if (configuredOrigin && !configuredOrigin.includes("0.0.0.0")) return configuredOrigin;
  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(requestUrl.hostname)) return `http://host.docker.internal:${requestUrl.port || "3000"}`;
  return requestUrl.origin;
}

export async function GET(request: NextRequest, context: RouteContext<"/api/documents/[id]">) {
  const session = await getFirebaseSession(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await context.params;
  const document = await getDocument(id);
  if (!document) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  if (document.matchId && !(await canAccessMatch(session, document.matchId))) return NextResponse.json({ error: "이 공동 문서에 접근할 권한이 없습니다." }, { status: 403 });
  const serverOrigin = documentServerOrigin(request);
  return NextResponse.json({
    document,
    editor: {
      document: { fileType: "docx", key: `${id}-${await documentVersion(id)}`, title: document.name, url: `${serverOrigin}/api/documents/${id}/file` },
      documentType: "word",
      editorConfig: { callbackUrl: `${serverOrigin}/api/documents/${id}/callback`, lang: "ko", mode: "edit", user: { id: session.uid, name: session.name }, customization: { autosave: true, forcesave: true } },
    },
  });
}
