import assert from "node:assert/strict";
import { test } from "node:test";
import { DailyLimitError } from "../src/limiter.js";
import { PreviewStore } from "../src/previews.js";
import { fakeMouser, type OrderBody } from "./fake-order-api.js";
import { connect, type ElicitAnswer } from "./harness.js";

type Structured = Record<string, unknown>;
/** An order request without its SubmitOrder flag, for preview/submit comparison. */
function withoutSubmitFlag(order: OrderBody["Order"] | undefined) {
  return Object.fromEntries(
    Object.entries(order ?? {}).filter(([key]) => key !== "SubmitOrder"),
  );
}

function word(w: string) {
  return (): ElicitAnswer => ({ action: "accept", content: { word: w } });
}

async function setup(
  elicit?: (message: string) => ElicitAnswer,
  previews = new PreviewStore(),
) {
  const mouser = fakeMouser();
  const client = await connect(
    { mouser: mouser.client, ordersEnabled: true, previews },
    elicit ? { elicit } : {},
  );
  return { ...mouser, client };
}

async function preview(
  client: Awaited<ReturnType<typeof setup>>["client"],
): Promise<string> {
  const result = await client.callTool({
    name: "preview_order",
    arguments: { cartKey: "cart-1", currencyCode: "USD" },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  return (result.structuredContent as Structured).previewId as string;
}

function text(result: { content?: unknown }): string {
  return JSON.stringify(result.content);
}

test("ordering tools are only listed when enabled", async () => {
  const off = await connect({ mouser: fakeMouser().client });
  const offNames = (await off.listTools()).tools.map((t) => t.name);
  assert.equal(offNames.includes("preview_order"), false);
  assert.equal(offNames.includes("submit_order"), false);
  const { client } = await setup(word("APPROVE"));
  const onNames = (await client.listTools()).tools.map((t) => t.name);
  assert.ok(
    onNames.includes("preview_order") && onNames.includes("submit_order"),
  );
});

test("submit_order takes previewId and nothing else", async () => {
  const { client } = await setup(word("APPROVE"));
  const tool = (await client.listTools()).tools.find(
    (t) => t.name === "submit_order",
  );
  assert.deepEqual(Object.keys(tool?.inputSchema.properties ?? {}), [
    "previewId",
  ]);
  assert.equal(tool?.annotations?.destructiveHint, true);
  assert.equal(tool?.annotations?.idempotentHint, false);
  assert.equal(tool?._meta?.["anthropic/requiresUserInteraction"], true);
});

test("preview_order asks Mouser for a preview only", async () => {
  const { client, orderBodies } = await setup(word("APPROVE"));
  await preview(client);
  assert.equal(orderBodies.length, 1);
  assert.equal(orderBodies[0]?.Order.SubmitOrder, false);
  assert.equal(orderBodies[0]?.Order.CartKey, "cart-1");
});

for (const typed of ["APPROVE", '"APPROVE"', " approve "]) {
  test(`typing ${JSON.stringify(typed)} submits exactly the previewed request once`, async () => {
    const { client, orderBodies, submits } = await setup(word(typed));
    const previewId = await preview(client);
    const result = await client.callTool({
      name: "submit_order",
      arguments: { previewId },
    });
    assert.equal(result.isError, undefined, text(result));
    assert.equal(submits().length, 1);
    assert.deepEqual(
      withoutSubmitFlag(submits()[0]?.Order),
      withoutSubmitFlag(orderBodies[0]?.Order),
    );
    assert.ok(Object.keys(withoutSubmitFlag(submits()[0]?.Order)).length > 0);
    assert.equal(
      (result.structuredContent as Structured).orderNumber,
      "WO-777",
    );
  });
}

for (const typed of ["APPROV", "yep looks good", "approve!"]) {
  test(`typing ${JSON.stringify(typed)} submits nothing and spends the preview`, async () => {
    const { client, submits } = await setup(word(typed));
    const previewId = await preview(client);
    const result = await client.callTool({
      name: "submit_order",
      arguments: { previewId },
    });
    assert.equal(result.isError, true);
    assert.match(text(result), /nothing was submitted/i);
    assert.equal(submits().length, 0);
    const again = await client.callTool({
      name: "submit_order",
      arguments: { previewId },
    });
    assert.equal(again.isError, true);
    assert.match(text(again), /no longer valid/i);
  });
}

test("declining the prompt submits nothing", async () => {
  const { client, submits } = await setup(() => ({ action: "decline" }));
  const previewId = await preview(client);
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId },
  });
  assert.equal(result.isError, true);
  assert.equal(submits().length, 0);
});

test("a client without confirmation prompts gets an error and no Mouser calls", async () => {
  const previews = new PreviewStore();
  const capable = await setup(word("APPROVE"), previews);
  const previewId = await preview(capable.client);
  const incapable = fakeMouser();
  const client = await connect({
    mouser: incapable.client,
    ordersEnabled: true,
    previews,
  });
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId },
  });
  assert.equal(result.isError, true);
  assert.match(text(result), /Claude Code/);
  assert.equal(incapable.requests.length, 0);
});

