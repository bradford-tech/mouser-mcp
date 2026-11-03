import assert from "node:assert/strict";
import { test } from "node:test";
import { createLimiter } from "../src/limiter.js";
import { part } from "./fixtures.js";
import { connect, json } from "./harness.js";
import { mouserWithFetch } from "./helpers.js";

type Structured = Record<string, unknown>;

test("search_parts posts a keyword search with paging and filter", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({
    SearchResults: { NumberOfResult: 321, Parts: [part()] },
  }));
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "search_parts",
    arguments: { keyword: "LM358", filter: "in_stock", offset: 20 },
  });
  assert.equal(result.isError, undefined);
  const url = new URL(requests[0]?.url ?? "");
  assert.equal(url.pathname, "/api/v1/search/keyword");
  assert.equal(url.searchParams.get("apiKey"), "S");
  assert.deepEqual(await json(requests[0]), {
    SearchByKeywordRequest: {
      keyword: "LM358",
      records: 10,
      startingRecord: 20,
      searchOptions: "InStock",
    },
  });
  const structured = result.structuredContent as Structured;
  assert.equal(structured.totalResults, 321);
  assert.equal(
    (structured.parts as Structured[])[0]?.mouserPartNumber,
    "595-LM358DR",
  );
});

test("search_parts with a manufacturer uses the V2 endpoint and page numbers", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({
    SearchResults: { NumberOfResult: 0, Parts: [] },
  }));
  const client = await connect({ mouser });
  await client.callTool({
    name: "search_parts",
    arguments: {
      keyword: "LDO",
      manufacturer: "Texas Instruments",
      limit: 25,
      offset: 50,
    },
  });
  assert.equal(
    new URL(requests[0]?.url ?? "").pathname,
    "/api/v2/search/keywordandmanufacturer",
  );
  assert.deepEqual(await json(requests[0]), {
    SearchByKeywordMfrNameRequest: {
      keyword: "LDO",
      manufacturerName: "Texas Instruments",
      records: 25,
      pageNumber: 3,
      searchOptions: "None",
    },
  });
});

test("get_parts batches part numbers ten per call and reports misses", async () => {
  const pns = Array.from(
    { length: 25 },
    (_, i) => `PN-${String(i).padStart(3, "0")}`,
  );
  const { client: mouser, requests } = mouserWithFetch(async (req) => {
    const body = (await req.json()) as {
      SearchByPartRequest: { mouserPartNumber: string };
    };
    const asked = body.SearchByPartRequest.mouserPartNumber.split("|");
    const found = asked.filter((pn) => pn !== "PN-007" && pn !== "PN-021");
    return {
      SearchResults: {
        NumberOfResult: found.length,
        Parts: found.map((pn) =>
          part({ MouserPartNumber: `595-${pn}`, ManufacturerPartNumber: pn }),
        ),
      },
    };
  });
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "get_parts",
    arguments: { partNumbers: pns },
  });
  const batches = await Promise.all(
    requests.map(
      async (r) =>
        (
          (await json(r)) as {
            SearchByPartRequest: { mouserPartNumber: string };
          }
        ).SearchByPartRequest.mouserPartNumber.split("|").length,
    ),
  );
  assert.deepEqual(batches, [10, 10, 5]);
  const structured = result.structuredContent as Structured;
  assert.equal((structured.parts as unknown[]).length, 23);
  assert.deepEqual(structured.notFound, ["PN-007", "PN-021"]);
});

test("get_parts handles a 200-line BOM in 20 calls", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({
    SearchResults: { NumberOfResult: 0, Parts: [] },
  }));
  const client = await connect({ mouser });
  const pns = Array.from({ length: 200 }, (_, i) => `PART-${i}`);
  await client.callTool({ name: "get_parts", arguments: { partNumbers: pns } });
  assert.equal(requests.length, 20);
});

test("get_parts exact and manufacturer options map to Mouser's request", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({
    SearchResults: { NumberOfResult: 0, Parts: [] },
  }));
  const client = await connect({ mouser });
  await client.callTool({
    name: "get_parts",
    arguments: {
      partNumbers: ["LM358DR"],
      exact: true,
      manufacturer: "Texas Instruments",
    },
  });
  assert.equal(
    new URL(requests[0]?.url ?? "").pathname,
    "/api/v2/search/partnumberandmanufacturer",
  );
  assert.deepEqual(await json(requests[0]), {
    SearchByPartMfrNameRequest: {
      mouserPartNumber: "LM358DR",
      manufacturerName: "Texas Instruments",
      partSearchOptions: "Exact",
    },
  });
});

