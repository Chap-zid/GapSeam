function createdAtMillis(value: unknown): number | null {
  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const time: unknown = value.toMillis();
    return typeof time === "number" && Number.isFinite(time) ? time : null;
  }
  return null;
}

export function sortSpacesNewestFirst<T extends { id: string; createdAt: unknown }>(spaces: T[]): T[] {
  return [...spaces].sort((a, b) => {
    const left = createdAtMillis(a.createdAt);
    const right = createdAtMillis(b.createdAt);
    if (left === null && right !== null) return 1;
    if (left !== null && right === null) return -1;
    if (left !== null && right !== null && left !== right) return right - left;
    return a.id.localeCompare(b.id);
  });
}
