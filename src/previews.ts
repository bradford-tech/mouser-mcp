import type { OrderRequestType } from "@bradford-tech/mouser-sdk";
import { randomBytes } from "node:crypto";

/** One cart line as captured at preview time. */
export interface CartLine {
  mouserPartNumber: string;
  quantity: number;
}

/** Mouser's order preview, reduced to what a person checks before approving. */
export interface OrderSummary {
  currency?: string;
  merchandiseTotal?: number;
  additionalFeesTotal?: number;
  taxAmount?: number;
  shippingMethod?: string;
  orderTotal?: number;
  lines: {
    mouserPartNumber?: string;
    quantity?: number;
    unitPrice?: number;
    extendedPrice?: number;
  }[];
}

export interface Preview {
  id: string;
  /** The exact order request previewed; submission re-sends it unchanged. */
  request: OrderRequestType;
  cartSnapshot: CartLine[];
  summary: OrderSummary;
  createdAt: number;
  state: "pending" | "used";
  /**
   * Nonces of the confirmation prompts issued for this preview. Several can be
   * outstanding (e.g. concurrent calls); `consume` still allows one order.
   */
  promptNonces: Set<string>;
}

/** How long a preview can be submitted. Stated in the preview tool's description. */
export const PREVIEW_TTL_MINUTES = 20;

/**
 * In-memory order previews, each submittable at most once before it expires.
 * Lives for the server process; nothing is persisted.
 */
export class PreviewStore {
  readonly #previews = new Map<string, Preview>();
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor(opts: { ttlMs?: number; now?: () => number } = {}) {
    this.#ttlMs = opts.ttlMs ?? PREVIEW_TTL_MINUTES * 60_000;
    this.#now = opts.now ?? Date.now;
  }

  create(
    input: Omit<Preview, "id" | "createdAt" | "state" | "promptNonces">,
  ): Preview {
    this.#sweep();
    const preview: Preview = {
      ...input,
      id: randomBytes(16).toString("base64url"),
      createdAt: this.#now(),
      state: "pending",
      promptNonces: new Set(),
    };
    this.#previews.set(preview.id, preview);
    return preview;
  }

  /** The preview, or `undefined` if unknown or expired. */
  get(id: string): Preview | undefined {
    const preview = this.#previews.get(id);
    if (!preview) return undefined;
    if (this.#now() - preview.createdAt > this.#ttlMs) {
      this.#previews.delete(id);
      return undefined;
    }
    return preview;
  }

  /**
   * Marks a pending preview used. Returns `true` exactly once per preview, so
   * concurrent or retried submissions can't place the same order twice.
   */
  consume(id: string): boolean {
    const preview = this.get(id);
    if (!preview || preview.state !== "pending") return false;
    preview.state = "used";
    return true;
  }

  #sweep(): void {
    for (const id of this.#previews.keys()) this.get(id);
  }
}
