/**
 * The rules of Tartan Tickets, kept apart from the web pages so they can be tested directly.
 * All data lives in memory (no database today), so it resets when the server restarts.
 */
import { randomBytes } from "node:crypto";
import {
  type CheckoutSession,
  type StripeWebhookEvent,
  buildCompletedEvent,
  createCheckoutSession,
  signPayload,
  verifySignature,
} from "./fakeStripe";

export const HOLD_MINUTES = 15;
export const CANCEL_CUTOFF_HOURS = 24;
export const MAX_NAME_LENGTH = 80;
const CMU_EMAIL = /^[a-z0-9._%+-]+@(andrew\.)?cmu\.edu$/;

/**
 * Every message a user can see. Pages receive only the short key (e.g. ?error=soldOut) and look the text up here,
 * so nobody can craft a link that makes our site display text of their choosing.
 */
export const MESSAGES = {
  nameBlank: "Please enter your name.",
  nameTooLong: `Name must be ${MAX_NAME_LENGTH} characters or fewer.`,
  nameBadChars: "Name contains characters that are not allowed.",
  emailNotCmu: "Please use your CMU email (ending in @andrew.cmu.edu or @cmu.edu).",
  eventNotFound: "Event not found.",
  salesClosed: "Ticket sales for this event have closed.",
  alreadyHasTicket: "You already have a ticket for this event.",
  soldOut: "Sold out",
  signInFirst: "Please sign in with your name and CMU email first.",
  paymentFailed: "Payment could not be confirmed. No ticket was issued.",
  ticketNotFound: "Ticket not found.",
  tooLateToCancel: `Tickets can only be cancelled more than ${CANCEL_CUTOFF_HOURS} hours before the event.`,
  alreadyCancelled: "This ticket was already cancelled.",
  ticketUsed: "This ticket has already been used.",
  notOrganizer: "Only approved organizers can check in attendees.",
} as const;
export type MessageKey = keyof typeof MESSAGES;
type Failure = { ok: false; code: MessageKey; error: string };
const fail = (code: MessageKey): Failure => ({ ok: false, code, error: MESSAGES[code] });

export type Buyer = { name: string; email: string };
export type Club = { id: string; name: string; stripeAccountId: string };
export type TicketEvent = {
  id: string;
  clubId: string;
  title: string;
  startsAt: Date;
  venue: string;
  priceCents: number;
  capacity: number;
};
export type OrderStatus = "pending" | "paid" | "needs_refund" | "refunded";
export type Order = {
  id: string;
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  sessionId: string;
  createdAt: Date;
  holdExpiresAt: Date;
};
export type Ticket = {
  id: string;
  orderId: string;
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  token: string;
  status: "valid" | "used" | "void";
  issuedAt: Date;
};
/** A simulated Stripe refund. Always to the original payment method; one per ticket (idempotency key). */
export type Refund = {
  id: string;
  orderId: string;
  ticketId: string;
  amountCents: number;
  destination: "original_payment_method";
  idempotencyKey: string;
  ticketStatusWhenRefunded: Ticket["status"];
  createdAt: Date;
};
/** Everything one buyer owns, in a JSON-safe form (dates as ISO strings). See lib/buyerState.ts. */
type Jsonified<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] };
export type BuyerSnapshot = {
  email: string;
  orders: Jsonified<Order>[];
  sessions: Jsonified<CheckoutSession>[];
  tickets: Jsonified<Ticket>[];
  refunds: Jsonified<Refund>[];
};
const ORDER_RANK: Record<OrderStatus, number> = { pending: 0, paid: 1, needs_refund: 1, refunded: 2 };
const TICKET_RANK: Record<Ticket["status"], number> = { valid: 0, used: 1, void: 2 };
const MAX_SNAPSHOT_ORDERS = 8;

export type Organizer = { email: string; clubId: string };
export type ScanResult =
  | { ok: true; verdict: "admit"; buyerName: string }
  | { ok: true; verdict: "reject"; reason: string }
  | Failure;
/** S1: one record per denied attempt to reach another tenant's data. */
export type SecurityLogEntry = {
  at: string;
  kind: "cross_tenant_denied";
  actor: string;
  action: "attendee_list" | "scan_ticket" | "cancel_ticket";
  resource: string;
};
export type Attendee = { name: string; email: string; status: Ticket["status"] };

