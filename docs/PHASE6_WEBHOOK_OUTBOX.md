# Phase 6a — Webhook Outbox

Operator runbook for the webhook outbox shipped in commit `83b45c4` /
`124ce02`. Pairs with the admin UI at `/admin/webhooks` for endpoint
registration, secret rotation, and one-click requeue.

---

## 1. Architecture in one diagram

```
   Feature code              SECURITY DEFINER RPC               Outbox table
   ─────────────             ──────────────────────             ───────────────────────
   inventoryService    ──▶   emit_webhook_event       ──▶      webhook_outbox
   (any service that         (fans out one row per              (status=pending,
    needs to emit)            matching endpoint)                 next_retry_at=now)
                                                                  │
                                                                  │ claim batch
                                                                  ▼
                                                      ┌──────────────────────┐
                                                      │ webhook-deliverer    │
                                                      │ edge function (cron) │
                                                      └──────────────────────┘
                                                                  │
                                                                  │ POST + HMAC-SHA256
                                                                  ▼
                                                              Receiver
                                                              (any HTTPS URL)
```

Producers call `emitWebhookEvent(companyId, eventType, payload)` from
`src/services/webhookOutboxService.ts`. The RPC inserts one outbox row
per matching active endpoint. The `webhook-deliverer` edge function accepts
the service-role bearer for scheduled global delivery, and also allows active
admin users to trigger delivery manually. Company admins are scoped to their
own company.

---

## 2. Cron schedule (one-time operator setup)

The deliverer is invoked on a schedule. Two supported transports:

### Option A — Supabase pg_cron (recommended)

Schedule a job that POSTs to the function with the service role:

```sql
-- Run once per minute. Adjust the limit as throughput grows.
SELECT cron.schedule(
  'webhook-deliverer',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/webhook-deliverer?limit=50',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );
  $$
);
```

The service role key must be exposed to pg_cron via a custom GUC
(`app.settings.service_role_key`) set by an init SQL script — never
inline the key in the cron statement.

### Option B — Cloudflare cron trigger

If you already have a Cloudflare worker fronting the project, schedule
its `[triggers] crons = ["* * * * *"]` to call:

```
POST https://<project-ref>.supabase.co/functions/v1/webhook-deliverer?limit=50
Authorization: Bearer ${SERVICE_ROLE_KEY}
```

The function is idempotent — running it twice in parallel just claims
two non-overlapping batches.

---

## 3. Registering an endpoint

From the admin UI: `/admin/webhooks` → "Register endpoint".

Required:
- **Name** — operator label, free-form.
- **URL** — must start with `https://`. The migration enforces this with a
  check constraint and the `upsert_webhook_endpoint` RPC enforces it again.
- **HMAC secret** — auto-generated UUID on create (32 hex chars). You can
  paste your own if a partner specified one. Stored in plaintext in
  `webhook_endpoints.secret`; RLS limits read to company / super admins.
- **Event types** — comma-separated. Empty means subscribe to **all** events.

Adopt incrementally:
1. Register the endpoint with the events list narrowly scoped at first.
2. Confirm a small handful of deliveries succeed (`/admin/webhooks`
   recent-deliveries panel).
3. Broaden the events list once the receiver is hardened.

---

## 4. Receiver — verifying the HMAC signature

Every delivery carries three headers:

```
X-Webhook-Signature: t=<unix-seconds>,v1=<hex-hmac-sha256>
X-Webhook-Event:     vehicle.transfer.arrived
X-Webhook-Delivery-Id: <uuid>
```

The signature is computed over the string `"<ts>.<raw-body>"` with the
shared secret. The receiver MUST:

1. Parse `t=` and `v1=` from the header.
2. Reject if `t` is older than ~5 minutes (replay defence).
3. Recompute `HMAC-SHA256(secret, "<t>.<raw-body>")` and **constant-time
   compare** against `v1`.
4. Reject if the signatures differ.
5. Treat the delivery as **at-least-once** — use `X-Webhook-Delivery-Id`
   to dedupe; the producer will retry until 2xx.

### Reference receiver (TypeScript / Node)

