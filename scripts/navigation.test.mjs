import { strict as assert } from "node:assert";
import { test } from "node:test";
import { afterLogin, roleForPath } from "../src/lib/navigation.ts";
test("login returns to the intended page for the existing role", () => {
  assert.equal(afterLogin("owner", "/owner/new"), "/owner/new");
  assert.equal(afterLogin("owner", "/agent/space-1"), "/agent/space-1");
  assert.equal(afterLogin("seeker", "/request/new"), "/request/new");
  assert.equal(afterLogin("seeker", "/mypage"), "/mypage");
});
test("login does not change role or loop back to login", () => {
  assert.equal(afterLogin("owner", "/seeker/dashboard"), "/owner/dashboard");
  assert.equal(afterLogin("seeker", "/login"), "/seeker/dashboard");
  assert.equal(afterLogin("owner", null), "/owner/dashboard");
});
test("external and malformed return URLs cannot redirect", () => {
  for (const next of ["https://example.com", "//example.com", "/owner/../login", "/owner/%2e%2e/login"]) {
    assert.equal(afterLogin("owner", next), "/owner/dashboard");
  }
});
test("private pages retain the intended role", () => {
  assert.equal(roleForPath("/agent/123"), "owner");
  assert.equal(roleForPath("/request/new"), "seeker");
  assert.equal(roleForPath("/"), null);
});
