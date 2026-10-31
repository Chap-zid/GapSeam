import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { getBlob, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, isFirebaseReady, storage } from "./firebase";
import { demoId, readDemo, subscribeDemo, writeDemo } from "./demo-store";
import { type ChatMessage, type ChatRole, type MatchDocument, type Role, type Space, type SpaceMatch, type SpaceRequest, type UserProfile } from "./types";
import { BROKER_NAME } from "./broker";
import { runSpaceAgent } from "./agent-tools";
import { matchingTool, type MatchResult } from "./matching";
import { withTimeout } from "./safety";

export async function saveRequest(input: Omit<SpaceRequest, "id" | "createdAt">) {
  if (!isFirebaseReady || !db) {
    const item = { ...input, id: demoId("request"), createdAt: new Date().toISOString() };
    const data = readDemo(); writeDemo({ ...data, requests: [...data.requests, item] }); return item.id;
  }
  const ref = await addDoc(collection(db, "requests"), { ...input, createdAt: serverTimestamp() });
  return ref.id;
}

export async function uploadSpaceImages(spaceId: string, files: File[]) {
  if (!isFirebaseReady || !storage || !files.length) return ["/images/space-hero.png"];
  try {
    return await Promise.all(files.map(async (file, index) => {
      const target = ref(storage!, `spaces/${spaceId}/${Date.now()}-${index}-${file.name}`);
      await uploadBytes(target, file); return getDownloadURL(target);
    }));
  } catch { return ["/images/space-hero.png"]; }
}

export async function saveSpace(input: Omit<Space, "id" | "createdAt" | "imageUrls">, files: File[]) {
  const id = demoId("space");
  const imageUrls = await uploadSpaceImages(id, files);
  if (!isFirebaseReady || !db) {
    const item = { ...input, id, imageUrls, createdAt: new Date().toISOString() };
    const data = readDemo(); writeDemo({ ...data, spaces: [...data.spaces, item] }); return id;
  }
  await setDoc(doc(db, "spaces", id), { ...input, imageUrls, createdAt: serverTimestamp() });
  return id;
}

export const PROOF_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_ID_FILES = 2;
export const MAX_PROOF_FILES = 3;

// 신분증의 이름과 소유 서류의 소유자 이름을 운영자가 대조하므로 세 항목을 모두 받아야 제출할 수 있습니다.
export function ownerVerificationInputError(legalName: string, idFiles: File[], proofFiles: File[]) {
  if (!legalName.trim() || !idFiles.length || !proofFiles.length) return "소유자 확인을 신청하려면 이름, 신분증, 소유 증빙 서류를 모두 첨부해주세요.";
  if (idFiles.length > MAX_ID_FILES || proofFiles.length > MAX_PROOF_FILES) return `신분증은 ${MAX_ID_FILES}개, 소유 증빙 서류는 ${MAX_PROOF_FILES}개까지 첨부할 수 있습니다.`;
  if ([...idFiles, ...proofFiles].some((file) => !PROOF_FILE_TYPES.includes(file.type) || file.size > 15 * 1024 * 1024)) return "PDF 또는 JPG, PNG, WebP 파일을 장당 15MB 이하로 제출해주세요.";
  return "";
}

export async function submitOwnerVerification(spaceId: string, ownerId: string, legalName: string, idFiles: File[], proofFiles: File[]) {
  if (!isFirebaseReady || !db || !storage) throw new Error("Firebase Storage 설정이 필요합니다.");
  const inputError = ownerVerificationInputError(legalName, idFiles, proofFiles);
  if (inputError) throw new Error(inputError);
  const previous = await getDoc(doc(db, "ownerVerifications", spaceId));
  if (previous.exists() && previous.data().status !== "rejected") throw new Error("이미 제출한 서류가 검토 중이거나 인증 완료 상태입니다.");
  const upload = (files: File[], kind: "id" | "doc") => Promise.all(files.map(async (file, index) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `ownership-proofs/${ownerId}/${spaceId}/${Date.now()}-${kind}${index}-${safeName}`;
    await uploadBytes(ref(storage!, path), file, { contentType: file.type });
    return path;
  }));
  const [idPaths, proofPaths] = await Promise.all([upload(idFiles, "id"), upload(proofFiles, "doc")]);
  const verificationRef = doc(db, "ownerVerifications", spaceId);
  const submission = {
    spaceId,
    ownerId,
    legalName: legalName.trim().slice(0, 100),
    idPaths,
    proofPaths,
    status: "pending",
    reviewNote: "",
    submittedAt: serverTimestamp(),
  };
  if (previous.exists()) await updateDoc(verificationRef, submission);
  else await setDoc(verificationRef, submission);
}

