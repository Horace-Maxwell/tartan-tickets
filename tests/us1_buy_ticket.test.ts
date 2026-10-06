import { describe, expect, test } from "vitest";
import { alice, bob, HOUR, makeService, payViaWebhook } from "./helpers";

function startOk(svc: ReturnType<typeof makeService>["svc"], buyer: typeof alice, eventId: string) {
  const r = svc.startCheckout(buyer, eventId);
  if (!r.ok) throw new Error(`expected checkout to start, got: ${r.error}`);
  return r;
}

describe("US-1 Buy a ticket", () => {
  test("test_checkout_session_uses_the_clubs_connected_account_and_listed_price (R1.1)", () => {
    const { svc } = makeService();
    const r = startOk(svc, alice, "evt_musical");
    expect(r.session.connectedAccountId).toBe("acct_scotch123");
    expect(r.session.amountTotal).toBe(1500);
    expect(r.session.currency).toBe("usd");
    expect(r.order.status).toBe("pending");
  });

  test("test_verified_webhook_marks_order_paid_and_issues_one_ticket (R1.2)", () => {
    const { svc } = makeService();
    const r = startOk(svc, alice, "evt_musical");
    const { result } = payViaWebhook(svc, r.session.id);
    expect(result.status).toBe(200);
    expect(svc.getOrder(r.order.id)!.status).toBe("paid");
    const tickets = svc.ticketsFor(alice.email);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].orderId).toBe(r.order.id);
  });

  test("test_checkout_is_refused_when_event_is_sold_out (R1.3)", () => {
    const { svc } = makeService();
    const first = startOk(svc, alice, "evt_tiny");
    payViaWebhook(svc, first.session.id);
    const second = svc.startCheckout(bob, "evt_tiny");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("Sold out");
    expect(svc.listEvents().find((e) => e.id === "evt_tiny")!.soldOut).toBe(true);
  });

  test("test_two_buyers_racing_for_the_last_seat_only_one_succeeds (R1.3)", async () => {
    const { svc } = makeService();
    const results = await Promise.all([
      Promise.resolve().then(() => svc.startCheckout(alice, "evt_tiny")),
      Promise.resolve().then(() => svc.startCheckout(bob, "evt_tiny")),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  test("test_unpaid_order_has_no_ticket (R1.4)", () => {
    const { svc } = makeService();
    const r = startOk(svc, alice, "evt_musical");
    expect(svc.getOrder(r.order.id)!.status).toBe("pending");
    expect(svc.ticketsFor(alice.email)).toHaveLength(0);
  });

  test("test_ticket_token_is_random_128_bit_and_unique (S3, R1.2)", () => {
    const { svc } = makeService();
    const a = startOk(svc, alice, "evt_musical");
    const b = startOk(svc, bob, "evt_musical");
    payViaWebhook(svc, a.session.id);
    payViaWebhook(svc, b.session.id);
    const [ta] = svc.ticketsFor(alice.email);
    const [tb] = svc.ticketsFor(bob.email);
    expect(ta.token).toMatch(/^[0-9a-f]{32}$/);
    expect(tb.token).toMatch(/^[0-9a-f]{32}$/);
    expect(ta.token).not.toBe(tb.token);
    expect(ta.token).not.toContain(ta.id);
  });

  test("test_seat_held_by_unpaid_checkout_is_released_after_15_minutes (decision Q3)", () => {
    const { svc, advance } = makeService();
    startOk(svc, alice, "evt_tiny");
    expect(svc.startCheckout(bob, "evt_tiny").ok).toBe(false);
    advance(16 * 60 * 1000);
    expect(svc.startCheckout(bob, "evt_tiny").ok).toBe(true);
  });

  test("test_late_payment_after_seat_was_resold_issues_no_ticket (decision Q4)", () => {
    const { svc, advance } = makeService();
    const slow = startOk(svc, alice, "evt_tiny");
    advance(16 * 60 * 1000);
    const fast = startOk(svc, bob, "evt_tiny");
    payViaWebhook(svc, fast.session.id);
    const { result } = payViaWebhook(svc, slow.session.id);
    expect(result.status).toBe(200);
    expect(svc.getOrder(slow.order.id)!.status).toBe("needs_refund");
    expect(svc.ticketsFor(alice.email)).toHaveLength(0);
  });
});

describe("US-1 input checks (what a user could type wrong)", () => {
  test("test_blank_name_is_refused", () => {
    const { svc } = makeService();
    const r = svc.startCheckout({ name: "   ", email: "alice@andrew.cmu.edu" }, "evt_musical");
    expect(r.ok).toBe(false);
  });

  test("test_non_cmu_email_is_refused", () => {
    const { svc } = makeService();
    for (const email of ["alice@gmail.com", "alice@cmu.edu.evil.com", "not-an-email", ""]) {
      expect(svc.startCheckout({ name: "Alice", email }, "evt_musical").ok).toBe(false);
    }
  });

  test("test_unknown_event_is_refused", () => {
    const { svc } = makeService();
    const r = svc.startCheckout(alice, "evt_does_not_exist");
    expect(r.ok).toBe(false);
  });

  test("test_buyer_cannot_hold_two_tickets_to_the_same_event (decision Q2)", () => {
    const { svc } = makeService();
    const r = startOk(svc, alice, "evt_musical");
    payViaWebhook(svc, r.session.id);
    const again = svc.startCheckout({ ...alice, email: "ALICE@andrew.cmu.edu" }, "evt_musical");
    expect(again.ok).toBe(false);
  });

  test("test_checkout_is_refused_for_an_event_that_already_started", () => {
    const { svc, advance } = makeService();
    advance(8 * 24 * HOUR);
    expect(svc.startCheckout(alice, "evt_musical").ok).toBe(false);
  });
});
