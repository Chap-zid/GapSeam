import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import mammoth from "mammoth";

export type StoredDocument = {
  id: string;
  ownerId?: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  size: number;
  text: string;
  matchId?: string;
};

const root = path.resolve(process.cwd(), "data", "documents");
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
const cloudStorage = bucketName ? new Storage() : null;

function usesCloudStorage() { return Boolean(process.env.K_SERVICE && cloudStorage); }
function cloudDocumentPath(id: string) { return `documents/${id}.docx`; }
function cloudMetaPath(id: string) { return `documents/${id}.json`; }
function bucket() {
  if (!cloudStorage || !bucketName) throw new Error("Firebase Storage is not configured");
  return cloudStorage.bucket(bucketName);
}

function safeId(id: string) {
  return /^[a-f0-9-]{36}$/.test(id) ? id : null;
}

function filePath(id: string) { return path.join(root, `${id}.docx`); }
function metaPath(id: string) { return path.join(root, `${id}.json`); }

async function ensureRoot() { await mkdir(root, { recursive: true }); }

async function extractText(buffer: Buffer) {
  try { return (await mammoth.extractRawText({ buffer })).value.slice(0, 50_000); }
  catch { return ""; }
}

export async function createDocument(file: File, ownerId: string, matchId?: string): Promise<StoredDocument> {
  const extension = path.extname(file.name).toLowerCase();
  if (extension !== ".docx") throw new Error("DOCX 파일만 편집할 수 있습니다.");
  if (file.size > 15 * 1024 * 1024) throw new Error("파일은 15MB 이하여야 합니다.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const now = new Date().toISOString();
  const document: StoredDocument = { id, ownerId, name: path.basename(file.name).slice(0, 150), createdAt: now, updatedAt: now, size: bytes.length, text: await extractText(bytes), ...(matchId ? { matchId: matchId.slice(0, 220) } : {}) };
  if (usesCloudStorage()) {
    await Promise.all([
      bucket().file(cloudDocumentPath(id)).save(bytes, { resumable: false, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      bucket().file(cloudMetaPath(id)).save(JSON.stringify(document), { resumable: false, contentType: "application/json" }),
    ]);
    return document;
  }
  await ensureRoot();
  await writeFile(filePath(id), bytes, { flag: "wx" });
  await writeFile(metaPath(id), JSON.stringify(document));
  return document;
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  const checked = safeId(id); if (!checked) return null;
  if (usesCloudStorage()) {
    try { return JSON.parse((await bucket().file(cloudMetaPath(checked)).download())[0].toString("utf8")) as StoredDocument; }
    catch { return null; }
  }
  try { return JSON.parse(await readFile(metaPath(checked), "utf8")) as StoredDocument; }
  catch { return null; }
}

export async function listDocuments(ownerId: string, matchId?: string) {
  if (usesCloudStorage()) {
    const [files] = await bucket().getFiles({ prefix: "documents/" });
    const documents = await Promise.all(files.filter((file) => file.name.endsWith(".json")).map(async (file) => {
      try { return JSON.parse((await file.download())[0].toString("utf8")) as StoredDocument; }
      catch { return null; }
    }));
    return documents.filter((item): item is StoredDocument => Boolean(item) && (matchId ? item?.matchId === matchId : item?.ownerId === ownerId && !item?.matchId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20);
  }
  await ensureRoot();
  const names = (await readdir(root)).filter((name) => name.endsWith(".json"));
  const documents = await Promise.all(names.map(async (name) => {
    try { return JSON.parse(await readFile(path.join(root, name), "utf8")) as StoredDocument; }
    catch { return null; }
  }));
  return documents.filter((item): item is StoredDocument => Boolean(item) && (matchId ? item?.matchId === matchId : item?.ownerId === ownerId && !item?.matchId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20);
}

export async function readDocumentFile(id: string) {
  const checked = safeId(id); if (!checked) return null;
  if (usesCloudStorage()) {
    try { return (await bucket().file(cloudDocumentPath(checked)).download())[0]; }
    catch { return null; }
  }
  try { return await readFile(filePath(checked)); } catch { return null; }
}

export async function replaceDocumentFile(id: string, bytes: Buffer) {
  const checked = safeId(id); if (!checked) throw new Error("Invalid document id");
  const current = await getDocument(checked); if (!current) throw new Error("Document not found");
  if (usesCloudStorage()) {
    const updated: StoredDocument = { ...current, updatedAt: new Date().toISOString(), size: bytes.length, text: await extractText(bytes) };
    await Promise.all([
      bucket().file(cloudDocumentPath(checked)).save(bytes, { resumable: false, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      bucket().file(cloudMetaPath(checked)).save(JSON.stringify(updated), { resumable: false, contentType: "application/json" }),
    ]);
    return updated;
  }
  await ensureRoot();
  const temporary = path.join(root, `${checked}.${randomUUID()}.tmp`);
  await writeFile(temporary, bytes);
  await rename(temporary, filePath(checked));
  const updated: StoredDocument = { ...current, updatedAt: new Date().toISOString(), size: bytes.length, text: await extractText(bytes) };
  await writeFile(metaPath(checked), JSON.stringify(updated));
  return updated;
}

export async function documentVersion(id: string) {
  const checked = safeId(id); if (!checked) return Date.now();
  if (usesCloudStorage()) {
    const document = await getDocument(checked);
    return document ? Date.parse(document.updatedAt) : Date.now();
  }
  try { return Math.floor((await stat(filePath(checked))).mtimeMs); } catch { return Date.now(); }
}
