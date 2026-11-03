import assert from "node:assert/strict";
import { test } from "node:test";
import { PreviewStore } from "../src/previews.js";

const input = {
  request: { CartKey: "c", CurrencyCode: "USD" },
  cartSnapshot: [{ mouserPartNumber: "595-LM358DR", quantity: 10 }],
  summary: { currency: "USD", orderTotal: 4.2, lines: [] },
};

test("create returns a random, unguessable id", () => {
  const store = new PreviewStore();
  const a = store.create(input);
  const b = store.create(input);
  assert.notEqual(a.id, b.id);
  assert.ok(a.id.length >= 22, a.id);
  assert.equal(store.get(a.id)?.state, "pending");
});

test("consume succeeds exactly once", () => {
  const store = new PreviewStore();
  const { id } = store.create(input);
  assert.equal(store.consume(id), true);
  assert.equal(store.consume(id), false);
  assert.equal(store.get(id)?.state, "used");
});

test("previews expire after the TTL", () => {
  let now = 1_000_000;
  const store = new PreviewStore({ ttlMs: 20 * 60_000, now: () => now });
  const { id } = store.create(input);
  now += 20 * 60_000 + 1;
  assert.equal(store.get(id), undefined);
  assert.equal(store.consume(id), false);
});

test("unknown ids are neither found nor consumable", () => {
  const store = new PreviewStore();
  assert.equal(store.get("nope"), undefined);
  assert.equal(store.consume("nope"), false);
});