/** Stops a name like "=HYPERLINK(...)" from running as a formula when the CSV is opened in a spreadsheet. */
function csvCell(value: string): string {
  let v = value;
  let quote = /[",\r\n]/.test(v);
  if (/^[=+\-@\t\r]/.test(v)) {
    v = `'${v}`;
    quote = true;
  }
  return quote ? `"${v.replace(/"/g, '""')}"` : v;
}

export type EventView = TicketEvent & { clubName: string; seatsLeft: number; soldOut: boolean; salesClosed: boolean };

export type CheckoutResult =
  | { ok: true; order: Order; session: CheckoutSession }
  | Failure;

export type WebhookResult = { status: number; message: string };

const id = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

export function validateBuyer(input: { name?: unknown; email?: unknown }): { ok: true; buyer: Buyer } | Failure {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!name) return fail("nameBlank");
  if (name.length > MAX_NAME_LENGTH) return fail("nameTooLong");
  if (/[<>]/.test(name)) return fail("nameBadChars");
  if (!CMU_EMAIL.test(email)) return fail("emailNotCmu");
  return { ok: true, buyer: { name, email } };
}

export class TicketingService {
  private clubs = new Map<string, Club>();
  private events = new Map<string, TicketEvent>();
  private orders = new Map<string, Order>();
  private tickets = new Map<string, Ticket>();
  private sessions = new Map<string, CheckoutSession>();
  private processedWebhookIds = new Set<string>();
  private refunds = new Map<string, Refund>(); // keyed by idempotency key
  private organizers = new Map<string, Organizer>(); // keyed by email; stands in for admin approval
  private securityEntries: SecurityLogEntry[] = [];
  private readonly webhookSecret: string;
  private readonly now: () => Date;

  constructor(opts: { webhookSecret: string; now?: () => Date }) {
    this.webhookSecret = opts.webhookSecret;
    this.now = opts.now ?? (() => new Date());
  }

  addClub(club: Club) {
    this.clubs.set(club.id, club);
  }

  /** Today's stand-in for "an admin approved this CMU user for one club". */
  addOrganizer(org: Organizer) {
    if (!this.clubs.has(org.clubId)) throw new Error(`Unknown club ${org.clubId}`);
    const email = org.email.trim().toLowerCase();
    this.organizers.set(email, { email, clubId: org.clubId });
  }

  organizerFor(email: string): Organizer | undefined {
    return this.organizers.get(email.trim().toLowerCase());
  }

  /** Events of the organizer's own club only. */
  eventsForOrganizer(email: string): EventView[] {
    const org = this.organizerFor(email);
    return org ? this.listEvents().filter((e) => e.clubId === org.clubId) : [];
  }

  /** S1: record a denied cross-tenant attempt, in memory and in the server log (Vercel keeps the latter). */
  private logDenied(actor: string, action: SecurityLogEntry["action"], resource: string) {
    const entry: SecurityLogEntry = {
      at: this.now().toISOString(),
      kind: "cross_tenant_denied",
      actor: actor.trim().toLowerCase(),
      action,
      resource,
    };
    this.securityEntries.push(entry);
    console.warn(JSON.stringify({ security: entry }));
  }

  securityLog(): SecurityLogEntry[] {
    return [...this.securityEntries];
  }

  /** S1: an event outside the organizer's club looks exactly like a missing one, and the attempt is logged. */
  private ownEvent(email: string, eventId: string, action: SecurityLogEntry["action"]): TicketEvent | undefined {
    const org = this.organizerFor(email);
    const ev = this.events.get(eventId);
    if (org && ev && ev.clubId === org.clubId) return ev;
    if (ev) this.logDenied(email, action, `event:${ev.id}`);
    return undefined;
  }

  /** R3.1, R3.2, S3: admit a valid, unused ticket for this event once; reject everything else with a reason. */
  scanTicket(organizerEmail: string, eventId: string, token: unknown): ScanResult {
    const ev = this.ownEvent(organizerEmail, eventId, "scan_ticket");
    if (!ev) return fail("eventNotFound");
    const code = typeof token === "string" ? token.trim().toLowerCase() : "";
    // Look up by exact token only; a ticket code is 32 hex characters, so anything else cannot match.
    const t = /^[0-9a-f]{32}$/.test(code) ? [...this.tickets.values()].find((x) => x.token === code) : undefined;
    if (!t) return { ok: true, verdict: "reject", reason: "Unknown ticket" };
    if (t.eventId !== ev.id) return { ok: true, verdict: "reject", reason: "Ticket is for a different event" };
    if (t.status === "void") return { ok: true, verdict: "reject", reason: "Ticket voided" };
    if (t.status === "used") return { ok: true, verdict: "reject", reason: "Ticket already used" };
    // Check and mark in one synchronous step, so two scans cannot both see "valid" (single-use, S3).
    t.status = "used";
    return { ok: true, verdict: "admit", buyerName: t.buyerName };
  }

