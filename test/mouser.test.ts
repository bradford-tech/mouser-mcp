import { getCart, searchByKeyword } from "@bradford-tech/mouser-sdk";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createLimiter, DailyLimitError } from "../src/limiter.js";
import { callMouser, MouserError, toToolError } from "../src/mouser.js";
import { mouserWithFetch } from "./helpers.js";

const limiter = createLimiter({ sleep: () => Promise.resolve() });
const body = { SearchByKeywordRequest: { keyword: "x" } };

test("returns data on success", async () => {
  const { client } = mouserWithFetch(() => ({
    SearchResults: { NumberOfResult: 2 },
  }));
  const data = await callMouser(limiter, () =>
    searchByKeyword({ client, body }),
  );
  assert.equal(data.SearchResults?.NumberOfResult, 2);
});

test("turns Errors[] in a 200 response into a MouserError", async () => {
  const { client } = mouserWithFetch(() => ({
    Errors: [{ Message: "Invalid part" }, { Message: "Second" }],
  }));
  await assert.rejects(
    callMouser(limiter, () => searchByKeyword({ client, body })),
    (err: Error) =>
      err instanceof MouserError && err.message === "Invalid part; Second",
  );
});

test("surfaces Mouser's message on an HTTP error", async () => {
  const { client } = mouserWithFetch(
    () =>
      new Response(
        JSON.stringify({
          Message: "Authorization has been denied for this request.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
  );
  await assert.rejects(
    callMouser(limiter, () => searchByKeyword({ client, body })),
    {
      message: "Authorization has been denied for this request.",
    },
  );
});

test("surfaces the SDK's missing-key message", async () => {
  const { client, requests } = mouserWithFetch(() => ({}), {
    order: undefined,
  });
  await assert.rejects(
    callMouser(limiter, () => getCart({ client, query: { cartKey: "k" } })),
    (err: Error) =>
      err instanceof MouserError &&
      err.message.startsWith("No Mouser order API key"),
  );
  assert.equal(requests.length, 0);
});

test("toToolError maps Mouser and daily-limit errors to isError results", () => {
  assert.deepEqual(toToolError(new MouserError("boom")), {
    content: [{ type: "text", text: "boom" }],
    isError: true,
  });
  assert.equal(toToolError(new DailyLimitError("limit")).isError, true);
  assert.throws(() => toToolError(new TypeError("bug")), TypeError);
});
