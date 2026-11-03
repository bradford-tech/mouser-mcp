import {
  CLIENT_CAPABILITIES_META_KEY,
  type McpServer,
  type ServerContext,
} from "@modelcontextprotocol/server";

interface ElicitationCapabilities {
  elicitation?: { form?: unknown } | null;
}

/**
 * Whether the calling client declared form elicitation, i.e. can show the
 * server's confirmation prompt. 2026-era requests carry capabilities in their
 * `_meta` envelope; 2025-era connections declared them once at `initialize`
 * (the SDK's legacy shim then serves the prompt). Fails safe: any shape we
 * don't recognize counts as "no".
 */
export function canElicitForm(server: McpServer, ctx: ServerContext): boolean {
  const envelope = (ctx.mcpReq as { envelope?: Record<string, unknown> })
    .envelope;
  const capabilities = (
    envelope !== undefined
      ? envelope[CLIENT_CAPABILITIES_META_KEY]
      : // Deprecated for the modern era, but the supported way to read what a
        // 2025-era client declared at initialize.
        server.server.getClientCapabilities()
  ) as ElicitationCapabilities | undefined;
  const elicitation = capabilities?.elicitation;
  if (elicitation === undefined || elicitation === null) return false;
  if (typeof elicitation !== "object") return false;
  // Per spec, an empty elicitation object means form-only support.
  return (
    Object.keys(elicitation).length === 0 ||
    (elicitation.form !== undefined && elicitation.form !== null)
  );
}
