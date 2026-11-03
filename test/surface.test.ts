import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "./harness.js";
import { mouserWithFetch } from "./helpers.js";

const ORDER_TOOLS = ["preview_order", "submit_order"];
const DESTRUCTIVE = [
  "remove_from_cart",
  "manage_scheduled_releases",
  "submit_order",
];

async function tools(ordersEnabled: boolean) {
  const client = await connect({
    mouser: mouserWithFetch(() => ({})).client,
    ordersEnabled,
  });
  return (await client.listTools()).tools;
}

test("16 tools with ordering enabled, 14 without", async () => {
  assert.equal((await tools(true)).length, 16);
  const off = (await tools(false)).map((t) => t.name);
  assert.equal(off.length, 14);
  for (const name of ORDER_TOOLS) assert.equal(off.includes(name), false, name);
});

test("every tool is titled, annotated and safely named and described", async () => {
  for (const tool of await tools(true)) {
    assert.match(tool.name, /^[a-z0-9_]{1,64}$/, tool.name);
    assert.ok(tool.title, `${tool.name} title`);
    const a = tool.annotations ?? {};
    for (const hint of [
      "readOnlyHint",
      "destructiveHint",
      "idempotentHint",
      "openWorldHint",
    ] as const) {
      assert.equal(typeof a[hint], "boolean", `${tool.name} ${hint}`);
    }
    assert.ok((tool.description ?? "").length > 0, `${tool.name} description`);
    assert.ok(
      (tool.description ?? "").length <= 1024,
      `${tool.name} description length`,
    );
    assert.doesNotMatch(
      tool.description ?? "",
      /\b(you must|always call|ignore previous)\b/i,
      tool.name,
    );
  }
});

test("only removals, schedule changes and order submission are destructive", async () => {
  const destructive = (await tools(true))
    .filter((t) => t.annotations?.destructiveHint === true)
    .map((t) => t.name)
    .sort();
  assert.deepEqual(destructive, [...DESTRUCTIVE].sort());
});

test("order tools are never marked idempotent or read-only", async () => {
  for (const tool of (await tools(true)).filter((t) =>
    ORDER_TOOLS.includes(t.name),
  )) {
    assert.equal(tool.annotations?.idempotentHint, false, tool.name);
    assert.equal(tool.annotations?.readOnlyHint, false, tool.name);
  }
});
