import type { Role } from "./types";

export function roleForPath(path: string): Role | null {
  if (path.startsWith("/owner/") || path.startsWith("/agent/")) return "owner";
  if (path.startsWith("/seeker/") || path.startsWith("/request/")) return "seeker";
  return null;
}

export function afterLogin(role: Role, next: string | null): string {
  if (next && !next.includes("\\") && !next.includes("%") && !next.includes("..") && (next === "/mypage" || roleForPath(next) === role)) return next;
  return "/" + role + "/dashboard";
}