  /** R3.3: attendee list for the organizer's own club's event only. */
  attendeeList(organizerEmail: string, eventId: string): { ok: true; event: EventView; attendees: Attendee[] } | Failure {
    const ev = this.ownEvent(organizerEmail, eventId, "attendee_list");
    if (!ev) return fail("eventNotFound");
    const attendees = [...this.tickets.values()]
      .filter((t) => t.eventId === ev.id)
      .sort((a, b) => a.buyerName.localeCompare(b.buyerName))
      .map((t) => ({ name: t.buyerName, email: t.buyerEmail, status: t.status }));
    return { ok: true, event: this.view(ev), attendees };
  }

  /** R3.3 export. Returns null (shown as 404) for anyone who is not this club's organizer. */
  attendeeCsv(organizerEmail: string, eventId: string): string | null {
    const r = this.attendeeList(organizerEmail, eventId);
    if (!r.ok) return null;
    const rows = [["name", "email", "status"], ...r.attendees.map((a) => [a.name, a.email, a.status])];
    return rows.map((row) => row.map(csvCell).join(",") + "\r\n").join("");
  }

  addEvent(event: TicketEvent) {
    if (!this.clubs.has(event.clubId)) throw new Error(`Unknown club ${event.clubId}`);
    if (!Number.isInteger(event.priceCents) || event.priceCents <= 0) throw new Error("Price must be a positive whole number of cents");
    if (!Number.isInteger(event.capacity) || event.capacity <= 0) throw new Error("Capacity must be a positive whole number");
    this.events.set(event.id, event);
  }

  /** Seats taken = issued tickets that are not void + unpaid checkouts still inside their 15-minute hold. */
  private seatsTaken(eventId: string, excludeOrderId?: string): number {
    const now = this.now().getTime();
    let taken = 0;
    for (const t of this.tickets.values()) if (t.eventId === eventId && t.status !== "void") taken++;
    for (const o of this.orders.values()) {
      if (o.eventId === eventId && o.status === "pending" && o.id !== excludeOrderId && o.holdExpiresAt.getTime() > now) taken++;
    }
    return taken;
  }

  private view(e: TicketEvent): EventView {
    const seatsLeft = Math.max(0, e.capacity - this.seatsTaken(e.id));
    return {
      ...e,
      clubName: this.clubs.get(e.clubId)?.name ?? "Unknown club",
      seatsLeft,
      soldOut: seatsLeft === 0,
      salesClosed: e.startsAt.getTime() <= this.now().getTime(),
    };
  }

  listEvents(): EventView[] {
    return [...this.events.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).map((e) => this.view(e));
  }

  getEvent(eventId: string): EventView | undefined {
    const e = this.events.get(eventId);
    return e && this.view(e);
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  getCheckoutSession(sessionId: string): CheckoutSession | undefined {
    return this.sessions.get(sessionId);
  }

  ticketsFor(email: string): (Ticket & { event: EventView })[] {
    const e = email.trim().toLowerCase();
    return [...this.tickets.values()]
      .filter((t) => t.buyerEmail === e)
      .map((t) => ({ ...t, event: this.getEvent(t.eventId)! }));
  }

  /** R1.1, R1.3: start a (simulated) Stripe Checkout on the club's connected account at the listed price. */
  startCheckout(input: { name?: unknown; email?: unknown }, eventId: string): CheckoutResult {
    const v = validateBuyer(input);
    if (!v.ok) return v;
    const buyer = v.buyer;
    const event = this.events.get(eventId);
    if (!event) return fail("eventNotFound");
    const club = this.clubs.get(event.clubId)!;
    const now = this.now();
    if (event.startsAt.getTime() <= now.getTime()) return fail("salesClosed");

    const hasTicket = [...this.tickets.values()].some(
      (t) => t.eventId === eventId && t.buyerEmail === buyer.email && t.status !== "void",
    );
    if (hasTicket) return fail("alreadyHasTicket");

    // Same buyer clicking Buy again while their hold is still active: resume that checkout instead of taking a second seat.
    const existing = [...this.orders.values()].find(
      (o) => o.eventId === eventId && o.buyerEmail === buyer.email && o.status === "pending" && o.holdExpiresAt > now,
    );
    if (existing) return { ok: true, order: existing, session: this.sessions.get(existing.sessionId)! };

    if (this.seatsTaken(eventId) >= event.capacity) return fail("soldOut");

    const orderId = id("ord");
    const session = createCheckoutSession(
      { connectedAccountId: club.stripeAccountId, amountTotal: event.priceCents, currency: "usd", orderId, eventId },
      now,
    );
    const order: Order = {
      id: orderId,
      eventId,
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      amountCents: event.priceCents,
      currency: "usd",
      status: "pending",
      sessionId: session.id,
      createdAt: now,
      holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60 * 1000),
    };
    this.sessions.set(session.id, session);
    this.orders.set(orderId, order);
    return { ok: true, order, session };
  }

