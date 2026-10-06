import { describe, expect, test } from "vitest";
import { buildCompletedEvent, signPayload } from "@/lib/fakeStripe";
import { alice, makeService, payViaWebhook, SECRET } from "./helpers";

describe("S2 Payment truth comes from Stripe only", () => {
  test("test_order_is_not_marked_paid_when_webhook_signature_is_invalid", () => {
    const { svc } = makeService();
    const r = svc.startCheckout(alice, "evt_musical");
    if (!r.ok) throw new Error(r.error);
    const { result } = payViaWebhook(svc, r.session.id, { secret: "whsec_attacker_guess" });
    expect(result.status).toBe(400);
    expect(svc.getOrder(r.order.id)!.status).toBe("pending");
    expect(svc.ticketsFor(alice.email)).toHaveLength(0);
  });

  test("test_tampered_webhook_body_is_rejected", () => {
    const { svc } = makeService();
    const r = svc.startCheckout(alice, "evt_musical");
    if (!r.ok) throw new Error(r.error);
    const body = JSON.stringify(buildCompletedEvent(r.session));
    const sig = signPayload(body, SECRET, Math.floor(Date.now() / 1000));
    expect(svc.handleStripeWebhook(body.replace("1500", "1"), sig).status).toBe(400);
    expect(svc.handleStripeWebhook(body, "").status).toBe(400);
    expect(svc.getOrder(r.order.id)!.status).toBe("pending");
  });

  test("test_webhook_with_wrong_amount_does_not_mark_order_paid", () => {
    const { svc } = makeService();
    const r = svc.startCheckout(alice, "evt_musical");
    if (!r.ok) throw new Error(r.error);
    const { result } = payViaWebhook(svc, r.session.id, { amountTotal: 1 });
    expect(result.status).toBe(400);
    expect(svc.getOrder(r.order.id)!.status).toBe("pending");
    const wrongCurrency = payViaWebhook(svc, r.session.id, { currency: "eur", eventId: "evt_other" });
    expect(wrongCurrency.result.status).toBe(400);
    expect(svc.ticketsFor(alice.email)).toHaveLength(0);
  });

  test("test_replayed_webhook_does_not_issue_a_second_ticket", () => {
    const { svc } = makeService();
    const r = svc.startCheckout(alice, "evt_musical");
    if (!r.ok) throw new Error(r.error);
    const first = payViaWebhook(svc, r.session.id);
    expect(first.result.status).toBe(200);
    const replay = svc.handleStripeWebhook(first.body, first.sig);
    expect(replay.status).toBe(200);
    expect(replay.message).toMatch(/already processed/i);
    expect(svc.ticketsFor(alice.email)).toHaveLength(1);
  });
});
