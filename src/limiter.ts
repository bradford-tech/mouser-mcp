/**
 * Paces Mouser calls to stay within Mouser's published API limits: slots are
 * handed out in order, and calls run concurrently once they have one.
 */
export interface Limiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

/** Mouser's daily call budget is used up; further calls would be rejected. */
export class DailyLimitError extends Error {
  override name = "DailyLimitError";
}

const MINUTE_MS = 60_000;

/**
 * Creates a limiter for Mouser's limits (30 calls per minute, 1,000 per day).
 * Calls over the per-minute rate wait their turn rather than failing, so a long
 * BOM lookup just takes longer. Once the local daily count is reached, calls
 * reject with {@link DailyLimitError}. The count resets at midnight UTC (Mouser
 * doesn't publish its own day boundary; its error, when it comes, wins).
 */
export function createLimiter(
  opts: {
    perMinute?: number;
    perDay?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Limiter {
  const perMinute = opts.perMinute ?? 30;
  const perDay = opts.perDay ?? 1000;
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const recent: number[] = [];
  let day = "";
  let dayCount = 0;
  let queue: Promise<unknown> = Promise.resolve();

  async function acquire(): Promise<void> {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      dayCount = 0;
    }
    if (dayCount >= perDay) {
      throw new DailyLimitError(
        `Mouser's daily API limit (${perDay.toLocaleString("en-US")} calls) is reached; try again after midnight UTC.`,
      );
    }
    while (recent.length > 0 && now() - (recent[0] ?? 0) >= MINUTE_MS) {
      recent.shift();
    }
    if (recent.length >= perMinute) {
      await sleep((recent[0] ?? 0) + MINUTE_MS - now());
      recent.shift();
    }
    recent.push(now());
    dayCount++;
  }

  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      const turn = queue.then(acquire);
      queue = turn.catch(() => undefined);
      return turn.then(fn);
    },
  };
}
