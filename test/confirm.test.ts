import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFIRMATION_WORD, isApprove } from "../src/confirm.js";

test("the confirmation word is APPROVE", () => {
  assert.equal(CONFIRMATION_WORD, "APPROVE");
});

for (const input of [
  "APPROVE",
  '"APPROVE"',
  "'approve'",
  "approve",
  "Approve",
  " approve ",
  ' "APPROVE" ',
]) {
  test(`accepts ${JSON.stringify(input)}`, () => {
    assert.equal(isApprove(input), true);
  });
}

for (const input of [
  "APPROV",
  "approved",
  "approve!",
  "yes",
  "yep looks good",
  "",
  '"approve',
  '""approve""',
  "approve approve",
  "\"approve'",
]) {
  test(`rejects ${JSON.stringify(input)}`, () => {
    assert.equal(isApprove(input), false);
  });
}