export async function getOwnerVerification(spaceId: string, ownerId: string) {
  if (!isFirebaseReady || !db) return null;
  const snapshot = await getDoc(doc(db, "ownerVerifications", spaceId));
  if (!snapshot.exists() || snapshot.data().ownerId !== ownerId) return null;
  const data = snapshot.data();
  return { status: data.status as "pending" | "verified" | "rejected", reviewNote: typeof data.reviewNote === "string" ? data.reviewNote : "", hasId: Array.isArray(data.idPaths) && data.idPaths.length > 0 };
}

export type OwnerVerificationReview = {
  id: string;
  spaceId: string;
  ownerId: string;
  legalName: string;
  // 이전 제출에는 신분증이 없을 수 있습니다. 그 경우 운영자가 보완 요청으로 신분증을 받습니다.
  idPaths?: string[];
  proofPaths: string[];
  status: "pending" | "verified" | "rejected";
  reviewNote: string;
  checks?: OwnerVerificationChecks;
  submittedAt: unknown;
};

// 운영자가 확인 완료 전에 모두 체크해야 하는 대조 항목입니다. Firestore 규칙에서도 같은 조건을 검사합니다.
export type OwnerVerificationChecks = { idName: boolean; docName: boolean; address: boolean };

export function watchOwnerVerificationQueue(callback: (items: OwnerVerificationReview[]) => void, onError: (error: Error) => void) {
  if (!db) { onError(new Error("Firebase 연결 설정을 확인해주세요.")); return () => {}; }
  return onSnapshot(query(collection(db, "ownerVerifications"), orderBy("submittedAt", "desc"), limit(100)), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as OwnerVerificationReview)));
  }, onError);
}

export async function loadOwnerProof(spaceId: string, ownerId: string, path: string) {
  if (!storage || !path.startsWith(`ownership-proofs/${ownerId}/${spaceId}/`)) throw new Error("증빙 파일 경로가 올바르지 않습니다.");
  const blob = await getBlob(ref(storage, path));
  return URL.createObjectURL(blob);
}

export async function reviewOwnerVerification(spaceId: string, reviewerId: string, status: "verified" | "rejected", reviewNote: string, checks: OwnerVerificationChecks) {
  if (!db) throw new Error("Firebase 연결 설정을 확인해주세요.");
  if (status === "verified" && !(checks.idName && checks.docName && checks.address)) throw new Error("이름·소재지 대조 항목을 모두 확인해야 확인 완료할 수 있습니다.");
  await updateDoc(doc(db, "ownerVerifications", spaceId), {
    status,
    checks,
    reviewNote: reviewNote.trim().slice(0, 1000),
    reviewedBy: reviewerId,
    reviewedAt: serverTimestamp(),
  });
}

export async function finishAnalysis(space: Space, acknowledgeLowConfidence = false) {
  const result = await runSpaceAgent(space, acknowledgeLowConfidence);
  const analysis = result.analysis;
  // 근거가 부족해 멈춘 경우에는 아무것도 저장하지 않습니다.
  if (!analysis) return result;
  if (!isFirebaseReady || !db) {
    const data = readDemo(); writeDemo({ ...data, spaces: data.spaces.map((s) => s.id === space.id ? { ...s, analysis } : s) }); return result;
  }
  await updateDoc(doc(db, "spaces", space.id), { analysis });
  return result;
}

export async function getSpace(spaceId: string): Promise<Space | null> {
  if (!isFirebaseReady || !db) return readDemo().spaces.find((s) => s.id === spaceId) || null;
  const snap = await getDoc(doc(db, "spaces", spaceId)); return snap.exists() ? { id: snap.id, ...snap.data() } as Space : null;
}

export type RankedRequest = { request: SpaceRequest; match: MatchResult };

