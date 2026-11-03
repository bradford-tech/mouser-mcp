import { McpServer } from "@modelcontextprotocol/server";
import type { Limiter } from "./limiter.js";
import type { MouserClient } from "./mouser.js";
import type { PreviewStore } from "./previews.js";
import { registerCartTools } from "./tools/cart.js";
import { registerOrderingTools } from "./tools/ordering.js";
import { registerOrderInfoTools } from "./tools/orders.js";
import { registerSearchTools } from "./tools/search.js";

/**
 * Everything a server instance needs. The MCP SDK builds a fresh server per
 * request, so anything that must persist across calls (the rate limiter,
 * caches, order previews) lives here and is shared by every instance.
 */
export interface ServerDeps {
  mouser: MouserClient;
  limiter: Limiter;
  ordersEnabled: boolean;
  previews: PreviewStore;
}

export const SERVER_VERSION = "0.0.1";

export const SERVER_INSTRUCTIONS = [
  "Mouser Electronics part search, BOM review, carts and order history.",
  "Search tools use the Mouser Search API key; cart, order and order-history tools use the Mouser Order API key.",
  "Mouser has no parametric filtering or sorting: search by keyword and filter the returned descriptions.",
  "Mouser allows 30 calls per minute and 1,000 per day; batch part-number lookups with get_parts.",
  "Order placement is opt-in (MOUSER_ENABLE_ORDERS=1) and requires a client that can show a confirmation prompt (Claude Code in interactive mode).",
].join(" ");

export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: "mouser", version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerSearchTools(server, deps);
  registerCartTools(server, deps);
  registerOrderInfoTools(server, deps);
  if (deps.ordersEnabled) registerOrderingTools(server, deps);
  return server;
}
