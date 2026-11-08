import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizePart } from "../src/parts.js";
import { part } from "./fixtures.js";

test("summarizes a Mouser part into the compact shape", () => {
  assert.deepEqual(summarizePart(part()), {
    mouserPartNumber: "595-LM358DR",
    manufacturerPartNumber: "LM358DR",
    manufacturer: "Texas Instruments",
    description: "Operational Amplifiers - Op Amps Dual Op Amp",
    category: "Operational Amplifiers - Op Amps",
    productUrl: "https://www.mouser.com/ProductDetail/595-LM358DR",
    datasheetUrl: "https://www.mouser.com/datasheet/2/405/lm358.pdf",
    imageUrl: "https://www.mouser.com/images/ti/images/SOIC_8.jpg",
    availability: "1234 In Stock",
    inStock: 1234,
    onOrder: [{ quantity: 5000, date: "2026-11-06T00:00:00" }],
    leadTime: "6 Weeks",
    discontinued: false,
    rohs: "RoHS Compliant",
    minimumOrder: 1,
    orderMultiple: 1,
    reeling: true,
    priceBreaks: [
      { quantity: 1, price: "$0.42", rawPrice: 0.42, currency: "USD" },
      { quantity: 10, price: "$0.31", rawPrice: 0.31, currency: "USD" },
      { quantity: 2500, price: "$0.12", rawPrice: 0.12, currency: "USD" },
    ],
    compliance: { USHTS: "8542330001", ECCN: "EAR99" },
  });
});

test("omits empty fields and keeps lifecycle and replacements when present", () => {
  const summary = summarizePart({
    MouserPartNumber: "511-LM317T",
    LifecycleStatus: "Obsolete",
    SuggestedReplacement: "LM317HVT",
    IsDiscontinued: "true",
    Availability: "",
    PriceBreaks: [],
    ProductCompliance: [],
  });
  assert.deepEqual(summary, {
    mouserPartNumber: "511-LM317T",
    lifecycle: "Obsolete",
    suggestedReplacement: "LM317HVT",
    discontinued: true,
  });
});

test("the search summary leaves out per-part detail fields", () => {
  const summary = summarizePart(part(), "search");
  for (const field of [
    "productUrl",
    "datasheetUrl",
    "imageUrl",
    "onOrder",
    "compliance",
  ]) {
    assert.equal(field in summary, false, field);
  }
  assert.equal(summary.mouserPartNumber, "595-LM358DR");
  assert.equal(summary.priceBreaks?.length, 3);
  assert.equal(summary.inStock, 1234);
});
