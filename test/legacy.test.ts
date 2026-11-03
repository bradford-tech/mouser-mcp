import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createLimiter } from "../src/limiter.js";
import { PreviewStore } from "../src/previews.js";
import { createPromptStateCodec } from "../src/prompt-state.js";
import { createServer } from "../src/server.js";
import { fakeMouser } from "./fake-order-api.js";

/**
 * One long-lived server instance and a 2025-era client (no versionNegotiation,
 * i.e. the initialize handshake). This is the shape stdio serves to older
 * clients: the SDK's legacy shim turns inputRequired into real
 * elicitation/create requests on the open connection.
 */
async function legacySession(answers: string[], elicitation = true) {
  const mouser = fakeMouser();
  const server = createServer({
    mouser: mouser.client,
    limiter: createLimiter({ sleep: () => Promise.resolve() }),
    ordersEnabled: true,
    previews: new PreviewStore(),
    promptState: createPromptStateCodec(),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client(
    { name: "legacy-test", version: "0" },
    { capabilities: elicitation ? { elicitation: { form: {} } } : {} },
  );
  const prompts: string[] = [];
  if (elicitation) {
    client.setRequestHandler("elicitation/create", async (req) => {
      prompts.push(req.params.message);
      return {
        action: "accept" as const,
        content: { word: answers.shift() ?? "" },
      };
    });
  }
  await client.connect(clientSide);
  return {
    client,
    prompts,
    requests: mouser.requests,
    submits: mouser.submits,
  };
}

async function previewId(client: Client): Promise<string> {
  const result = await client.callTool({
    name: "preview_order",
    arguments: { cartKey: "cart-1", currencyCode: "USD" },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  return (result.structuredContent as { previewId: string }).previewId;
}

test("a 2025-era client that can show prompts can place an order", async () => {
  const { client, prompts, submits } = await legacySession(["APPROVE"]);
  assert.equal(client.getProtocolEra(), "legacy");
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId: await previewId(client) },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  assert.equal(prompts.length, 1);
  assert.match(prompts[0] ?? "", /Type APPROVE/);
  assert.equal(submits().length, 1);
});

test("a 2025-era client still cancels on anything but APPROVE", async () => {
  const { client, submits } = await legacySession(["APPROV"]);
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId: await previewId(client) },
  });
  assert.equal(result.isError, true);
  assert.equal(submits().length, 0);
});

test("a 2025-era client without elicitation is refused before any Mouser call", async () => {
  const { client, requests } = await legacySession([], false);
  const id = await previewId(client);
  const before = requests.length;
  const result = await client.callTool({
    name: "submit_order",
    arguments: { previewId: id },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /Claude Code/);
  assert.equal(requests.length, before);
});