async function allRequests(): Promise<SpaceRequest[]> {
  if (!isFirebaseReady || !db) return readDemo().requests;
  const snap = await getDocs(query(collection(db, "requests"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SpaceRequest));
}

// 등록된 모든 요청을 matchingTool로 채점한 뒤 점수순으로 정렬합니다.
export async function rankRequests(space: Space): Promise<RankedRequest[]> {
  const requests = await allRequests();
  return requests
    .map((request) => ({ request, match: matchingTool(space, request) }))
    .sort((left, right) => right.match.score - left.match.score);
}

export async function getRequest(requestId: string): Promise<SpaceRequest | null> {
  if (!isFirebaseReady || !db) return readDemo().requests.find((r) => r.id === requestId) || null;
  const snap = await getDoc(doc(db, "requests", requestId)); return snap.exists() ? { id: snap.id, ...snap.data() } as SpaceRequest : null;
}

export function calculateMatch(space: Space, request: SpaceRequest) {
  return matchingTool(space, request);
}

export async function sendProposal(space: Space, request: SpaceRequest, match?: MatchResult, approvedPrice?: string) {
  const result = match || calculateMatch(space, request);
  const payload = { spaceId: space.id, requestId: request.id, ownerId: space.ownerId, seekerId: request.seekerId, score: result.score, reason: result.reason, approvedPrice: approvedPrice || space.analysis?.estimatedPrice || "협의", initiator: "owner" as const, algorithmVersion: result.algorithmVersion, status: "proposed" as const };
  if (!isFirebaseReady || !db) {
    const data = readDemo();
    const existing = data.matches.find((m) => m.spaceId === space.id && m.requestId === request.id);
    if (existing?.status === "applied") throw new Error("이 이용자가 이미 공간 이용을 신청했습니다. 소유자 대시보드에서 응답해주세요.");
    if (existing) writeDemo({ ...data, matches: data.matches.map((m) => m.id === existing.id ? { ...m, ...payload } : m) });
    else writeDemo({ ...data, matches: [...data.matches, { ...payload, id: demoId("match"), createdAt: new Date().toISOString() }] });
    return;
  }
  // 같은 공간·요청 조합은 항상 같은 문서가 되도록 ID를 고정합니다.
  // 예전처럼 matches를 조회하면 보안 규칙이 요구하는 ownerId 조건이 없어 쿼리가 거부됩니다.
  const id = `${space.id}__${request.id}`;
  await withTimeout(setDoc(doc(db, "matches", id), { ...payload, createdAt: serverTimestamp() }, { merge: true }), 12_000, "제안을 보내지 못했습니다. 연결 상태를 확인해주세요.");
}

export async function applyToSpace(space: Space, request: SpaceRequest, match?: MatchResult) {
  const result = match || calculateMatch(space, request);
  const id = `${space.id}__${request.id}`;
  const payload = { spaceId: space.id, requestId: request.id, ownerId: space.ownerId, seekerId: request.seekerId, score: result.score, reason: result.reason, approvedPrice: space.analysis?.estimatedPrice || "협의", initiator: "seeker" as const, algorithmVersion: result.algorithmVersion, status: "applied" as const };
  if (!isFirebaseReady || !db) {
    const data = readDemo();
    if (data.matches.some((item) => item.id === id)) throw new Error("이미 이 공간과 연결 요청이 진행 중입니다.");
    writeDemo({ ...data, matches: [...data.matches, { ...payload, id, createdAt: new Date().toISOString() }] });
    return id;
  }
  try {
    await withTimeout(setDoc(doc(db, "matches", id), { ...payload, createdAt: serverTimestamp() }), 12_000, "공간 이용 신청을 보내지 못했습니다.");
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code.includes("permission-denied")) throw new Error("이미 진행 중인 연결이 있거나 신청 권한을 확인할 수 없습니다. 대시보드에서 현재 상태를 확인해주세요.");
    throw error;
  }
  return id;
}

export async function respondToMatch(id: string, status: "accepted" | "rejected") {
  if (!isFirebaseReady || !db) { const data = readDemo(); writeDemo({ ...data, matches: data.matches.map((m) => m.id === id ? { ...m, status } : m) }); return; }
  await withTimeout(updateDoc(doc(db, "matches", id), { status }), 12_000, "응답을 저장하지 못했습니다. 연결 상태를 확인해주세요.");
}

export function watchRequests(seekerId: string, callback: (items: SpaceRequest[]) => void) {
  if (!isFirebaseReady || !db) { const emit = () => callback(readDemo().requests.filter((r) => r.seekerId === seekerId)); emit(); return subscribeDemo(emit); }
  return onSnapshot(query(collection(db, "requests"), where("seekerId", "==", seekerId)), (s) => callback(s.docs.map((d) => ({ id: d.id, ...d.data() } as SpaceRequest))));
}

export function watchMatches(role: Role, uid: string, callback: (items: SpaceMatch[]) => void) {
  if (!isFirebaseReady || !db) { const emit = () => callback(readDemo().matches.filter((m) => role === "owner" ? m.ownerId === uid : m.seekerId === uid)); emit(); return subscribeDemo(emit); }
  return onSnapshot(query(collection(db, "matches"), where(role === "owner" ? "ownerId" : "seekerId", "==", uid)), (s) => callback(s.docs.map((d) => ({ id: d.id, ...d.data() } as SpaceMatch))));
}