  /** R1.2, R1.4, S2: only a correctly signed, matching, first-time webhook marks an order paid and issues a ticket. */
  handleStripeWebhook(rawBody: string, signatureHeader: string): WebhookResult {
    if (!signatureHeader || !verifySignature(rawBody, signatureHeader, this.webhookSecret)) {
      return { status: 400, message: "Invalid signature" };
    }
    let event: StripeWebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { status: 400, message: "Malformed body" };
    }
    if (this.processedWebhookIds.has(event.id)) return { status: 200, message: "Event already processed" };
    if (event.type !== "checkout.session.completed") {
      this.processedWebhookIds.add(event.id);
      return { status: 200, message: "Ignored event type" };
    }

    const obj = event.data?.object;
    const session = obj && this.sessions.get(obj.id);
    const order = session && this.orders.get(session.orderId);
    if (!session || !order || obj.metadata?.order_id !== order.id) return { status: 400, message: "Unknown checkout session" };
    if (event.account !== session.connectedAccountId) return { status: 400, message: "Wrong connected account" };
    if (obj.amount_total !== order.amountCents || obj.currency !== order.currency) {
      return { status: 400, message: "Amount or currency does not match the order" };
    }
    if (obj.payment_status !== "paid") return { status: 400, message: "Session not paid" };

    this.processedWebhookIds.add(event.id);
    if (order.status !== "pending") return { status: 200, message: `Order already ${order.status}` };

    const ev = this.events.get(order.eventId)!;
    const buyerAlreadyHasTicket = [...this.tickets.values()].some(
      (t) => t.eventId === ev.id && t.buyerEmail === order.buyerEmail && t.status !== "void",
    );
    if (buyerAlreadyHasTicket || this.seatsTaken(ev.id, order.id) >= ev.capacity) {
      // Payment arrived but there is no seat for it (hold expired and the seat was resold). Never issue a ticket we cannot honor.
      order.status = "needs_refund";
      return { status: 200, message: "No seat available; order flagged for refund" };
    }

