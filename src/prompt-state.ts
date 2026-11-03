import { createRequestStateCodec } from "@modelcontextprotocol/server";
import { randomBytes } from "node:crypto";
import { PREVIEW_TTL_MINUTES } from "./previews.js";

/**
 * What the server proves when it shows a confirmation prompt: it prompted for
 * this preview, with this one-time nonce. An APPROVE answer counts only when
 * it comes back with a verified state matching the preview's latest prompt —
 * answers the server never asked for are ignored.
 */
export interface PromptState {
  previewId: string;
  nonce: string;
}

export type PromptStateCodec = ReturnType<
  typeof createRequestStateCodec<PromptState>
>;

/**
 * An HMAC-signed, expiring codec for {@link PromptState}. The key is random per
 * process: prompts don't survive a server restart, which is the safe outcome.
 */
export function createPromptStateCodec(): PromptStateCodec {
  return createRequestStateCodec<PromptState>({
    key: new Uint8Array(randomBytes(32)),
    ttlSeconds: PREVIEW_TTL_MINUTES * 60,
  });
}

/** A fresh one-time nonce for a prompt. */
export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}
