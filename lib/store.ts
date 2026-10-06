/**
 * One shared, in-memory TicketingService for the running server, filled with demo data.
 * Everything here disappears when the server restarts or Vercel starts a fresh copy.
 */
import { randomBytes } from "node:crypto";
import { TicketingService } from "./ticketing";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Round to the next whole hour so seeded start times look like real event times. */
function at(msFromNow: number) {
  const d = new Date(Date.now() + msFromNow);
  d.setMinutes(0, 0, 0);
  return d;
}

function seed(svc: TicketingService) {
  svc.addClub({ id: "club_theatre", name: "Tartan Theatre Club", stripeAccountId: "acct_1TheatreDemo" });
  svc.addClub({ id: "club_comedy", name: "Carnegie Comedy Collective", stripeAccountId: "acct_1ComedyDemo" });
  svc.addClub({ id: "club_jazz", name: "Mellon Jazz Ensemble", stripeAccountId: "acct_1JazzDemo" });

  svc.addEvent({
    id: "fall-musical",
    clubId: "club_theatre",
    title: "Fall Musical: Into the Woods",
    startsAt: at(10 * DAY + 4 * HOUR),
    venue: "Purnell Center, Philip Chosky Theater",
    priceCents: 1500,
    capacity: 120,
  });
  svc.addEvent({
    id: "improv-workshop",
    clubId: "club_comedy",
    title: "Improv Workshop (small group)",
    startsAt: at(5 * DAY + 2 * HOUR),
    venue: "Cohon Center, Room 2100",
    priceCents: 500,
    capacity: 2,
  });
  svc.addEvent({
    id: "comedy-night",
    clubId: "club_comedy",
    title: "Late Night Comedy Showcase",
    startsAt: at(3 * DAY + 8 * HOUR),
    venue: "McConomy Auditorium",
    priceCents: 800,
    capacity: 5,
  });
  svc.addEvent({
    id: "jazz-brunch",
    clubId: "club_jazz",
    title: "Jazz Brunch",
    startsAt: at(18 * HOUR),
    venue: "Rangos Ballroom",
    priceCents: 1200,
    capacity: 30,
  });

  // Make the comedy showcase sold out so "Sold out" is visible right away.
  for (let i = 1; i <= 5; i++) {
    const r = svc.startCheckout({ name: `Demo Buyer ${i}`, email: `demo${i}@andrew.cmu.edu` }, "comedy-night");
    if (r.ok) svc.simulateStripePayment(r.session.id);
  }
}

const globalForStore = globalThis as unknown as { tartanTickets?: TicketingService };

export function getService(): TicketingService {
  if (!globalForStore.tartanTickets) {
    const svc = new TicketingService({
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || `whsec_${randomBytes(24).toString("hex")}`,
    });
    seed(svc);
    globalForStore.tartanTickets = svc;
  }
  return globalForStore.tartanTickets;
}
