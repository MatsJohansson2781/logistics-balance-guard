import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { decideRechargeNotification } from "./recharge_decision.js";

const proofOfDeliverySchema = z.object({
  object_key: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  content_type: z.enum(["image/jpeg", "image/png", "application/pdf"]),
});

export const shipmentEventSchema = z.object({
  shipment_id: z.string().min(1),
  event_id: z.string().uuid(),
  kind: z.enum(["picked_up", "in_transit", "delivered", "exception"]),
  occurred_at: z.string().datetime(),
  proof_of_delivery: proofOfDeliverySchema.optional(),
  exception: z
    .object({ code: z.string().min(1), note: z.string().max(500) })
    .optional(),
});

type ShipmentEvent = z.infer<typeof shipmentEventSchema>;

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

export async function handleShipmentEvent(
  event: ShipmentEvent,
  client: Pick<InfraiClient, "getBalance" | "sendEmail">,
  triggerBalance: number,
  alertTo: string,
) {
  const account = await client.getBalance();
  const decision = decideRechargeNotification({
    eventKind: event.kind,
    balance: account.balance,
    triggerBalance,
  });

  if (decision.action === "recharge-notified") {
    const email = await client.sendEmail(
      alertTo,
      `Recharge active during shipment exception ${event.shipment_id}`,
      `Event ${event.event_id} was recorded. Automatic recharge protects dispatch continuity.`,
    );
    return { accepted: true, decision, notification_id: email.message_id };
  }

  return { accepted: true, decision };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.env.NODE_ENV !== "test") {
  const client = new InfraiClient(requiredEnvironment("INFRAI_API_KEY"));
  const triggerBalance = Number(process.env.TRIGGER_BALANCE ?? "20");
  const alertTo = requiredEnvironment("OPERATIONS_EMAIL");
  const port = Number(process.env.PORT ?? "3000");

  createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/shipment-events") {
      sendJson(response, 404, { error: "route_not_found" });
      return;
    }

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const parsed = shipmentEventSchema.safeParse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      if (!parsed.success) {
        sendJson(response, 400, {
          error: "invalid_shipment_event",
          issues: parsed.error.issues,
        });
        return;
      }
      const result = await handleShipmentEvent(
        parsed.data,
        client,
        triggerBalance,
        alertTo,
      );
      sendJson(response, 202, result);
    } catch (error) {
      if (error instanceof InfraiError) {
        sendJson(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
          error: error.code,
          request_id: randomUUID(),
        });
        return;
      }
      sendJson(response, 400, { error: "invalid_json" });
    }
  }).listen(port, () => {
    console.log(`Shipment event service listening on http://localhost:${port}`);
  });
}
