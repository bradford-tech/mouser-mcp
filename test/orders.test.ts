import assert from "node:assert/strict";
import { test } from "node:test";
import { connect, json } from "./harness.js";
import { mouserWithFetch } from "./helpers.js";

function path(req: Request | undefined): string {
  return `${req?.method} ${new URL(req?.url ?? "").pathname}`;
}

function query(req: Request | undefined, name: string): string | null {
  return new URL(req?.url ?? "").searchParams.get(name);
}

test("get_order_options queries options for a cart", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({
    OrderInitialize: { CurrencyCode: "USD", Shipping: { ShippingMethods: [] } },
  }));
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "get_order_options",
    arguments: { cartKey: "c", currencyCode: "USD" },
  });
  assert.equal(path(requests[0]), "POST /api/v1/order/options/query");
  assert.deepEqual(await json(requests[0]), {
    OrderInitialize: { CartKey: "c", CurrencyCode: "USD" },
  });
  assert.equal(query(requests[0], "apiKey"), "O");
  assert.equal(result.isError, undefined);
});

test("list_countries and list_currencies pass their filters", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({}));
  const client = await connect({ mouser });
  await client.callTool({
    name: "list_countries",
    arguments: { countryCode: "US" },
  });
  await client.callTool({
    name: "list_currencies",
    arguments: { shippingCountryCode: "DE" },
  });
  assert.deepEqual(requests.map(path), [
    "GET /api/v1/order/countries",
    "GET /api/v1/order/currencies",
  ]);
  assert.equal(query(requests[0], "countryCode"), "US");
  assert.equal(query(requests[1], "shippingCountryCode"), "DE");
});

test("get_order_history picks the lookup from the one mode given", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({
    NumberOfOrders: 0,
    OrderHistoryItems: [],
  }));
  const client = await connect({ mouser });
  await client.callTool({
    name: "get_order_history",
    arguments: { dateFilter: "LastMonth" },
  });
  await client.callTool({
    name: "get_order_history",
    arguments: { startDate: "2026-01-01", endDate: "2026-02-01" },
  });
  await client.callTool({
    name: "get_order_history",
    arguments: { salesOrderNumber: "123" },
  });
  await client.callTool({
    name: "get_order_history",
    arguments: { webOrderNumber: 456 },
  });
  assert.deepEqual(requests.map(path), [
    "GET /api/v1/orderhistory/ByDateFilter",
    "GET /api/v1/orderhistory/ByDateRange",
    "GET /api/v1/orderhistory/salesOrderNumber",
    "GET /api/v1/orderhistory/webOrderNumber",
  ]);
  assert.equal(query(requests[0], "dateFilter"), "LastMonth");
  assert.equal(query(requests[1], "endDate"), "2026-02-01");
});

test("get_order_history rejects zero or several lookup modes", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({}));
  const client = await connect({ mouser });
  const none = await client.callTool({
    name: "get_order_history",
    arguments: {},
  });
  const two = await client.callTool({
    name: "get_order_history",
    arguments: { dateFilter: "All", salesOrderNumber: "1" },
  });
  const halfRange = await client.callTool({
    name: "get_order_history",
    arguments: { startDate: "2026-01-01" },
  });
  assert.equal(none.isError, true);
  assert.equal(two.isError, true);
  assert.equal(halfRange.isError, true);
  assert.equal(requests.length, 0);
});

test("get_order fetches one order by number", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({
    OrderNumber: "789",
  }));
  const client = await connect({ mouser });
  await client.callTool({
    name: "get_order",
    arguments: { orderNumber: 789 },
  });
  assert.equal(path(requests[0]), "GET /api/v1/order/789");
});
