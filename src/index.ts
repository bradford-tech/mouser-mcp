#!/usr/bin/env node
import { client } from "@bradford-tech/mouser-sdk";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createLimiter } from "./limiter.js";
import { PreviewStore } from "./previews.js";
import { createPromptStateCodec } from "./prompt-state.js";
import { createServer, SERVER_VERSION, type ServerDeps } from "./server.js";

// Keys come from MOUSER_SEARCH_API_KEY / MOUSER_ORDER_API_KEY via the SDK's
// default client, read per request. Order placement is opt-in.
const enableOrders = process.env.MOUSER_ENABLE_ORDERS?.trim().toLowerCase();

const deps: ServerDeps = {
  mouser: client,
  limiter: createLimiter(),
  ordersEnabled: enableOrders === "1" || enableOrders === "true",
  previews: new PreviewStore(),
  promptState: createPromptStateCodec(),
};

serveStdio(() => createServer(deps), {
  onerror: (err) => console.error("[mouser-mcp]", err),
});

// stdout carries the protocol; diagnostics go to stderr.
console.error(
  `[mouser-mcp] ${SERVER_VERSION} on stdio; ordering ${deps.ordersEnabled ? "enabled" : "disabled"}`,
);
