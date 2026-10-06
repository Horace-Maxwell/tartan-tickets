# Tartan Tickets (class prototype)

CMU student clubs sell event tickets. This prototype builds **US-1 Buy a ticket** and **US-2 Refund my ticket** (buyer self-cancel) from [`docs/requirements.md`](docs/requirements.md).

Today's limits, chosen on purpose:
- **Payments are simulated.** A fake Stripe Checkout page and a signed fake Stripe webhook stand in for the real thing.
- **No sign-in provider.** You type your name and a CMU email.
- **No database.** All data lives in the server's memory and resets on every restart or redeploy.

The questions the spec left open, and the answers we chose, are in [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

## Run it on your laptop
You need Node.js 20 or newer (it includes `npm`).

```bash
npm install
npm run dev
```
Open http://localhost:3000. If port 3000 is busy, Next.js prints the address it used instead.

Other commands:
- `npm test` runs the automated tests (28 tests).
- `npm run build` runs the production build.

## What to click to see story 1 (buy a ticket)
1. On the home page, type a name and an `@andrew.cmu.edu` email, then click **Continue**.
2. Click **Get ticket** on *Fall Musical: Into the Woods*.
3. Click **Buy ticket · $15.00**. You land on the **Simulated Stripe Checkout** page, which shows the club's connected account and the price.
4. Click **Pay $15.00 (simulated)**. You land on **My tickets** with "Payment confirmed" and a QR code.
5. *Late Night Comedy Showcase* is already **Sold out**. *Improv Workshop* has only 2 seats, so you can sell it out yourself.

## What to click to see story 2 (cancel my ticket)
1. On **My tickets**, click **Cancel ticket** under the Fall Musical ticket, then **Yes, cancel and refund**. The QR code is voided and a simulated full refund is recorded.
2. Buy a *Jazz Brunch* ticket. It starts in under 24 hours, so there is no Cancel button. The page says "Cancellation closed".

## Where things live
| Path | What it is |
|---|---|
| `lib/ticketing.ts` | All the business rules: capacity, 15-minute seat holds, webhook checks, cancel window |
| `lib/fakeStripe.ts` | Pretend Stripe: checkout sessions and HMAC-signed webhooks in Stripe's header format |
| `lib/store.ts` | The in-memory data and demo events |
| `lib/buyerState.ts` | Signed cookie that carries a buyer's own orders and tickets between Vercel server copies |
| `app/` | Web pages (Next.js App Router) and `app/api/stripe/webhook` |
| `tests/` | Vitest tests named after `docs/TEST_SPEC.md` |

## Known prototype caveat on Vercel
Vercel can run several copies of the server, and each copy has its own memory. On the first deploy, clicking **Buy ticket** sometimes led to "Not found", because the next page was served by a copy that had never seen the order.

The workaround: the buyer's browser carries a signed (HMAC) copy of *their own* orders and tickets in a cookie, and any server copy that has not seen them restores them. Set `APP_SECRET` in Vercel so every copy uses the same signing key.

Limits of the workaround:
- Seat counts are still per server copy, and data resets on each deploy.
- Someone who saved an old cookie could bring back a ticket they already cancelled, if they reach a server copy that never saw the cancellation.

A real database fixes all of this.

## Security spec audit
Audit of [`docs/SECURITY_SPEC.md`](docs/SECURITY_SPEC.md) against today's build. No code was changed for this audit.

| Requirement | Status | Why (one line) |
|---|---|---|
| **S1** Tenant isolation (other clubs' data returns 404 and is logged) | Partly | Buyers only see their own tickets, and someone else's checkout or ticket returns "not found"; but there are no clubs/organizer roles or attendee lists yet, nothing is logged, and identity is a typed email anyone can fake. |
| **S2** Payment truth from Stripe only (verified signature, matching amount and currency, no replays) | Partly | Signature, amount, currency and replay checks are built and tested, but against our own simulated Stripe, and the "already processed" list is in memory so a replay after a restart would not be caught. |
| **S3** Unforgeable, single-use tickets (random 128-bit token, used-marking in one transaction) | Partly | Tickets get a random 128-bit token, but door scanning (US-3) is not built and there is no database transaction, so "single use" is not enforced yet. |
| **S4** Controlled organizer powers (admin approval plus audit log) | Not at all | There are no organizer or admin features, approval steps, or audit log in this build. |
| Never store card numbers | Fully | The app never asks for or receives card data; payment is simulated, and a real build would use Stripe Checkout. |
| Deny everything except public listings unless signed in via Andrew SSO | Not at all | There is no Andrew SSO; a typed name and email in a cookie stands in, and anyone can claim any CMU email. |
| Refunds only to the original payment method | Partly | Simulated refunds always target the original payment method and accept no destination from the user, but no real Stripe refund is made. |
