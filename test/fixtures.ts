import type { MouserPart } from "@bradford-tech/mouser-sdk";

/** A realistic Mouser search record (trimmed from a live LM358 response shape). */
export function part(overrides: Partial<MouserPart> = {}): MouserPart {
  return {
    Availability: "1234 In Stock",
    AvailabilityInStock: "1234",
    AvailabilityOnOrder: [{ Quantity: 5000, Date: "2026-11-06T00:00:00" }],
    DataSheetUrl: "https://www.mouser.com/datasheet/2/405/lm358.pdf",
    Description: "Operational Amplifiers - Op Amps Dual Op Amp",
    ImagePath: "https://www.mouser.com/images/ti/images/SOIC_8.jpg",
    Category: "Operational Amplifiers - Op Amps",
    LeadTime: "6 Weeks",
    LifecycleStatus: "",
    Manufacturer: "Texas Instruments",
    ManufacturerPartNumber: "LM358DR",
    Min: "1",
    Mult: "1",
    MouserPartNumber: "595-LM358DR",
    ProductAttributes: [{ AttributeName: "Packaging", AttributeValue: "Reel" }],
    PriceBreaks: [
      { Quantity: 1, Price: "$0.42", Currency: "USD" },
      { Quantity: 10, Price: "$0.31", Currency: "USD" },
      { Quantity: 2500, Price: "$0.12", Currency: "USD" },
    ],
    ProductDetailUrl: "https://www.mouser.com/ProductDetail/595-LM358DR",
    Reeling: true,
    ROHSStatus: "RoHS Compliant",
    SuggestedReplacement: "",
    IsDiscontinued: "false",
    ProductCompliance: [
      { ComplianceName: "USHTS", ComplianceValue: "8542330001" },
      { ComplianceName: "ECCN", ComplianceValue: "EAR99" },
    ],
    ...overrides,
  };
}
