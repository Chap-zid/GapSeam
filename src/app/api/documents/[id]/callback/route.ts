import { NextResponse } from "next/server";
import { replaceDocumentFile } from "@/lib/document-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/documents/[id]/callback">) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { status?: number; url?: string };
    if ((body.status === 2 || body.status === 6) && body.url) {
      const source = new URL(body.url);
      if (!/^https?:$/.test(source.protocol)) throw new Error("Invalid callback URL");
      const allowedHost = new URL(process.env.NEXT_PUBLIC_ONLYOFFICE_URL || "http://localhost:8080").hostname;
      if (source.hostname !== allowedHost && source.hostname !== "document-server") throw new Error("Untrusted callback URL");
      const response = await fetch(source, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error("Edited file download failed");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 20 * 1024 * 1024) throw new Error("Edited file is too large");
      await replaceDocumentFile(id, bytes);
    }
    return NextResponse.json({ error: 0 });
  } catch (error) {
    console.error("Document callback failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: 1 });
  }
}
