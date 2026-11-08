import type { MouserPart } from "@bradford-tech/mouser-sdk";
import * as z from "zod/v4";

/**
 * The compact per-part shape returned by the search tools: the fields that
 * part selection, purchasing and BOM review actually use, without Mouser's
 * full record (which would blow the client's tool-output budget on a 50-part
 * page). Empty fields are omitted.
 */
export const PartSummarySchema = z.object({
  mouserPartNumber: z.string().optional(),
  manufacturerPartNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  productUrl: z.string().optional(),
  datasheetUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  availability: z.string().optional(),
  inStock: z.number().optional(),
  onOrder: z
    .array(
      z.object({
        quantity: z.number().optional(),
        date: z.string().optional(),
      }),
    )
    .optional(),
  leadTime: z.string().optional(),
  lifecycle: z.string().optional(),
  discontinued: z.boolean().optional(),
  suggestedReplacement: z.string().optional(),
  rohs: z.string().optional(),
  minimumOrder: z.number().optional(),
  orderMultiple: z.number().optional(),
  reeling: z.boolean().optional(),
  priceBreaks: z
    .array(
      z.object({
        quantity: z.number().optional(),
        price: z.string().optional(),
        rawPrice: z.number().optional(),
        currency: z.string().optional(),
      }),
    )
    .optional(),
  compliance: z.record(z.string(), z.string()).optional(),
});

export type PartSummary = z.infer<typeof PartSummarySchema>;

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function count(value: string | null | undefined): number | undefined {
  const digits = value?.replace(/[^\d]/g, "");
  return digits ? Number(digits) : undefined;
}

function nonEmpty<T>(items: T[]): T[] | undefined {
  return items.length > 0 ? items : undefined;
}

/** Drops keys whose value is `undefined`, so absent fields don't appear at all. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Fields left out of keyword-search results to keep a 50-part page small.
 * They matter once a part is chosen, so `get_parts` returns them.
 */
const DETAIL_FIELDS = [
  "productUrl",
  "datasheetUrl",
  "imageUrl",
  "onOrder",
  "compliance",
] as const;

/**
 * Converts a Mouser search record into a {@link PartSummary}. The `"search"`
 * view drops {@link DETAIL_FIELDS}; `"full"` (the default) keeps everything.
 */
export function summarizePart(
  p: MouserPart,
  view: "full" | "search" = "full",
): PartSummary {
  const summary = fullSummary(p);
  if (view === "full") return summary;
  const detail: readonly string[] = DETAIL_FIELDS;
  return Object.fromEntries(
    Object.entries(summary).filter(([key]) => !detail.includes(key)),
  ) as PartSummary;
}

function fullSummary(p: MouserPart): PartSummary {
  const discontinued = text(p.IsDiscontinued)?.toLowerCase();
  const compliance = Object.fromEntries(
    (p.ProductCompliance ?? [])
      .filter((c) => text(c.ComplianceName) && text(c.ComplianceValue))
      .map((c) => [c.ComplianceName as string, c.ComplianceValue as string]),
  );
  return compact({
    mouserPartNumber: text(p.MouserPartNumber),
    manufacturerPartNumber: text(p.ManufacturerPartNumber),
    manufacturer: text(p.Manufacturer),
    description: text(p.Description),
    category: text(p.Category),
    productUrl: text(p.ProductDetailUrl),
    datasheetUrl: text(p.DataSheetUrl),
    imageUrl: text(p.ImagePath),
    availability: text(p.Availability),
    inStock: count(p.AvailabilityInStock),
    onOrder: nonEmpty(
      (p.AvailabilityOnOrder ?? []).map((o) =>
        compact({ quantity: o.Quantity, date: text(o.Date) }),
      ),
    ),
    leadTime: text(p.LeadTime),
    lifecycle: text(p.LifecycleStatus),
    discontinued:
      discontinued === "true"
        ? true
        : discontinued === "false"
          ? false
          : undefined,
    suggestedReplacement: text(p.SuggestedReplacement),
    rohs: text(p.ROHSStatus),
    minimumOrder: count(p.Min),
    orderMultiple: count(p.Mult),
    reeling: p.Reeling ?? undefined,
    priceBreaks: nonEmpty(
      (p.PriceBreaks ?? []).map((b) =>
        compact({
          quantity: b.Quantity,
          price: text(b.Price),
          rawPrice: b.RawPrice ?? undefined,
          currency: text(b.Currency),
        }),
      ),
    ),
    compliance: Object.keys(compliance).length > 0 ? compliance : undefined,
  });
}
