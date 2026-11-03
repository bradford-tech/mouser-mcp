import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createLimiter } from "../src/limiter.js";
import type { MouserClient } from "../src/mouser.js";
import { PreviewStore } from "../src/previews.js";
import { createPromptStateCodec } from "../src/prompt-state.js";
import { createServer, type ServerDeps } from "../src/server.js";

export type ElicitAnswer =
  | { action: "accept"; content: Record<string, unknown> }
  | { action: "decline" | "cancel" };

/**
 * Connects an MCP client to a real server instance in-process (no network).
 * The client declares form elicitation only when `opts.elicit` is given, so
 * tests can exercise both capable and incapable clients.
 */
export async function connect(
  deps: Partial<ServerDeps> & { mouser: MouserClient },
  opts: {
    elicit?: (message: string) => ElicitAnswer | Promise<ElicitAnswer>;
  } = {},
): Promise<Client> {
  const full: ServerDeps = {
    limiter: createLimiter({ sleep: () => Promise.resolve() }),
    ordersEnabled: false,
    previews: new PreviewStore(),
    promptState: createPromptStateCodec(),
    ...deps,
  };
  const handler = createMcpHandler(() => createServer(full));
  const client = new Client(
    { name: "test", version: "0" },
    {
      capabilities: opts.elicit ? { elicitation: { form: {} } } : {},
      versionNegotiation: { mode: "auto" },
    },
  );
  const { elicit } = opts;
  if (elicit) {
    client.setRequestHandler("elicitation/create", async (req) =>
      elicit(req.params.message),
    );
  }
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return client;
}

/** The JSON body of a captured request. */
export async function json(req: Request | undefined): Promise<unknown> {
  if (!req) throw new Error("no request captured");
  return req.clone().json();
}
