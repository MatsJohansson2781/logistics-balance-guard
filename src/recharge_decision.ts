export type RechargeDecision =
  | { action: "continue"; reason: "balance-above-trigger" | "routine-event" }
  | { action: "recharge-notified"; reason: "exception-at-trigger" };

export function decideRechargeNotification(input: {
  eventKind: "picked_up" | "in_transit" | "delivered" | "exception";
  balance: number;
  triggerBalance: number;
}): RechargeDecision {
  if (input.eventKind !== "exception") {
    return { action: "continue", reason: "routine-event" };
  }
  if (input.balance > input.triggerBalance) {
    return { action: "continue", reason: "balance-above-trigger" };
  }
  return { action: "recharge-notified", reason: "exception-at-trigger" };
}
