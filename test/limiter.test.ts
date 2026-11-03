import assert from "node:assert/strict";
import { test } from "node:test";
import { createLimiter, DailyLimitError } from "../src/limiter.js";

function fakeClock(start = Date.UTC(2026, 10, 2, 12, 0, 0)) {
  let now = start;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps,
  };
}

test("runs up to 30 calls a minute without waiting", async () => {
  const clock = fakeClock();
  const limiter = createLimiter(clock);
  for (let i = 0; i < 30; i++) await limiter.schedule(async () => i);
  assert.deepEqual(clock.sleeps, []);
});

test("queues the 31st call until the first leaves the 60s window", async () => {
  const clock = fakeClock();
  const limiter = createLimiter(clock);
  const start = clock.now();
  for (let i = 0; i < 30; i++) {
    await limiter.schedule(async () => i);
    clock.advance(1000);
  }
  let ranAt = 0;
  await limiter.schedule(async () => {
    ranAt = clock.now();
  });
  assert.ok(ranAt >= start + 60_000, `ran at +${ranAt - start}ms`);
});

test("rejects once the daily limit is reached", async () => {
  const clock = fakeClock();
  const limiter = createLimiter({ ...clock, perMinute: 10_000, perDay: 3 });
  for (let i = 0; i < 3; i++) await limiter.schedule(async () => i);
  await assert.rejects(
    limiter.schedule(async () => 4),
    DailyLimitError,
  );
});

test("a new UTC day resets the daily count", async () => {
  const clock = fakeClock(Date.UTC(2026, 10, 2, 23, 59, 0));
  const limiter = createLimiter({ ...clock, perMinute: 10_000, perDay: 1 });
  await limiter.schedule(async () => 1);
  clock.advance(2 * 60_000);
  assert.equal(await limiter.schedule(async () => 2), 2);
});

test("the daily-limit message is user-facing", async () => {
  const limiter = createLimiter({ ...fakeClock(), perDay: 0 });
  await assert.rejects(
    limiter.schedule(async () => 1),
    {
      message:
        "Mouser's daily API limit (1,000 calls) is reached; try again after midnight UTC.",
    },
  );
});
