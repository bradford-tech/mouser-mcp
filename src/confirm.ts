/** The word a user types into the server's confirmation prompt to place an order. */
export const CONFIRMATION_WORD = "APPROVE";

/**
 * Whether the text typed into the confirmation prompt approves the order.
 * Ignores case and surrounding whitespace and allows one pair of matching
 * quotes (`"APPROVE"`), so a user copying the word from the prompt isn't
 * tripped up. Anything else — typos, extra words, punctuation — is a refusal.
 */
export function isApprove(raw: string): boolean {
  let text = raw.trim();
  const first = text[0];
  if (
    text.length >= 2 &&
    (first === '"' || first === "'") &&
    text.at(-1) === first
  ) {
    text = text.slice(1, -1).trim();
  }
  return text.toLowerCase() === CONFIRMATION_WORD.toLowerCase();
}
