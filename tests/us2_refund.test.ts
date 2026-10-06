import { describe, expect, test } from "vitest";
import { alice, bob, HOUR, makeService, payViaWebhook } from "./helpers";

function buyAndPay(eventId = "evt_musical", buyer = alice) {
  const ctx = makeService();
  const r = ctx.svc.startCheckout(buyer, eventId);
  if (!r.ok) throw new Error(r.error);
  payViaWebhook(ctx.svc, r.session.id);
  const [ticket] = ctx.svc.ticketsFor(buyer.email);
  return { ...ctx, order: r.order, ticket };
}

describe("US-2 Refund my ticket", () => {
  test("test_buyer_can_cancel_ticket_more_than_24_hours_before_event (R2.1)", () => {
    const { svc, ticket, order } = buyAndPay();
    expect(svc.canCancel(ticket.id)).toBe(true);
    const r = svc.cancelTicket(alice.email, ticket.id);
    expect(r.ok).toBe(true);
    expect(svc.ticketsFor(alice.email)[0].status).toBe("void");
    expect(svc.getOrder(order.id)!.status).toBe("refunded");
  });

  test("test_cancelled_ticket_qr_is_voided_before_refund_is_issued (R2.2)", () => {
    const { svc, ticket, order } = buyAndPay();
    svc.cancelTicket(alice.email, ticket.id);
    const refunds = svc.refundsFor(order.id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].ticketStatusWhenRefunded).toBe("void");
    expect(refunds[0].amountCents).toBe(1500);
    expect(refunds[0].destination).toBe("original_payment_method");
  });

  test("test_buyer_cannot_cancel_ticket_within_24_hours_of_event (R2.3)", () => {
    const { svc, ticket, order, advance } = buyAndPay();
    advance(7 * 24 * HOUR - 23 * HOUR); // event is now 23 hours away
    expect(svc.canCancel(ticket.id)).toBe(false);
    const r = svc.cancelTicket(alice.email, ticket.id);
    expect(r.ok).toBe(false);
    expect(svc.ticketsFor(alice.email)[0].status).toBe("valid");
    expect(svc.refundsFor(order.id)).toHaveLength(0);
  });

  test("test_exactly_24_hours_before_event_counts_as_inside_the_window (R2.3)", () => {
    const { svc, ticket, advance } = buyAndPay();
    advance(7 * 24 * HOUR - 24 * HOUR);
    expect(svc.cancelTicket(alice.email, ticket.id).ok).toBe(false);
  });

  test("test_double_clicking_cancel_issues_only_one_refund", () => {
    const { svc, ticket, order } = buyAndPay();
    svc.cancelTicket(alice.email, ticket.id);
    svc.cancelTicket(alice.email, ticket.id);
    expect(svc.refundsFor(order.id)).toHaveLength(1);
  });

  test("test_buyer_cannot_cancel_someone_elses_ticket (S1)", () => {
    const { svc, ticket, order } = buyAndPay();
    const r = svc.cancelTicket(bob.email, ticket.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ticketNotFound");
    expect(svc.refundsFor(order.id)).toHaveLength(0);
  });

  test("test_cancelled_seat_can_be_bought_again", () => {
    const { svc, ticket } = buyAndPay("evt_tiny");
    expect(svc.startCheckout(bob, "evt_tiny").ok).toBe(false);
    svc.cancelTicket(alice.email, ticket.id);
    expect(svc.startCheckout(bob, "evt_tiny").ok).toBe(true);
  });
});
