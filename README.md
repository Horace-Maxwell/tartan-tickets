# Tartan Tickets (class prototype)

CMU student clubs sell event tickets. This prototype builds **US-1 Buy a ticket**, **US-2 Refund my ticket** (buyer self-cancel) and **US-3 Check in attendees** (HW3) from [`docs/requirements.md`](docs/requirements.md).

Today's limits, chosen on purpose:
- **Payments are simulated.** A fake Stripe Checkout page and a signed fake Stripe webhook stand in for the real thing.
- **No sign-in provider.** You type your name and a CMU email.
- **No database.** All data lives in the server's memory and resets on every restart or redeploy.

## Non-goals for HW3
- **Real payments** (Stripe). The "Pay (simulated)" button stands in.
- **Real authentication** (Andrew SSO). A typed name and email stand in, and anyone can type any email. Organizer "approval" is a fixed demo roster in `lib/store.ts`.
- **A database.** Data is in memory and **resets on every deploy**.
- **A camera QR scanner.** Organizers paste or type the ticket code printed under the QR.

The questions the spec left open, and the answers we chose, are in [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

## Run it on your laptop
You need Node.js 20 or newer (it includes `npm`).

```bash
npm install
npm run dev
```
Open http://localhost:3000. If port 3000 is busy, Next.js prints the address it used instead.

Other commands:
- `npm test` runs the automated tests.
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

## What to click to see story 3 (check in attendees)
1. Buy a *Fall Musical* ticket (story 1) and copy the **Ticket code** under the QR. It is a signed pass (`lib/ticketPass.ts`), so the check-in page can verify it even when Vercel runs it on a server copy that never saw the purchase.
2. Click **Sign out**, open **Check-in**, and sign in as `organizer.theatre@andrew.cmu.edu` (any name). Other demo organizers: `organizer.comedy@andrew.cmu.edu`, `organizer.jazz@andrew.cmu.edu`.
3. Click **Check in** next to *Fall Musical*, paste the code, and click **Check in**: it shows **Admit: <buyer name>**.
4. Paste the same code again: **Reject: Ticket already used**. A cancelled ticket shows **Reject: Ticket voided**, and a code from another event shows **Reject: Ticket is for a different event**.
5. The attendee list below shows each ticket's status; **Export attendee list (CSV)** downloads it. Another club's event (for example `/checkin?event=comedy-night`) shows "Event not found".

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
| **S1** Tenant isolation (other clubs' data returns 404 and is logged) | Partly (404 + logging now done) | **Now satisfied:** an organizer asking for another club's attendee list, CSV export or check-in, or a buyer cancelling someone else's ticket, gets a real 404 and a `cross_tenant_denied` entry (actor, action, resource, time) is written to the server log (tests: `tests/s1_cross_club_logging.test.ts`). **Still missing:** identity is a typed email anyone can fake (needs Andrew SSO), organizer approval is a hard-coded roster (needs admin approval), and the log lives in memory plus Vercel's short-lived runtime logs (needs durable, tamper-evident log storage and someone who reviews it). |
| **S2** Payment truth from Stripe only (verified signature, matching amount and currency, no replays) | Partly | Signature, amount, currency and replay checks are built and tested, but against our own simulated Stripe, and the "already processed" list is in memory so a replay after a restart would not be caught. |
| **S3** Unforgeable, single-use tickets (random 128-bit token, used-marking in one transaction) | Partly | Tickets get a random 128-bit token and door check-in (US-3) admits a ticket once and rejects the second scan, but there is no database transaction, and two Vercel server copies keep separate memory, so a ticket could in theory be admitted once on each copy, and a saved copy of a pass from before a cancellation could be admitted by a copy that never saw the cancellation. |
| **S4** Controlled organizer powers (admin approval plus audit log) | Not at all | There are no organizer or admin features, approval steps, or audit log in this build. |
| Never store card numbers | Fully | The app never asks for or receives card data; payment is simulated, and a real build would use Stripe Checkout. |
| Deny everything except public listings unless signed in via Andrew SSO | Not at all | There is no Andrew SSO; a typed name and email in a cookie stands in, and anyone can claim any CMU email. |
| Refunds only to the original payment method | Partly | Simulated refunds always target the original payment method and accept no destination from the user, but no real Stripe refund is made. |