```ts
import crypto from 'node:crypto';
import express from 'express';

const SECRET = process.env.WEBHOOK_SECRET!;        // from /admin/webhooks
const MAX_SKEW_SEC = 300;

const app = express();
app.use(express.raw({ type: 'application/json' }));  // keep the raw body!

app.post('/webhook', (req, res) => {
  const header = req.header('X-Webhook-Signature') ?? '';
  const parts  = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const ts     = parseInt(parts.t  ?? '0', 10);
  const sig    = parts.v1 ?? '';

  if (!ts || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SEC) {
    return res.status(401).send('stale or missing timestamp');
  }

  const body = (req.body as Buffer).toString('utf8');
  const expected = crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');

  // Constant-time compare — prevents timing side-channels.
  const ok = expected.length === sig.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  if (!ok) return res.status(401).send('bad signature');

  const event = JSON.parse(body);
  // Idempotency via delivery id:
  //   const dupKey = req.header('X-Webhook-Delivery-Id')!;
  //   if (alreadyProcessed(dupKey)) return res.sendStatus(200);

  console.log('received', event.event_type, event.data);
  res.sendStatus(200);
});

app.listen(8080);
```

### Reference receiver (curl probe)

For quick smoke tests against a static signature:

```bash
TS=$(date +%s)
BODY='{"id":"deadbeef","event_type":"smoke.test","company_id":"co-1","emitted_at":"2026-05-28T00:00:00Z","data":{}}'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

curl -i -X POST https://your.receiver.example/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: t=$TS,v1=$SIG" \
  -H "X-Webhook-Event: smoke.test" \
  -H "X-Webhook-Delivery-Id: deadbeef" \
  -d "$BODY"
```

---

## 5. Retry / backoff behaviour

Failed deliveries retry with exponential backoff:

| Attempt | Delay before next retry |
|--------:|--------------------------|
| 1       | 1 minute                 |
| 2       | 5 minutes                |
| 3       | 15 minutes               |
| 4       | 1 hour                   |
| 5       | 6 hours                  |
| 6       | 24 hours                 |
| 7       | 48 hours                 |
| 8       | 96 hours → `dead`        |

`dead` rows surface in the admin UI with a "Requeue" button. The
operator should clear the backlog before re-enabling an endpoint that
was offline for an extended period — otherwise a flood of stale events
fan out the moment it comes back.

The `webhook_endpoints.consecutive_failures` counter increments per
failed attempt and resets on a successful delivery. The admin UI flags
endpoints with `consecutive_failures > 0` in amber.

---

## 6. Rotating an endpoint secret

1. Coordinate with the receiver operator: agree on a cutover window.
2. From `/admin/webhooks`, edit the endpoint and paste the new secret.
   Hit **Save changes**.
3. Confirm the next delivery succeeds with the new signature.

The system never serves both secrets simultaneously — there is no
overlap window. If you need overlap, register a second endpoint pointing
to the same URL with the new secret and disable the old one after the
receiver is updated.

---

## 7. Producer adoption (current)

| Producer flow                  | Event                          | Path                                                                                  |
|--------------------------------|--------------------------------|---------------------------------------------------------------------------------------|
| `createVehicleTransfer`        | `vehicle.transfer.requested`   | [src/services/inventoryService.ts](../src/services/inventoryService.ts)               |
| `updateVehicleTransferStatus`  | `vehicle.transfer.<status>`    | [src/services/inventoryService.ts](../src/services/inventoryService.ts)               |
| `createSalesOrder`             | `sales_order.created`          | [src/services/salesOrderCrudService.ts](../src/services/salesOrderCrudService.ts)     |
| `moveSalesOrderStage`          | `sales_order.stage_changed`    | [src/services/salesOrderCrudService.ts](../src/services/salesOrderCrudService.ts)     |

To adopt the outbox from another producer service:

```ts
import { emitWebhookEvent } from '@/services/webhookOutboxService';

// After a successful mutation. Always fire-and-forget so a webhook RPC
// failure can never block the underlying business operation.
void emitWebhookEvent(companyId, 'sales_order.created', {
  order_id:   order.id,
  total:      order.total,
  customer:   { id: order.customerId },
});
```

Payload conventions:
- Use snake_case keys (Postgres ergonomic; matches the column names in
  every consumer's logs).
- Include only IDs + minimal denormalised context. Receivers can call
  back through the API for the full record.
- Never include secrets, passwords, or session tokens. The payload is
  persisted in `webhook_outbox.payload` and visible to company admins
  via the deliveries list.
- Event types use dot-separated lowercase domains:
  `<entity>.<action>` (e.g. `vehicle.transfer.arrived`,
  `sales_order.created`, `leave_request.approved`).
