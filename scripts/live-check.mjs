// Live check against the real Mouser API through the built server over stdio.
// Read-only tools only — never add cart-changing or ordering tools here.
// Run with: npm run build && npm run live-check   (keys from .env)

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const client = new Client(
  { name: "live-check", version: "0" },
  { versionNegotiation: { mode: "auto" } },
);
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: {
      PATH: process.env.PATH ?? "",
      MOUSER_SEARCH_API_KEY: process.env.MOUSER_SEARCH_API_KEY ?? "",
      MOUSER_ORDER_API_KEY: process.env.MOUSER_ORDER_API_KEY ?? "",
    },
    stderr: "inherit",
  }),
);

let failed = false;
async function check(label, name, args, summarize, { required = true } = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const message = result.content?.[0]?.text ?? "unknown error";
    console.log(`${required ? "FAIL" : "SKIP"} ${label}: ${message}`);
    if (required) failed = true;
    return;
  }
  console.log(`ok   ${label}: ${summarize(result.structuredContent)}`);
}

await check(
  "search_parts",
  "search_parts",
  { keyword: "LM358", limit: 5 },
  (s) => `${s.totalResults} results, ${s.parts.length} returned`,
);
await check(
  "get_parts",
  "get_parts",
  { partNumbers: ["595-NE555P", "TPS62130RGTR"] },
  (s) => `${s.parts.length} found, notFound=${JSON.stringify(s.notFound)}`,
);
// The order key may not be active yet; report rather than fail.
await check(
  "list_currencies",
  "list_currencies",
  {},
  (s) => `${s.Currencies?.length ?? 0} currencies`,
  { required: false },
);

await client.close();
process.exit(failed ? 1 : 0);
