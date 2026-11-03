// Smoke test for a packaged server: starts the given command over stdio and
// checks it serves the expected tools. Usage: node scripts/smoke.mjs <command> [args...]
// Imports @modelcontextprotocol/client from the caller's working directory.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(pathToFileURL(`${process.cwd()}/`));
const { Client } = await import(
  require.resolve("@modelcontextprotocol/client")
);
const { StdioClientTransport } = await import(
  require.resolve("@modelcontextprotocol/client/stdio")
);

const [command, ...args] = process.argv.slice(2);
if (!command)
  throw new Error("usage: node scripts/smoke.mjs <command> [args...]");

const client = new Client(
  { name: "smoke", version: "0" },
  { versionNegotiation: { mode: "auto" } },
);
await client.connect(
  new StdioClientTransport({
    command,
    args,
    env: { PATH: process.env.PATH ?? "" },
    stderr: "inherit",
  }),
);
const names = (await client.listTools()).tools.map((t) => t.name);
await client.close();

if (names.length !== 14 || names.includes("submit_order")) {
  console.error(`Unexpected tools (${names.length}): ${names.join(", ")}`);
  process.exit(1);
}
console.log(`Smoke test passed: ${names.length} tools served.`);
