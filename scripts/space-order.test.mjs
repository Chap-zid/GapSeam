import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Timestamp } from "firebase/firestore";
import { sortSpacesNewestFirst } from "../src/lib/space-order.ts";

test("sorts Firestore timestamps and demo dates newest first without changing the input", () => {
  const spaces = [
    { id: "old", createdAt: new Timestamp(100, 0) },
    { id: "new", createdAt: "2026-11-22T00:00:00.000Z" },
    { id: "middle", createdAt: new Date("2026-01-01T00:00:00.000Z") },
  ];
  assert.deepEqual(sortSpacesNewestFirst(spaces).map((space) => space.id), ["new", "middle", "old"]);
  assert.deepEqual(spaces.map((space) => space.id), ["old", "new", "middle"]);
});

test("keeps spaces with missing or invalid dates at the end and sorts ties consistently", () => {
  const spaces = [
    { id: "missing", createdAt: null },
    { id: "z", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "invalid", createdAt: "not a date" },
  ];
  assert.deepEqual(sortSpacesNewestFirst(spaces).map((space) => space.id), ["a", "z", "invalid", "missing"]);
});
