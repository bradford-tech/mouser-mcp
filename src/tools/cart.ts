import {
  addCartItems,
  addScheduledCartItems,
  createCartFromOrder,
  deleteAllScheduledCartItems,
  getCart,
  removeCartItem,
  updateCartItems,
  updateScheduledCartItems,
  type CartResponseRoot,
} from "@bradford-tech/mouser-sdk";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { callMouser, tool } from "../mouser.js";
import { pruneObject } from "../prune.js";
import { fail, ok } from "../results.js";
import type { ServerDeps } from "../server.js";

export const CartSchema = z.object({
  cartKey: z.string().optional(),
  currency: z.string().optional(),
  itemCount: z.number().optional(),
  merchandiseTotal: z.number().optional(),
  items: z.array(
    z.object({
      mouserPartNumber: z.string().optional(),
      manufacturerPartNumber: z.string().optional(),
      description: z.string().optional(),
      quantity: z.number().optional(),
      unitPrice: z.number().optional(),
      extendedPrice: z.number().optional(),
      customerPartNumber: z.string().optional(),
    }),
  ),
});

export type Cart = z.infer<typeof CartSchema>;

/** The compact cart shape returned by every cart tool. */
export function summarizeCart(cart: CartResponseRoot): Cart {
  const summary = pruneObject({
    cartKey: cart.CartKey,
    currency: cart.CurrencyCode,
    itemCount: cart.TotalItemCount,
    merchandiseTotal: cart.MerchandiseTotal,
  });
  return {
    ...summary,
    items: (cart.CartItems ?? []).map((item) =>
      pruneObject({
        mouserPartNumber: item.MouserPartNumber,
        manufacturerPartNumber: item.MfrPartNumber,
        description: item.Description,
        quantity: item.Quantity,
        unitPrice: item.UnitPrice,
        extendedPrice: item.ExtendedPrice,
        customerPartNumber: item.CartItemCustPartNumber,
      }),
    ),
  };
}

const CartItemInput = z.object({
  mouserPartNumber: z.string().min(1),
  quantity: z.number().int().min(1),
  customerPartNumber: z
    .string()
    .optional()
    .describe("Your own reference, e.g. a BOM designator."),
});

const ScheduleItemInput = z.object({
  mouserPartNumber: z.string().min(1),
  releases: z
    .array(
      z.object({
        date: z.string().describe("Release date, YYYY-MM-DD."),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
});

function toCartItems(items: z.infer<typeof CartItemInput>[]) {
  return items.map((item) => ({
    MouserPartNumber: item.mouserPartNumber,
    Quantity: item.quantity,
    ...(item.customerPartNumber
      ? { CustomerPartNumber: item.customerPartNumber }
      : {}),
  }));
}

function cartResult(cart: CartResponseRoot) {
  const structured = summarizeCart(cart);
  return ok(structured);
}

export function registerCartTools(server: McpServer, deps: ServerDeps): void {
  const { mouser: client, limiter } = deps;
  const cartKey = z.string().min(1).describe("Mouser cart key.");

  server.registerTool(
    "get_cart",
    {
      title: "Get a Mouser cart",
      description:
        "Returns a Mouser cart's items, quantities, prices and merchandise total.",
      inputSchema: z.object({ cartKey }),
      outputSchema: CartSchema,
      annotations: {
        title: "Get a Mouser cart",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      tool(async () => {
        return cartResult(
          await callMouser(limiter, () =>
            getCart({ client, query: { cartKey: args.cartKey } }),
          ),
        );
      }),
  );

  server.registerTool(
    "add_to_cart",
    {
      title: "Add parts to a Mouser cart",
      description:
        "Adds parts to a Mouser cart. Omit cartKey to start a new cart; the returned cartKey identifies it. Does not place an order.",
      inputSchema: z.object({
        cartKey: cartKey.optional(),
        items: z.array(CartItemInput).min(1).max(100),
      }),
      outputSchema: CartSchema,
      annotations: {
        title: "Add parts to a Mouser cart",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      tool(async () => {
        return cartResult(
          await callMouser(limiter, () =>
            addCartItems({
              client,
              body: {
                ...(args.cartKey ? { CartKey: args.cartKey } : {}),
                CartItems: toCartItems(args.items),
              },
            }),
          ),
        );
      }),
  );

  server.registerTool(
    "update_cart_items",
    {
      title: "Update items in a Mouser cart",
      description:
        "Changes quantities or customer part numbers of parts already in a Mouser cart.",
      inputSchema: z.object({
        cartKey,
        items: z.array(CartItemInput).min(1).max(100),
      }),
      outputSchema: CartSchema,
      annotations: {
        title: "Update items in a Mouser cart",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      tool(async () => {
        return cartResult(
          await callMouser(limiter, () =>
            updateCartItems({
              client,
              body: {
                CartKey: args.cartKey,
                CartItems: toCartItems(args.items),
              },
            }),
          ),
        );
      }),
  );

  server.registerTool(
    "remove_from_cart",
    {
      title: "Remove a part from a Mouser cart",
      description: "Removes one part from a Mouser cart.",
      inputSchema: z.object({ cartKey, mouserPartNumber: z.string().min(1) }),
      outputSchema: CartSchema,
      annotations: {
        title: "Remove a part from a Mouser cart",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      tool(async () => {
        return cartResult(
          await callMouser(limiter, () =>
            removeCartItem({
              client,
              query: {
                cartKey: args.cartKey,
                mouserPartNumber: args.mouserPartNumber,
              },
            }),
          ),
        );
      }),
  );

  server.registerTool(
    "manage_scheduled_releases",
    {
      title: "Manage scheduled releases in a Mouser cart",
      description:
        "Schedules future ship dates for parts in a Mouser cart. action add or update takes items with release dates and quantities; delete_all removes every scheduled release from the cart.",
      inputSchema: z.object({
        cartKey,
        action: z.enum(["add", "update", "delete_all"]),
        items: z.array(ScheduleItemInput).max(100).optional(),
      }),
      outputSchema: CartSchema,
      annotations: {
        title: "Manage scheduled releases in a Mouser cart",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      tool(async () => {
        if (args.action === "delete_all") {
          return cartResult(
            await callMouser(limiter, () =>
              deleteAllScheduledCartItems({
                client,
                query: { cartKey: args.cartKey },
              }),
            ),
          );
        }
        if (!args.items?.length) {
          return fail(`action ${args.action} needs at least one item.`);
        }
        const body = {
          CartKey: args.cartKey,
          ScheduleCartItems: args.items.map((item) => ({
            MouserPartNumber: item.mouserPartNumber,
            ScheduledReleases: item.releases.map((r) => ({
              key: r.date,
              value: r.quantity,
            })),
          })),
        };
        const run =
          args.action === "add"
            ? () => addScheduledCartItems({ client, body })
            : () => updateScheduledCartItems({ client, body });
        return cartResult(await callMouser(limiter, run));
      }),
  );

  server.registerTool(
    "create_cart_from_order",
    {
      title: "Create a Mouser cart from a past order",
      description:
        "Starts a new Mouser cart containing the parts of a past order, e.g. to reorder. Does not place an order.",
      inputSchema: z.object({ orderNumber: z.number().int().positive() }),
      outputSchema: CartSchema,
      annotations: {
        title: "Create a Mouser cart from a past order",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      tool(async () => {
        return cartResult(
          await callMouser(limiter, () =>
            createCartFromOrder({
              client,
              query: { orderNumber: args.orderNumber },
            }),
          ),
        );
      }),
  );
}
