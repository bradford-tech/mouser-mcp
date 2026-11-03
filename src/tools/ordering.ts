import {
  createOrder,
  getCart,
  type CartResponseRoot,
  type Order,
  type OrderRequestType,
} from "@bradford-tech/mouser-sdk";
import {
  acceptedContent,
  inputRequired,
  inputResponse,
  type McpServer,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { CONFIRMATION_WORD, isApprove } from "../confirm.js";
import { canElicitForm } from "../elicitation.js";
import { DailyLimitError } from "../limiter.js";
import { callMouser, MouserError, tool, toToolError } from "../mouser.js";
import {
  PREVIEW_TTL_MINUTES,
  type CartLine,
  type OrderSummary,
} from "../previews.js";
import { newNonce, type PromptState } from "../prompt-state.js";
import { pruneObject } from "../prune.js";
import { fail, ok } from "../results.js";
import type { ServerDeps } from "../server.js";

const NO_LONGER_VALID =
  "This order preview is no longer valid (unknown, expired, already submitted or cancelled). Nothing was submitted. Preview the order again.";
const NEEDS_PROMPT =
  "Order submission needs a client that can show a confirmation prompt, such as Claude Code in interactive mode. Nothing was submitted. You can also place this order from the cart on mouser.com.";
const NOT_APPROVED = `Not approved — nothing was submitted. The order is placed only when ${CONFIRMATION_WORD} is typed into the confirmation prompt. Preview the order again to retry.`;
const OUTCOME_UNKNOWN = (reason: string) =>
  `Mouser did not confirm the order (${reason}). It may or may not have been placed — check get_order_history or your orders on mouser.com before trying again.`;
const CART_CHANGED =
  "The cart changed since this preview, so nothing was submitted. Preview the order again.";

const WordSchema = z.object({
  word: z
    .string()
    .meta({ title: `Type ${CONFIRMATION_WORD} to place this order` }),
});

const AddressInput = z.object({
  firstName: z.string(),
  lastName: z.string(),
  company: z.string().optional(),
  attentionLine: z.string().optional(),
  addressOne: z.string(),
  addressTwo: z.string().optional(),
  city: z.string(),
  stateOrProvince: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string(),
  phoneNumber: z.string(),
  emailAddress: z.string().optional(),
});

const PreviewInput = z.object({
  cartKey: z.string().min(1),
  currencyCode: z.string().min(3).describe("e.g. USD."),
  shippingMethodCode: z
    .number()
    .int()
    .optional()
    .describe("A shipping method code from get_order_options."),
  paymentMethod: z
    .number()
    .int()
    .optional()
    .describe("A payment method code from get_order_options."),
  poNumber: z.string().optional(),
  orderType: z.enum(["Unspecified", "Rush", "Complete"]).optional(),
  shippingAddress: AddressInput.optional().describe(
    "Omit to use the account's default shipping address.",
  ),
});

function toOrderRequest(args: z.infer<typeof PreviewInput>): OrderRequestType {
  const a = args.shippingAddress;
  return pruneObject({
    CartKey: args.cartKey,
    CurrencyCode: args.currencyCode,
    OrderType: args.orderType,
    PrimaryShipping:
      args.shippingMethodCode === undefined
        ? undefined
        : { Code: args.shippingMethodCode },
    Payment:
      args.paymentMethod === undefined
        ? undefined
        : { Method: args.paymentMethod, PoNumber: args.poNumber },
    ShippingAddress: a && {
      FirstName: a.firstName,
      LastName: a.lastName,
      Company: a.company,
      AttentionLine: a.attentionLine,
      AddressOne: a.addressOne,
      AddressTwo: a.addressTwo,
      City: a.city,
      StateOrProvince: a.stateOrProvince,
      PostalCode: a.postalCode,
      CountryCode: a.countryCode,
      PhoneNumber: a.phoneNumber,
      EmailAddress: a.emailAddress,
    },
  }) as OrderRequestType;
}

function cartLines(cart: CartResponseRoot): CartLine[] {
  return (cart.CartItems ?? [])
    .map((item) => ({
      mouserPartNumber: item.MouserPartNumber ?? "",
      quantity: item.Quantity ?? 0,
    }))
    .sort((x, y) => x.mouserPartNumber.localeCompare(y.mouserPartNumber));
}

function sameLines(a: CartLine[], b: CartLine[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (line, i) =>
        line.mouserPartNumber === b[i]?.mouserPartNumber &&
        line.quantity === b[i]?.quantity,
    )
  );
}