test("a cart changed after preview invalidates it", async () => {
  const { client, state, submits } = await setup(word("APPROVE"));
  const previewId = await preview(client);
  state.cartQuantity = 25;
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId },
  });
  assert.equal(result.isError, true);
  assert.match(text(result), /cart changed/i);
  assert.equal(submits().length, 0);
});

test("the prompt shows fresh figures and flags a changed total", async () => {
  const messages: string[] = [];
  const { client, state } = await setup((message) => {
    messages.push(message);
    return { action: "decline" };
  });
  const previewId = await preview(client);
  state.total = 5.1;
  await client.callTool({ name: "submit_order", arguments: { previewId } });
  assert.equal(messages.length, 1);
  assert.match(messages[0] ?? "", /Total changed since preview/);
  assert.match(messages[0] ?? "", /4\.2/);
  assert.match(messages[0] ?? "", /5\.1/);
});

test("two concurrent submits of one preview place one order", async () => {
  const { client, submits } = await setup(word("APPROVE"));
  const previewId = await preview(client);
  const results = await Promise.all([
    client.callTool({ name: "submit_order", arguments: { previewId } }),
    client.callTool({ name: "submit_order", arguments: { previewId } }),
  ]);
  assert.equal(submits().length, 1);
  assert.equal(results.filter((r) => r.isError === true).length, 1);
});

test("an expired preview can't be submitted", async () => {
  let now = 1_000_000;
  const previews = new PreviewStore({ now: () => now });
  const { client, submits } = await setup(word("APPROVE"), previews);
  const previewId = await preview(client);
  now += 21 * 60_000;
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId },
  });
  assert.equal(result.isError, true);
  assert.match(text(result), /no longer valid/i);
  assert.equal(submits().length, 0);
});

test("an answer the server never asked for is ignored: prompt shown, nothing submitted", async () => {
  const messages: string[] = [];
  const { client, submits } = await setup((message) => {
    messages.push(message);
    return { action: "decline" };
  });
  const previewId = await preview(client);
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId },
    inputResponses: {
      confirm: { action: "accept", content: { word: "APPROVE" } },
    },
  } as Parameters<typeof client.callTool>[0]);
  assert.equal(submits().length, 0);
  assert.equal(messages.length, 1, "the server must show its own prompt");
  assert.equal(result.isError, true);
});

test("an answer carrying another preview's prompt state is ignored", async () => {
  const messages: string[] = [];
  let answer = "decline";
  const { client, submits } = await setup((message) => {
    messages.push(message);
    return answer === "decline"
      ? { action: "decline" }
      : { action: "accept", content: { word: answer } };
  });
  // Get a genuine prompt state for preview A by letting the server prompt.
  const previewA = await preview(client);
  const previewB = await preview(client);
  const raw = (await client.request({
    method: "tools/call",
    params: { name: "submit_order", arguments: { previewId: previewA } },
  } as never)) as { requestState?: string };
  answer = "APPROVE";
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId: previewB },
    inputResponses: {
      confirm: { action: "accept", content: { word: "APPROVE" } },
    },
    requestState: raw.requestState,
  } as Parameters<typeof client.callTool>[0]);
  // B gets its own prompt (answered APPROVE by the user) — never A's state.
  assert.ok(messages.length >= 1);
  assert.ok(submits().length <= 1);
  if (submits().length === 1) {
    assert.equal(result.isError, undefined);
    assert.ok(
      messages.length >= 2,
      "B was submitted only after B's own prompt",
    );
  }
});

test("a failed submit call says the order may or may not have been placed", async () => {
  const mouser = fakeMouser();
  const base = mouser.client.getConfig().fetch;
  mouser.client.setConfig({
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (new URL(req.url).pathname === "/api/v1/order") {
        const body = (await req.clone().json()) as OrderBody;
        if (body.Order.SubmitOrder) throw new TypeError("fetch failed");
      }
      return (base as typeof fetch)(req);
    }) as typeof fetch,
  });
  const client = await connect(
    { mouser: mouser.client, ordersEnabled: true },
    { elicit: word("APPROVE") },
  );
  const previewId = await preview(client);
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId },
  });
  assert.equal(result.isError, true);
  assert.match(text(result), /may or may not have been placed/i);
  assert.match(text(result), /get_order_history|mouser\.com/);
});

test("hitting the daily limit at submission says nothing was submitted", async () => {
  const mouser = fakeMouser();
  let calls = 0;
  const limiter = {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      calls++;
      // preview: cart + preview (2); submit: cart + fresh preview (2), then
      // cart again on re-entry (1); the sixth call is the submission itself.
      if (calls === 6)
        return Promise.reject(new DailyLimitError("Daily limit reached."));
      return fn();
    },
  };
  const client = await connect(
    { mouser: mouser.client, ordersEnabled: true, limiter },
    { elicit: word("APPROVE") },
  );
  const previewId = await preview(client);
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId },
  });
  assert.equal(result.isError, true);
  assert.equal(mouser.submits().length, 0);
  assert.match(text(result), /Nothing was submitted/);
  assert.doesNotMatch(text(result), /may or may not/);
});