    order.status = "paid";
    const ticket: Ticket = {
      id: id("tkt"),
      orderId: order.id,
      eventId: ev.id,
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      token: randomBytes(16).toString("hex"), // S3: random 128-bit token, no structure
      status: "valid",
      issuedAt: this.now(),
    };
    this.tickets.set(ticket.id, ticket);
    return { status: 200, message: "Order paid; ticket issued" };
  }

  refundsFor(orderId: string): Refund[] {
    return [...this.refunds.values()].filter((r) => r.orderId === orderId);
  }

  /** R2.1 / R2.3: cancelling is allowed only while the event is more than 24 hours away. */
  canCancel(ticketId: string): boolean {
    const t = this.tickets.get(ticketId);
    const ev = t && this.events.get(t.eventId);
    if (!t || !ev || t.status !== "valid") return false;
    return ev.startsAt.getTime() - this.now().getTime() > CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;
  }

  /** R2.1-R2.3: the buyer cancels their own ticket; void the QR first, then refund to the original payment method. */
  cancelTicket(email: string, ticketId: string): { ok: true; refund: Refund } | Failure {
    const t = this.tickets.get(ticketId);
    // Someone else's ticket looks exactly like a missing one (S1: do not reveal it exists).
    if (!t) return fail("ticketNotFound");
    if (t.buyerEmail !== email.trim().toLowerCase()) {
      this.logDenied(email, "cancel_ticket", `ticket:${t.id}`);
      return fail("ticketNotFound");
    }
    if (t.status === "void") return fail("alreadyCancelled");
    if (t.status === "used") return fail("ticketUsed");
    if (!this.canCancel(ticketId)) return fail("tooLateToCancel");

    t.status = "void"; // R2.2: void before refunding, so the QR stops working even if the refund call fails.
    const order = this.orders.get(t.orderId)!;
    const idempotencyKey = `refund-${t.id}`;
    let refund = this.refunds.get(idempotencyKey);
    if (!refund) {
      refund = {
        id: id("re"),
        orderId: order.id,
        ticketId: t.id,
        amountCents: order.amountCents,
        destination: "original_payment_method",
        idempotencyKey,
        ticketStatusWhenRefunded: t.status,
        createdAt: this.now(),
      };
      this.refunds.set(idempotencyKey, refund);
    }
    order.status = "refunded";
    return { ok: true, refund };
  }

  snapshotFor(email: string): BuyerSnapshot {
    const e = email.trim().toLowerCase();
    const orders = [...this.orders.values()]
      .filter((o) => o.buyerEmail === e)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, MAX_SNAPSHOT_ORDERS);
    const orderIds = new Set(orders.map((o) => o.id));
    const json = <T extends object>(x: T) => JSON.parse(JSON.stringify(x));
    return {
      email: e,
      orders: orders.map(json),
      sessions: orders.map((o) => json(this.sessions.get(o.sessionId)!)),
      tickets: [...this.tickets.values()].filter((t) => orderIds.has(t.orderId)).map(json),
      refunds: [...this.refunds.values()].filter((r) => orderIds.has(r.orderId)).map(json),
    };
  }

  /** Just one ticket with its order and checkout session, for the signed ticket pass (lib/ticketPass.ts). */
  ticketSnapshot(ticketId: string): BuyerSnapshot | undefined {
    const t = this.tickets.get(ticketId);
    const order = t && this.orders.get(t.orderId);
    if (!t || !order) return undefined;
    const json = <T extends object>(x: T) => JSON.parse(JSON.stringify(x));
    return {
      email: t.buyerEmail,
      orders: [json(order)],
      sessions: [json(this.sessions.get(order.sessionId)!)],
      tickets: [json(t)],
      refunds: this.refundsFor(order.id).map(json),
    };
  }

  /** Merge a buyer's signed snapshot into this server copy. Never moves a status backwards (e.g. never un-voids a ticket). */
  restore(snap: BuyerSnapshot) {
    const date = (s: string) => new Date(s);
    for (const s of snap.sessions) {
      if (this.events.has(s.eventId) && !this.sessions.has(s.id)) this.sessions.set(s.id, { ...s, createdAt: date(s.createdAt) });
    }
    for (const o of snap.orders) {
      if (o.buyerEmail !== snap.email || !this.events.has(o.eventId)) continue;
      const existing = this.orders.get(o.id);
      if (!existing) {
        this.orders.set(o.id, { ...o, createdAt: date(o.createdAt), holdExpiresAt: date(o.holdExpiresAt) });
      } else if (ORDER_RANK[o.status] > ORDER_RANK[existing.status]) {
        existing.status = o.status;
      }
    }
    for (const t of snap.tickets) {
      if (t.buyerEmail !== snap.email || !this.orders.has(t.orderId)) continue;
      const existing = this.tickets.get(t.id);
      if (!existing) this.tickets.set(t.id, { ...t, issuedAt: date(t.issuedAt) });
      else if (TICKET_RANK[t.status] > TICKET_RANK[existing.status]) existing.status = t.status;
    }
    for (const r of snap.refunds) {
      if (this.orders.has(r.orderId) && !this.refunds.has(r.idempotencyKey)) {
        this.refunds.set(r.idempotencyKey, { ...r, createdAt: date(r.createdAt) });
      }
    }
  }

  /** Simulation only: plays Stripe's role after the buyer clicks "Pay" on the fake checkout page. */
  simulateStripePayment(sessionId: string): WebhookResult {
    const session = this.sessions.get(sessionId);
    if (!session) return { status: 404, message: "Checkout session not found" };
    const body = JSON.stringify(buildCompletedEvent(session));
    return this.handleStripeWebhook(body, signPayload(body, this.webhookSecret, Math.floor(Date.now() / 1000)));
  }
}