function summarizeOrder(order: Order | undefined): OrderSummary {
  return {
    ...pruneObject({
      currency: order?.CurrencyCode,
      merchandiseTotal: order?.MerchandiseTotal,
      additionalFeesTotal: order?.additionalFeesTotal,
      taxAmount: order?.TaxAmount,
      shippingMethod: order?.ShippingMethod?.PrimaryMethod,
      orderTotal: order?.OrderTotal,
    }),
    lines: (order?.OrderLines ?? []).map((line) =>
      pruneObject({
        mouserPartNumber: line.MouserPartNumber,
        quantity: line.Quantity,
        unitPrice: line.UnitPrice,
        extendedPrice: line.ExtendedPrice,
      }),
    ),
  };
}

function money(summary: OrderSummary, value: number | undefined): string {
  return `${summary.currency ?? ""} ${value ?? "?"}`.trim();
}

const MAX_LINES_SHOWN = 15;

/** The text of the confirmation prompt, built from the fresh preview. */
function confirmationMessage(
  previewed: OrderSummary,
  fresh: OrderSummary,
): string {
  const lines = fresh.lines
    .slice(0, MAX_LINES_SHOWN)
    .map(
      (l) =>
        `  ${l.quantity ?? "?"} × ${l.mouserPartNumber ?? "?"} = ${money(fresh, l.extendedPrice)}`,
    );
  if (fresh.lines.length > MAX_LINES_SHOWN) {
    lines.push(`  …and ${fresh.lines.length - MAX_LINES_SHOWN} more lines`);
  }
  const changed =
    previewed.orderTotal !== fresh.orderTotal
      ? [
          `Total changed since preview: ${money(previewed, previewed.orderTotal)} → ${money(fresh, fresh.orderTotal)}.`,
        ]
      : [];
  return [
    "Place this Mouser order? This spends real money.",
    ...changed,
    `Total: ${money(fresh, fresh.orderTotal)} (merchandise ${money(fresh, fresh.merchandiseTotal)}, tax ${money(fresh, fresh.taxAmount)}${fresh.shippingMethod ? `, shipping ${fresh.shippingMethod}` : ""}).`,
    `${fresh.lines.length} line(s):`,
    ...lines,
    `Type ${CONFIRMATION_WORD} to place the order. Anything else cancels it.`,
  ].join("\n");
}

