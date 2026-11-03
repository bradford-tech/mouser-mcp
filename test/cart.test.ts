import assert from "node:assert/strict";
import { test } from "node:test";
import { connect, json } from "./harness.js";
import { mouserWithFetch } from "./helpers.js";

type Structured = Record<string, unknown>;

const cartResponse = {
  CartKey: "cart-123",
  CurrencyCode: "USD",
  TotalItemCount: 1,
  MerchandiseTotal: 4.2,
  CartItems: [
    {
      MouserPartNumber: "595-LM358DR",
      MfrPartNumber: "LM358DR",
      Description: "Op Amp",
      Quantity: 10,
      UnitPrice: 0.42,
      ExtendedPrice: 4.2,
      CartItemCustPartNumber: "U3",
    },
  ],
};

function path(req: Request | undefined): string {
  const url = new URL(req?.url ?? "");
  return `${req?.method} ${url.pathname}`;
}

test("get_cart returns a compact cart using the order key", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => cartResponse);
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "get_cart",
    arguments: { cartKey: "cart-123" },
  });
  assert.equal(path(requests[0]), "GET /api/v1/cart");
  const url = new URL(requests[0]?.url ?? "");
  assert.equal(url.searchParams.get("cartKey"), "cart-123");
  assert.equal(url.searchParams.get("apiKey"), "O");
  assert.deepEqual(result.structuredContent, {
    cartKey: "cart-123",
    currency: "USD",
    itemCount: 1,
    merchandiseTotal: 4.2,
    items: [
      {
        mouserPartNumber: "595-LM358DR",
        manufacturerPartNumber: "LM358DR",
        description: "Op Amp",
        quantity: 10,
        unitPrice: 0.42,
        extendedPrice: 4.2,
        customerPartNumber: "U3",
      },
    ],
  });
});

test("add_to_cart without a cart key creates a new cart", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => cartResponse);
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "add_to_cart",
    arguments: {
      items: [
        {
          mouserPartNumber: "595-LM358DR",
          quantity: 10,
          customerPartNumber: "U3",
        },
      ],
    },
  });
  assert.equal(path(requests[0]), "POST /api/v1/cart/items/insert");
  assert.deepEqual(await json(requests[0]), {
    CartItems: [
      {
        MouserPartNumber: "595-LM358DR",
        Quantity: 10,
        CustomerPartNumber: "U3",
      },
    ],
  });
  assert.equal((result.structuredContent as Structured).cartKey, "cart-123");
});

test("update_cart_items sends the cart key and items", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => cartResponse);
  const client = await connect({ mouser });
  await client.callTool({
    name: "update_cart_items",
    arguments: {
      cartKey: "cart-123",
      items: [{ mouserPartNumber: "595-LM358DR", quantity: 25 }],
    },
  });
  assert.equal(path(requests[0]), "POST /api/v1/cart/items/update");
  assert.deepEqual(await json(requests[0]), {
    CartKey: "cart-123",
    CartItems: [{ MouserPartNumber: "595-LM358DR", Quantity: 25 }],
  });
});

test("remove_from_cart removes one part", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => cartResponse);
  const client = await connect({ mouser });
  await client.callTool({
    name: "remove_from_cart",
    arguments: { cartKey: "cart-123", mouserPartNumber: "595-LM358DR" },
  });
  assert.equal(path(requests[0]), "POST /api/v1/cart/item/remove");
  const url = new URL(requests[0]?.url ?? "");
  assert.equal(url.searchParams.get("mouserPartNumber"), "595-LM358DR");
});

test("manage_scheduled_releases maps each action to Mouser's call", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => cartResponse);
  const client = await connect({ mouser });
  const items = [
    {
      mouserPartNumber: "595-LM358DR",
      releases: [{ date: "2026-12-01", quantity: 500 }],
    },
  ];
  await client.callTool({
    name: "manage_scheduled_releases",
    arguments: { cartKey: "c", action: "add", items },
  });
  await client.callTool({
    name: "manage_scheduled_releases",
    arguments: { cartKey: "c", action: "update", items },
  });
  await client.callTool({
    name: "manage_scheduled_releases",
    arguments: { cartKey: "c", action: "delete_all" },
  });
  assert.deepEqual(requests.map(path), [
    "POST /api/v1/cart/insert/schedule",
    "POST /api/v1/cart/update/schedule",
    "POST /api/v1/cart/deleteall/schedule",
  ]);
  assert.deepEqual(await json(requests[0]), {
    CartKey: "c",
    ScheduleCartItems: [
      {
        MouserPartNumber: "595-LM358DR",
        ScheduledReleases: [{ key: "2026-12-01", value: 500 }],
      },
    ],
  });
});

test("manage_scheduled_releases add without items is an error", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => cartResponse);
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "manage_scheduled_releases",
    arguments: { cartKey: "c", action: "add" },
  });
  assert.equal(result.isError, true);
  assert.equal(requests.length, 0);
});

test("create_cart_from_order starts a cart from a past order", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => cartResponse);
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "create_cart_from_order",
    arguments: { orderNumber: 123456 },
  });
  assert.equal(
    path(requests[0]),
    "POST /api/v1/order/item/CreateCartFromOrder",
  );
  assert.equal(
    new URL(requests[0]?.url ?? "").searchParams.get("orderNumber"),
    "123456",
  );
  assert.equal((result.structuredContent as Structured).cartKey, "cart-123");
});

test("cart tools explain a missing order key without calling Mouser", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => cartResponse, {
    order: undefined,
  });
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "get_cart",
    arguments: { cartKey: "c" },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /No Mouser order API key/);
  assert.equal(requests.length, 0);
});
