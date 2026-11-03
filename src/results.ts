import type { CallToolResult } from "@modelcontextprotocol/server";

/** A successful tool result: structured data plus a text rendering of it. */
export function ok<T extends Record<string, unknown>>(
  structured: T,
  text: string,
): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

/** A failed tool result the model can read and act on. */
export function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
