import assert from "node:assert/strict";
import { test } from "node:test";
import { fail, ok } from "../src/results.js";

test("ok returns structured content with a text rendering", () => {
  assert.deepEqual(ok({ a: 1 }, "t"), {
    content: [{ type: "text", text: "t" }],
    structuredContent: { a: 1 },
  });
});

test("fail returns an isError result carrying the message", () => {
  assert.deepEqual(fail("m"), {
    content: [{ type: "text", text: "m" }],
    isError: true,
  });
});
