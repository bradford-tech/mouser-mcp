import type { createMouser } from "@bradford-tech/mouser-sdk";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { DailyLimitError, type Limiter } from "./limiter.js";
import { fail } from "./results.js";

/** A Mouser SDK client (the default env-backed client, or an isolated one). */
export type MouserClient = ReturnType<typeof createMouser>;

/** A Mouser call failed in a way the user or model can act on. */
export class MouserError extends Error {
  override name = "MouserError";
}

interface MouserErrorBody {
  Message?: string;
  Errors?: { Message?: string }[] | null;
}

function errorsMessage(body: unknown): string | undefined {
  const errors = (body as MouserErrorBody | undefined)?.Errors;
  const messages = (errors ?? [])
    .map((e) => e.Message)
    .filter((m): m is string => Boolean(m));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

/**
 * Runs one Mouser SDK call through the limiter and unwraps its result. Mouser
 * reports problems three ways — SDK errors (e.g. a missing API key), HTTP
 * errors, and an `Errors` array inside a 200 response — and all three become a
 * {@link MouserError} carrying Mouser's own message.
 */
export async function callMouser<T>(
  limiter: Limiter,
  run: () => Promise<{ data?: T; error?: unknown; response?: Response }>,
): Promise<T> {
  const result = await limiter.schedule(run);
  const { error, data, response } = result;
  if (error !== undefined) {
    if (error instanceof Error) throw new MouserError(error.message);
    const body = error as MouserErrorBody;
    throw new MouserError(
      body.Message ??
        errorsMessage(body) ??
        `Mouser request failed${response ? ` (HTTP ${response.status})` : ""}.`,
    );
  }
  const inBody = errorsMessage(data);
  if (inBody) throw new MouserError(inBody);
  return data as T;
}

/** Maps expected failures to an `isError` tool result; rethrows anything else. */
export function toToolError(err: unknown): CallToolResult {
  if (err instanceof MouserError || err instanceof DailyLimitError) {
    return fail(err.message);
  }
  throw err;
}

/**
 * Runs a tool body, turning expected Mouser failures (API errors, missing
 * keys, the daily limit) into `isError` results the model can act on.
 * Anything unexpected still throws.
 */
export async function tool(
  body: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await body();
  } catch (err) {
    return toToolError(err);
  }
}