export function registerOrderingTools(
  server: McpServer,
  deps: ServerDeps,
): void {
  const { mouser: client, limiter, previews, promptState } = deps;

  async function previewOrder(request: OrderRequestType): Promise<Order> {
    const data = await callMouser(limiter, () =>
      createOrder({
        client,
        body: { Order: { ...request, SubmitOrder: false } },
      }),
    );
    if (!data.Order) throw new MouserError("Mouser returned no order preview.");
    return data.Order;
  }

  server.registerTool(
    "preview_order",
    {
      title: "Preview a Mouser order",
      description: `Asks Mouser to price a cart as an order (lines, tax, shipping, total) without placing it. Returns a previewId for submit_order. Previews are kept in memory for ${PREVIEW_TTL_MINUTES} minutes, can be submitted once, and become invalid if the cart changes. Shipping and payment codes come from get_order_options.`,
      inputSchema: PreviewInput,
      annotations: {
        title: "Preview a Mouser order",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      tool(async () => {
        const request = toOrderRequest(args);
        const cart = await callMouser(limiter, () =>
          getCart({ client, query: { cartKey: args.cartKey } }),
        );
        const summary = summarizeOrder(await previewOrder(request));
        const preview = previews.create({
          request,
          cartSnapshot: cartLines(cart),
          summary,
        });
        const structured = {
          previewId: preview.id,
          expiresInMinutes: PREVIEW_TTL_MINUTES,
          ...summary,
        };
        return ok(structured);
      }),
  );

  server.registerTool(
    "submit_order",
    {
      title: "Submit a previewed Mouser order",
      description: `Places a previewed Mouser order. The server shows its own confirmation prompt with the current total, and the order is placed only if the user types ${CONFIRMATION_WORD} there. Requires a client that can show that prompt (Claude Code in interactive mode); otherwise nothing is submitted.`,
      inputSchema: z.object({
        previewId: z.string().min(1).describe("From preview_order."),
      }),
      annotations: {
        title: "Submit a previewed Mouser order",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { "anthropic/requiresUserInteraction": true },
    },
    async ({ previewId }, ctx) => {
      const preview = previews.get(previewId);
      if (!preview || preview.state !== "pending") return fail(NO_LONGER_VALID);
      if (!canElicitForm(server, ctx)) return fail(NEEDS_PROMPT);

      // An answer counts only if it replies to the prompt this server issued
      // for this preview: the signed state must name this preview and its
      // latest prompt nonce. Anything else is treated as no answer at all.
      const state = ctx.mcpReq.requestState<PromptState>();
      const prompted =
        state !== undefined &&
        state.previewId === previewId &&
        preview.promptNonces.has(state.nonce);

      const responses = prompted ? ctx.mcpReq.inputResponses : undefined;
      const view = inputResponse(responses, "confirm");
      if (view.kind === "elicit" && view.action !== "accept") {
        previews.consume(previewId);
        return fail(NOT_APPROVED);
      }
      const answer = acceptedContent(responses, "confirm", WordSchema);
      if (answer !== undefined && !isApprove(answer.word)) {
        previews.consume(previewId);
        return fail(NOT_APPROVED);
      }

      try {
        const cart = await callMouser(limiter, () =>
          getCart({ client, query: { cartKey: preview.request.CartKey } }),
        );
        if (!sameLines(cartLines(cart), preview.cartSnapshot)) {
          previews.consume(previewId);
          return fail(CART_CHANGED);
        }

        if (answer === undefined) {
          const fresh = summarizeOrder(await previewOrder(preview.request));
          const nonce = newNonce();
          preview.promptNonces.add(nonce);
          return inputRequired({
            inputRequests: {
              confirm: inputRequired.elicit({
                message: confirmationMessage(preview.summary, fresh),
                requestedSchema: WordSchema,
              }),
            },
            requestState: await promptState.mint({ previewId, nonce }),
          });
        }
      } catch (err) {
        return toToolError(err);
      }

      if (!previews.consume(previewId)) return fail(NO_LONGER_VALID);
      try {
        const placed = await callMouser(limiter, () =>
          createOrder({
            client,
            body: { Order: { ...preview.request, SubmitOrder: true } },
          }),
        );
        const structured = {
          orderNumber: placed.Order?.OrderID,
          ...summarizeOrder(placed.Order),
        };
        return ok(structured);
      } catch (err) {
        // The local limiter refuses before anything is sent: certainly not placed.
        if (err instanceof DailyLimitError) {
          return fail(
            `${err.message} Nothing was submitted; preview the order again once the limit resets.`,
          );
        }
        // Otherwise the submission may have reached Mouser even though we got
        // no confirmation; never invite a blind retry that could order twice.
        const reason = err instanceof Error ? err.message : String(err);
        return fail(OUTCOME_UNKNOWN(reason));
      }
    },
  );
}
