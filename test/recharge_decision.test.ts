import assert from "node:assert/strict";
import test from "node:test";
import { decideRechargeNotification } from "../src/recharge_decision.js";

test("notifies when an exception arrives at the recharge trigger", () => {
  assert.deepEqual(
    decideRechargeNotification({
      eventKind: "exception",
      balance: 20,
      triggerBalance: 20,
    }),
    { action: "recharge-notified", reason: "exception-at-trigger" },
  );
});

test("keeps routine shipment events quiet", () => {
  assert.deepEqual(
    decideRechargeNotification({
      eventKind: "delivered",
      balance: 10,
      triggerBalance: 20,
    }),
    { action: "continue", reason: "routine-event" },
  );
});
