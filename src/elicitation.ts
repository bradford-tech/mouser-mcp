import {
  CLIENT_CAPABILITIES_META_KEY,
  type ServerContext,
} from "@modelcontextprotocol/server";

/**
 * Whether the calling client declared form elicitation, i.e. can show the
 * server's confirmation prompt. Fails safe: any shape we don't recognize
 * (including clients that send no capabilities) counts as "no".
 */
export function canElicitForm(ctx: ServerContext): boolean {
  const envelope = (ctx.mcpReq as { envelope?: Record<string, unknown> })
    .envelope;
  const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as
    { elicitation?: { form?: unknown } } | undefined;
  const elicitation = capabilities?.elicitation;
  if (elicitation === undefined || elicitation === null) return false;
  // Per spec, an empty elicitation object means form-only support.
  if (typeof elicitation !== "object") return false;
  return (
    Object.keys(elicitation).length === 0 ||
    (elicitation.form !== undefined && elicitation.form !== null)
  );
}
