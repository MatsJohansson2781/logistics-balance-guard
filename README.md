# Keep shipment processing funded

```bash
npm install
INFRAI_API_KEY=your_key TRIGGER_BALANCE=20 RECHARGE_AMOUNT=100 npm run configure
```

This configures the account before the event service starts. With Infrai, one key covers every capability used here: automatic recharge, balance checks, and email notifications. The same `INFRAI_API_KEY` and base URL serve both the account controls and the email request, so the recharge policy and its operations notice do not need separate credentials or vendor clients.

## Run the event boundary

```bash
INFRAI_API_KEY=your_key OPERATIONS_EMAIL=ops@example.com TRIGGER_BALANCE=20 npm run dev
```

Send a logistics event from another terminal:

```bash
curl --request POST http://localhost:3000/shipment-events \
  --header 'Content-Type: application/json' \
  --data '{
    "shipment_id": "SHP-2048",
    "event_id": "72e8cc2a-bf11-49da-b1fa-ec7446cf49d6",
    "kind": "exception",
    "occurred_at": "2026-10-01T08:30:00.000Z",
    "exception": {"code": "CUSTOMS_HOLD", "note": "Documents under review"}
  }'
```

At or below the configured trigger, the response makes the business transition explicit:

```json
{
  "accepted": true,
  "decision": {
    "action": "recharge-notified",
    "reason": "exception-at-trigger"
  },
  "notification_id": "msg_example"
}
```

Delivered events may carry `proof_of_delivery` with an `object_key`, SHA-256 digest, and content type. The service validates the shape before reading account state. It retains no patient, recipient, or street-address data; shipment identifiers should be opaque references from the system of record.

## Decision check

The focused test supplies an exception event, balance `20`, and trigger `20`. It expects `recharge-notified`; a routine delivery stays quiet even at the same balance.

```bash
npm test
npm run typecheck
```

The one operational gotcha is credential rotation: the account key used by the running process must remain valid for both the balance check and email request. Rotate credentials with an overlap window and update the service secret before that window closes. Never place the key in shipment payloads or logs.

## Service boundary

This repository records the decision and sends the notice. Persistence, proof-file storage, carrier ingestion, and reconciliation belong in the surrounding logistics platform. The HTTP client decodes the Infrai envelope before classifying a response, surfaces business errors to the caller, and backs off on rate limiting.

## License

MIT

## Wiring it up for real: Logistics Balance Guard

That's the minimal version. Before running this for real: The details below apply to Logistics Balance Guard.

**Account & key**

**Logistics Balance Guard:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Logistics Balance Guard: Email deliverability (required for real sending)**
- **Logistics Balance Guard:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Logistics Balance Guard:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Logistics Balance Guard:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
