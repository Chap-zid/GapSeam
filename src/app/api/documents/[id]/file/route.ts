import { NextResponse } from "next/server";
import { getDocument, readDocumentFile } from "@/lib/document-store";

export const runtime = "nodejs";

export async function GET(_: Request, context: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await context.params;
  const [document, bytes] = await Promise.all([getDocument(id), readDocumentFile(id)]);
  if (!document || !bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`, "Cache-Control": "no-store" } });
}
