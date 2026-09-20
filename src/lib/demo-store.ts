import type { ChatMessage, Role, Space, SpaceMatch, SpaceRequest, UserProfile } from "./types";

const KEY = "binteum-ieum-demo";
const CHANNEL = "binteum-ieum-live";

type DemoData = {
  users: UserProfile[];
  spaces: Space[];
  requests: SpaceRequest[];
  matches: SpaceMatch[];
  messages: ChatMessage[];
};

const empty = (): DemoData => ({ users: [], spaces: [], requests: [], matches: [], messages: [] });

export function readDemo(): DemoData {
  if (typeof window === "undefined") return empty();
  try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); return saved ? { ...empty(), ...saved } : empty(); }
  catch { return empty(); }
}

export function writeDemo(data: DemoData) {
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("binteum-ieum-change"));
  new BroadcastChannel(CHANNEL).postMessage("change");
}

export function demoId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getDemoUser(role: Role): UserProfile {
  const uid = `demo-${role}`;
  const profile = { uid, role, name: role === "owner" ? "김공간" : "모퉁이 공방" } as UserProfile;
  const data = readDemo();
  if (!data.users.some((u) => u.uid === uid)) writeDemo({ ...data, users: [...data.users, profile] });
  return profile;
}

export function subscribeDemo(callback: () => void) {
  const channel = new BroadcastChannel(CHANNEL);
  const handler = () => callback();
  channel.onmessage = handler;
  window.addEventListener("binteum-ieum-change", handler);
  return () => { channel.close(); window.removeEventListener("binteum-ieum-change", handler); };
}
