import {
  getManufacturerList,
  searchByKeyword,
  searchByKeywordAndManufacturer,
  searchByPartNumber,
  searchByPartNumberAndManufacturer,
  type MouserPart,
} from "@bradford-tech/mouser-sdk";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { DailyLimitError } from "../limiter.js";
import { callMouser, MouserError, tool, type MouserClient } from "../mouser.js";
import { PartSummarySchema, summarizePart } from "../parts.js";
import { fail, ok } from "../results.js";
import type { ServerDeps } from "../server.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const SEARCH_OPTIONS = {
  none: "None",
  in_stock: "InStock",
  rohs: "Rohs",
  rohs_and_in_stock: "RohsAndInStock",
} as const;

/** Mouser accepts at most this many `|`-separated part numbers per lookup. */
const PART_NUMBERS_PER_CALL = 10;
const MAX_MANUFACTURERS_RETURNED = 200;

// Keyed on the shared Mouser client (not the server instance) so the list is
// fetched once per process however many server instances are built.
const manufacturerCache = new WeakMap<MouserClient, Promise<string[]>>();

export function registerSearchTools(server: McpServer, deps: ServerDeps): void {
  const { mouser: client, limiter } = deps;

  server.registerTool(
    "search_parts",
    {
      title: "Search Mouser parts",
      description:
        "Keyword search of Mouser's catalog, optionally limited to one manufacturer and filtered to in-stock and/or RoHS-compliant parts. Returns the total match count and up to 50 compact part summaries per call; page with offset (with a manufacturer, offset must be a multiple of limit). Mouser has no parametric filtering or sorting (e.g. by capacitance, voltage or price), so filter by the returned descriptions.",
      inputSchema: z.object({
        keyword: z
          .string()
          .min(1)
          .describe("Search text, e.g. '3.3V LDO SOT-23'."),
        manufacturer: z
          .string()
          .optional()
          .describe("Exact Mouser manufacturer name (see list_manufacturers)."),
        filter: z
          .enum(["none", "in_stock", "rohs", "rohs_and_in_stock"])
          .optional()
          .describe("Default none."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Default 10."),
        offset: z.number().int().min(0).optional().describe("Default 0."),
      }),
      outputSchema: z.object({
        totalResults: z.number(),
        parts: z.array(PartSummarySchema),
      }),
      annotations: { title: "Search Mouser parts", ...READ_ONLY },
    },
    async ({ keyword, manufacturer, filter, limit = 10, offset = 0 }) => {
      // Mouser's manufacturer search pages by page number, not record offset.
      if (manufacturer && offset % limit !== 0) {
        return fail(
          `With a manufacturer, offset must be a multiple of limit (e.g. ${Math.floor(offset / limit) * limit} or ${Math.ceil(offset / limit) * limit} for limit ${limit}).`,
        );
      }
      return tool(async () => {
        const searchOptions = SEARCH_OPTIONS[filter ?? "none"];
        const data = manufacturer
          ? await callMouser(limiter, () =>
              searchByKeywordAndManufacturer({
                client,
                body: {
                  SearchByKeywordMfrNameRequest: {
                    keyword,
                    manufacturerName: manufacturer,
                    records: limit,
                    pageNumber: Math.floor(offset / limit) + 1,
                    searchOptions,
                  },
                },
              }),
            )
          : await callMouser(limiter, () =>
              searchByKeyword({
                client,
                body: {
                  SearchByKeywordRequest: {
                    keyword,
                    records: limit,
                    startingRecord: offset,
                    searchOptions,
                  },
                },
              }),
            );
        const parts = (data.SearchResults?.Parts ?? []).map((p) =>
          summarizePart(p, "search"),
        );
        const structured = {
          totalResults: data.SearchResults?.NumberOfResult ?? parts.length,
          parts,
        };
        return ok(structured);
      });
    },
  );

  server.registerTool(
    "get_parts",
    {
      title: "Look up Mouser parts by part number",
      description:
        "Looks up one or many Mouser or manufacturer part numbers (up to 200, e.g. a BOM) and returns compact summaries: stock, lead time, lifecycle, RoHS, pricing, compliance and links. Part numbers that match nothing are listed in notFound. Lookups are batched 10 per Mouser call.",
      inputSchema: z.object({
        partNumbers: z.array(z.string().min(3).max(40)).min(1).max(200),
        exact: z
          .boolean()
          .optional()
          .describe("Exact matches only. Default false."),
        manufacturer: z
          .string()
          .optional()
          .describe("Exact Mouser manufacturer name (see list_manufacturers)."),
      }),
      outputSchema: z.object({
        parts: z.array(PartSummarySchema),
        notFound: z.array(z.string()),
        failed: z.array(
          z.object({ partNumbers: z.array(z.string()), error: z.string() }),
        ),
      }),
      annotations: {
        title: "Look up Mouser parts by part number",
        ...READ_ONLY,
      },
    },
    async ({ partNumbers, exact, manufacturer }) => {
      const partSearchOptions = exact ? "Exact" : "None";
      const found: MouserPart[] = [];
      const failed: { partNumbers: string[]; error: string }[] = [];
      const batches: string[][] = [];
      for (let i = 0; i < partNumbers.length; i += PART_NUMBERS_PER_CALL) {
        batches.push(partNumbers.slice(i, i + PART_NUMBERS_PER_CALL));
      }
      // A failed batch shouldn't discard the rest of a BOM: report it and keep
      // going. Once the daily limit is hit, every remaining batch fails too.
      for (const [index, batch] of batches.entries()) {
        const mouserPartNumber = batch.join("|");
        try {
          const data = manufacturer
            ? await callMouser(limiter, () =>
                searchByPartNumberAndManufacturer({
                  client,
                  body: {
                    SearchByPartMfrNameRequest: {
                      mouserPartNumber,
                      manufacturerName: manufacturer,
                      partSearchOptions,
                    },
                  },
                }),
              )
            : await callMouser(limiter, () =>
                searchByPartNumber({
                  client,
                  body: {
                    SearchByPartRequest: {
                      mouserPartNumber,
                      partSearchOptions,
                    },
                  },
                }),
              );
          found.push(...(data.SearchResults?.Parts ?? []));
        } catch (err) {
          if (err instanceof DailyLimitError) {
            for (const rest of batches.slice(index)) {
              failed.push({ partNumbers: rest, error: err.message });
            }
            break;
          }
          if (!(err instanceof MouserError)) throw err;
          failed.push({ partNumbers: batch, error: err.message });
        }
      }
      const known = new Set(
        found.flatMap((p) =>
          [p.MouserPartNumber, p.ManufacturerPartNumber]
            .filter((pn): pn is string => Boolean(pn))
            .map((pn) => pn.toLowerCase()),
        ),
      );
      const unanswered = new Set(failed.flatMap((f) => f.partNumbers));
      const structured = {
        parts: found.map((p) => summarizePart(p)),
        notFound: partNumbers.filter(
          (pn) => !unanswered.has(pn) && !known.has(pn.toLowerCase()),
        ),
        failed,
      };
      if (found.length === 0 && failed.length === batches.length) {
        return fail(
          `No part numbers could be looked up: ${failed[0]?.error ?? "unknown error"}`,
        );
      }
      return ok(structured);
    },
  );

  server.registerTool(
    "list_manufacturers",
    {
      title: "List Mouser manufacturers",
      description:
        "Mouser's manufacturer names, for the manufacturer argument of search_parts and get_parts. Filter with query (case-insensitive substring); at most 200 names are returned.",
      inputSchema: z.object({ query: z.string().optional() }),
      outputSchema: z.object({
        manufacturers: z.array(z.string()),
        truncated: z.boolean(),
      }),
      annotations: { title: "List Mouser manufacturers", ...READ_ONLY },
    },
    async ({ query }) =>
      tool(async () => {
        let names = manufacturerCache.get(client);
        if (!names) {
          names = callMouser(limiter, () =>
            getManufacturerList({ client }),
          ).then((data) =>
            (data.MouserManufacturerList?.ManufacturerList ?? [])
              .map((m) => m.ManufacturerName)
              .filter((n): n is string => Boolean(n)),
          );
          manufacturerCache.set(client, names);
          names.catch(() => manufacturerCache.delete(client));
        }
        const needle = query?.trim().toLowerCase() ?? "";
        const matches = (await names).filter((n) =>
          n.toLowerCase().includes(needle),
        );
        const structured = {
          manufacturers: matches.slice(0, MAX_MANUFACTURERS_RETURNED),
          truncated: matches.length > MAX_MANUFACTURERS_RETURNED,
        };
        return ok(structured);
      }),
  );
}
