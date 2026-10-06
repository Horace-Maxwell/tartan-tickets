import { TicketingService } from "@/lib/ticketing";
import { buildCompletedEvent, signPayload } from "@/lib/fakeStripe";

export const SECRET = "whsec_test_secret";
export const HOUR = 60 * 60 * 1000;

export function makeService(startAt = new Date("2026-10-01T12:00:00-04:00")) {
  let now = startAt.getTime();
  const svc = new TicketingService({ webhookSecret: SECRET, now: () => new Date(now) });
  svc.addClub({ id: "club_scotch", name: "Scotch'n'Soda", stripeAccountId: "acct_scotch123" });
  svc.addClub({ id: "club_kgb", name: "KGB", stripeAccountId: "acct_kgb456" });
  svc.addEvent({
    id: "evt_musical",
    clubId: "club_scotch",
    title: "Fall Musical",
    startsAt: new Date(now + 7 * 24 * HOUR),
    venue: "Rangos Ballroom",
    priceCents: 1500,
    capacity: 3,
  });
  svc.addEvent({
    id: "evt_tiny",
    clubId: "club_kgb",
    title: "Tiny Show",
    startsAt: new Date(now + 3 * 24 * HOUR),
    venue: "UC McConomy",
    priceCents: 500,
    capacity: 1,
  });
  return {
    svc,
    advance(ms: number) {
      now += ms;
    },
  };
}

export const alice = { name: "Alice Tartan", email: "alice@andrew.cmu.edu" };
export const bob = { name: "Bob Scotty", email: "bob@andrew.cmu.edu" };

/** Pretend to be Stripe: send a correctly signed checkout.session.completed webhook. */
export function payViaWebhook(
  svc: TicketingService,
  sessionId: string,
  overrides: { amountTotal?: number; currency?: string; eventId?: string; secret?: string } = {},
) {
  const session = svc.getCheckoutSession(sessionId)!;
  const event = buildCompletedEvent(session, overrides);
  const body = JSON.stringify(event);
  const sig = signPayload(body, overrides.secret ?? SECRET, Math.floor(Date.now() / 1000));
  return { result: svc.handleStripeWebhook(body, sig), body, sig };
}