export function watchSpaces(ownerId: string, callback: (items: Space[]) => void) {
  if (!isFirebaseReady || !db) { const emit = () => callback(readDemo().spaces.filter((s) => s.ownerId === ownerId)); emit(); return subscribeDemo(emit); }
  return onSnapshot(query(collection(db, "spaces"), where("ownerId", "==", ownerId)), (s) => callback(s.docs.map((d) => ({ id: d.id, ...d.data() } as Space))));
}

export function watchAllSpaces(callback: (items: Space[]) => void) {
  if (!isFirebaseReady || !db) { const emit = () => callback(readDemo().spaces); emit(); return subscribeDemo(emit); }
  return onSnapshot(collection(db, "spaces"), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Space))));
}

export function watchMatch(matchId: string, callback: (item: SpaceMatch | null) => void) {
  if (!isFirebaseReady || !db) { const emit = () => callback(readDemo().matches.find((item) => item.id === matchId) || null); emit(); return subscribeDemo(emit); }
  return onSnapshot(doc(db, "matches", matchId), (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as SpaceMatch : null));
}

export function watchChat(matchId: string, callback: (items: ChatMessage[]) => void) {
  if (!isFirebaseReady || !db) { const emit = () => callback(readDemo().messages.filter((item) => item.matchId === matchId)); emit(); return subscribeDemo(emit); }
  return onSnapshot(query(collection(db, "matches", matchId, "messages"), orderBy("createdAt", "asc")), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatMessage))));
}

export async function sendChatMessage(matchId: string, user: UserProfile, text: string) {
  return writeChatMessage(matchId, user, text, user.role);
}

// 중개 에이전트 발언도 같은 대화 기록에 남겨 양측이 동일한 내용을 보도록 합니다.
export async function sendBrokerMessage(matchId: string, user: UserProfile, text: string) {
  return writeChatMessage(matchId, user, text, "agent", BROKER_NAME);
}

async function writeChatMessage(matchId: string, user: UserProfile, text: string, role: ChatRole, displayName?: string) {
  const cleaned = text.trim().slice(0, 1_000);
  if (!cleaned) return;
  const senderName = displayName || user.name;
  if (!isFirebaseReady || !db) {
    const data = readDemo();
    const message: ChatMessage = { id: demoId("message"), matchId, senderId: user.uid, senderName, role, text: cleaned, createdAt: new Date().toISOString() };
    writeDemo({ ...data, messages: [...data.messages, message] });
    return;
  }
  await withTimeout(addDoc(collection(db, "matches", matchId, "messages"), { matchId, senderId: user.uid, senderName, role, text: cleaned, createdAt: serverTimestamp() }), 12_000, "메시지를 보내지 못했습니다.");
}

const SHARED_DOCUMENT_ID = "shared-plan";

function documentVersion(value: unknown) {
  if (!value || typeof value !== "object") return String(value ?? "");
  const timestamp = value as { seconds?: number; nanoseconds?: number; toMillis?: () => number };
  if (typeof timestamp.seconds === "number") return `${timestamp.seconds}.${timestamp.nanoseconds || 0}`;
  if (typeof timestamp.toMillis === "function") return String(timestamp.toMillis());
  return JSON.stringify(value);
}

export function watchMatchDocument(matchId: string, callback: (item: MatchDocument | null) => void) {
  if (!isFirebaseReady || !db) { const emit = () => callback(readDemo().documents.find((item) => item.matchId === matchId) || null); emit(); return subscribeDemo(emit); }
  return onSnapshot(doc(db, "matches", matchId, "documents", SHARED_DOCUMENT_ID), (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as MatchDocument : null));
}

export async function saveMatchDocument(matchId: string, user: UserProfile, title: string, content: string, expectedVersion = "") {
  const payload = { matchId, title: title.trim().slice(0, 120) || "공간 활용 협의서", content: content.slice(0, 50_000), updatedBy: user.uid, updatedByName: user.name };
  if (!isFirebaseReady || !db) {
    const data = readDemo();
    const current = data.documents.find((item) => item.matchId === matchId);
    const document: MatchDocument = { ...payload, id: SHARED_DOCUMENT_ID, updatedAt: new Date().toISOString() };
    writeDemo({ ...data, documents: current ? data.documents.map((item) => item.matchId === matchId ? document : item) : [...data.documents, document] });
    return;
  }
  const reference = doc(db, "matches", matchId, "documents", SHARED_DOCUMENT_ID);
  await withTimeout(runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const currentVersion = snapshot.exists() ? documentVersion(snapshot.data().updatedAt) : "";
    if (currentVersion !== expectedVersion) throw new Error("상대방이 새 버전을 저장했습니다. 새 버전을 불러온 뒤 다시 저장해주세요.");
    transaction.set(reference, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
  }), 12_000, "공동 문서를 저장하지 못했습니다.");
}
