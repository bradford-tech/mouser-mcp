import {
  getCountries,
  getCurrencies,
  getOrder,
  getOrderHistoryByDateFilter,
  getOrderHistoryByDateRange,
  getOrderHistoryBySalesOrderNumber,
  getOrderHistoryByWebOrderNumber,
  queryOrderOptions,
} from "@bradford-tech/mouser-sdk";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { callMouser, toToolError } from "../mouser.js";
import { pruneObject } from "../prune.js";
import { fail, ok } from "../results.js";
import type { ServerDeps } from "../server.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const DATE_FILTERS = [
  "None",
  "All",
  "Today",
  "Yesterday",
  "ThisWeek",
  "LastWeek",
  "ThisMonth",
  "LastMonth",
  "ThisQuarter",
  "LastQuarter",
  "ThisYear",
  "LastYear",
  "YearToDate",
] as const;

/** Mouser's response, minus empty fields, as both structured and text output. */
function passThrough(data: unknown) {
  const structured = pruneObject(data);
  return ok(structured, JSON.stringify(structured));
}

export function registerOrderInfoTools(
  server: McpServer,
  deps: ServerDeps,
): void {
  const { mouser: client, limiter } = deps;

  server.registerTool(
    "get_order_options",
    {
      title: "Get Mouser order options",
      description:
        "Shipping methods, payment methods, addresses, tax certificates and VAT accounts available for ordering a Mouser cart. Use the returned values when previewing an order.",
      inputSchema: z.object({
        cartKey: z.string().min(1),
        currencyCode: z.string().optional().describe("e.g. USD."),
      }),
      annotations: { title: "Get Mouser order options", ...READ_ONLY },
    },
    async (args) => {
      try {
        return passThrough(
          await callMouser(limiter, () =>
            queryOrderOptions({
              client,
              body: {
                OrderInitialize: {
                  CartKey: args.cartKey,
                  ...(args.currencyCode
                    ? { CurrencyCode: args.currencyCode }
                    : {}),
                },
              },
            }),
          ),
        );
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    "list_countries",
    {
      title: "List Mouser countries",
      description:
        "Countries (and their states) Mouser ships to, optionally for one country code.",
      inputSchema: z.object({ countryCode: z.string().optional() }),
      annotations: { title: "List Mouser countries", ...READ_ONLY },
    },
    async (args) => {
      try {
        return passThrough(
          await callMouser(limiter, () =>
            getCountries({
              client,
              query: args.countryCode ? { countryCode: args.countryCode } : {},
            }),
          ),
        );
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    "list_currencies",
    {
      title: "List Mouser currencies",
      description:
        "Currencies Mouser accepts, optionally for a shipping country code.",
      inputSchema: z.object({ shippingCountryCode: z.string().optional() }),
      annotations: { title: "List Mouser currencies", ...READ_ONLY },
    },
    async (args) => {
      try {
        return passThrough(
          await callMouser(limiter, () =>
            getCurrencies({
              client,
              query: args.shippingCountryCode
                ? { shippingCountryCode: args.shippingCountryCode }
                : {},
            }),
          ),
        );
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    "get_order_history",
    {
      title: "Get Mouser order history",
      description:
        "Lists past Mouser orders. Give exactly one lookup: dateFilter (e.g. LastMonth), startDate and endDate together, salesOrderNumber, or webOrderNumber.",
      inputSchema: z.object({
        dateFilter: z.enum(DATE_FILTERS).optional(),
        startDate: z.string().optional().describe("YYYY-MM-DD."),
        endDate: z.string().optional().describe("YYYY-MM-DD."),
        salesOrderNumber: z.string().optional(),
        webOrderNumber: z.number().int().positive().optional(),
      }),
      annotations: { title: "Get Mouser order history", ...READ_ONLY },
    },
    async (args) => {
      const modes = [
        args.dateFilter !== undefined,
        args.startDate !== undefined || args.endDate !== undefined,
        args.salesOrderNumber !== undefined,
        args.webOrderNumber !== undefined,
      ].filter(Boolean).length;
      if (modes !== 1) {
        return fail(
          "Give exactly one of: dateFilter, startDate and endDate, salesOrderNumber, or webOrderNumber.",
        );
      }
      try {
        if (args.dateFilter !== undefined) {
          const dateFilter = args.dateFilter;
          return passThrough(
            await callMouser(limiter, () =>
              getOrderHistoryByDateFilter({ client, query: { dateFilter } }),
            ),
          );
        }
        if (args.salesOrderNumber !== undefined) {
          const salesOrderNumber = args.salesOrderNumber;
          return passThrough(
            await callMouser(limiter, () =>
              getOrderHistoryBySalesOrderNumber({
                client,
                query: { salesOrderNumber },
              }),
            ),
          );
        }
        if (args.webOrderNumber !== undefined) {
          const webOrderNumber = args.webOrderNumber;
          return passThrough(
            await callMouser(limiter, () =>
              getOrderHistoryByWebOrderNumber({
                client,
                query: { webOrderNumber },
              }),
            ),
          );
        }
        const { startDate, endDate } = args;
        if (startDate === undefined || endDate === undefined) {
          return fail("Give both startDate and endDate.");
        }
        return passThrough(
          await callMouser(limiter, () =>
            getOrderHistoryByDateRange({
              client,
              query: { startDate, endDate },
            }),
          ),
        );
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    "get_order",
    {
      title: "Get a Mouser order",
      description:
        "Details of one Mouser order: lines, status, shipping and payment.",
      inputSchema: z.object({ orderNumber: z.number().int().positive() }),
      annotations: { title: "Get a Mouser order", ...READ_ONLY },
    },
    async (args) => {
      try {
        return passThrough(
          await callMouser(limiter, () =>
            getOrder({ client, path: { orderNumber: args.orderNumber } }),
          ),
        );
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