test("Mouser Errors[] become an isError result", async () => {
  const { client: mouser } = mouserWithFetch(() => ({
    Errors: [{ Message: "Invalid unique identifier." }],
  }));
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "search_parts",
    arguments: { keyword: "x" },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /Invalid unique identifier/);
});

test("a 50-part page stays compact", async () => {
  const parts = Array.from({ length: 50 }, (_, i) =>
    part({ MouserPartNumber: `595-P${i}` }),
  );
  const { client: mouser } = mouserWithFetch(() => ({
    SearchResults: { NumberOfResult: 5000, Parts: parts },
  }));
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "search_parts",
    arguments: { keyword: "x", limit: 50 },
  });
  const size = JSON.stringify(result.structuredContent).length;
  assert.ok(size < 40_000, `structured size ${size}`);
});

test("list_manufacturers caches the list and filters by query", async () => {
  const { client: mouser, requests } = mouserWithFetch(() => ({
    MouserManufacturerList: {
      Count: 3,
      ManufacturerList: [
        { ManufacturerName: "Texas Instruments" },
        { ManufacturerName: "STMicroelectronics" },
        { ManufacturerName: "Texas Micro" },
      ],
    },
  }));
  const client = await connect({ mouser });
  const first = await client.callTool({
    name: "list_manufacturers",
    arguments: { query: "texas" },
  });
  await client.callTool({ name: "list_manufacturers", arguments: {} });
  assert.equal(requests.length, 1);
  assert.deepEqual((first.structuredContent as Structured).manufacturers, [
    "Texas Instruments",
    "Texas Micro",
  ]);
});

test("get_parts returns full detail, search_parts the lighter summary", async () => {
  const { client: mouser } = mouserWithFetch(() => ({
    SearchResults: { NumberOfResult: 1, Parts: [part()] },
  }));
  const client = await connect({ mouser });
  const detail = await client.callTool({
    name: "get_parts",
    arguments: { partNumbers: ["595-LM358DR"] },
  });
  const search = await client.callTool({
    name: "search_parts",
    arguments: { keyword: "LM358" },
  });
  const detailPart = (
    (detail.structuredContent as Structured).parts as Structured[]
  )[0];
  const searchPart = (
    (search.structuredContent as Structured).parts as Structured[]
  )[0];
  assert.equal(
    detailPart?.datasheetUrl,
    "https://www.mouser.com/datasheet/2/405/lm358.pdf",
  );
  assert.equal(searchPart?.datasheetUrl, undefined);
});

test("get_parts keeps results from good batches when one batch fails", async () => {
  const pns = Array.from(
    { length: 25 },
    (_, i) => `PN-${String(i).padStart(3, "0")}`,
  );
  let call = 0;
  const { client: mouser } = mouserWithFetch(async (req) => {
    call++;
    if (call === 2) return { Errors: [{ Message: "Service busy" }] };
    const body = (await req.json()) as {
      SearchByPartRequest: { mouserPartNumber: string };
    };
    const asked = body.SearchByPartRequest.mouserPartNumber.split("|");
    return {
      SearchResults: {
        NumberOfResult: asked.length,
        Parts: asked.map((pn) =>
          part({ MouserPartNumber: `595-${pn}`, ManufacturerPartNumber: pn }),
        ),
      },
    };
  });
  const client = await connect({ mouser });
  const result = await client.callTool({
    name: "get_parts",
    arguments: { partNumbers: pns },
  });
  assert.equal(result.isError, undefined);
  const structured = result.structuredContent as Structured;
  assert.equal((structured.parts as unknown[]).length, 15);
  assert.deepEqual(structured.notFound, []);
  assert.deepEqual(structured.failed, [
    { partNumbers: pns.slice(10, 20), error: "Service busy" },
  ]);
});

test("get_parts reports every remaining batch as failed once the daily limit is hit", async () => {
  const { client: mouser } = mouserWithFetch(() => ({
    SearchResults: { NumberOfResult: 0, Parts: [] },
  }));
  const client = await connect({
    mouser,
    limiter: createLimiter({ sleep: () => Promise.resolve(), perDay: 1 }),
  });
  const pns = Array.from({ length: 25 }, (_, i) => `PART-${i}`);
  const result = await client.callTool({
    name: "get_parts",
    arguments: { partNumbers: pns },
  });
  const failed = (result.structuredContent as Structured).failed as {
    partNumbers: string[];
    error: string;
  }[];
  assert.deepEqual(
    failed.map((f) => f.partNumbers.length),
    [10, 5],
  );
  assert.match(failed[0]?.error ?? "", /daily API limit/);
  assert.equal(
    ((result.structuredContent as Structured).notFound as string[]).length,
    10,
  );
});
