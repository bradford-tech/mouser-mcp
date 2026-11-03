import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../src/index.ts", import.meta.url));

/** Starts the real entry point over stdio, with only the given env. */
async function start(env: Record<string, string> = {}): Promise<Client> {
  const client = new Client(
    { name: "stdio-test", version: "0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "jiti/register", ENTRY],
      env: { PATH: process.env.PATH ?? "", ...env },
      stderr: "ignore",
    }),
  );
  return client;
}

test("serves the 14 non-order tools over stdio by default", async () => {
  const client = await start();
  try {
    const names = (await client.listTools()).tools.map((t) => t.name);
    assert.equal(names.length, 14);
    assert.equal(names.includes("submit_order"), false);
  } finally {
    await client.close();
  }
});

test("MOUSER_ENABLE_ORDERS=1 adds the ordering tools", async () => {
  const client = await start({ MOUSER_ENABLE_ORDERS: "1" });
  try {
    const names = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(
      names.includes("preview_order") && names.includes("submit_order"),
    );
  } finally {
    await client.close();
  }
});

test("a missing search key is reported without crashing the server", async () => {
  const client = await start();
  try {
    const result = await client.callTool({
      name: "search_parts",
      arguments: { keyword: "LM358" },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /No Mouser search API key/);
  } finally {
    await client.close();
  }
});
