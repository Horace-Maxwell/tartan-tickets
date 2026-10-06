import { describe, expect, test } from "vitest";
import { decodeBuyerState, encodeBuyerState } from "@/lib/buyerState";
import { alice, bob, makeService, payViaWebhook } from "./helpers";

const KEY = "test-app-secret";

describe("Buyer state carried in a signed cookie (so a fresh server copy on Vercel still knows your orders)", () => {
  test("test_buyer_state_survives_moving_to_a_new_server_instance", () => {
    const first = makeService();
    const r = first.svc.startCheckout(alice, "evt_musical");
    if (!r.ok) throw new Error(r.error);
    payViaWebhook(first.svc, r.session.id);

    const cookie = encodeBuyerState(first.svc.snapshotFor(alice.email), KEY);
    const second = makeService(); // a different server copy with only the seed data
    second.svc.restore(decodeBuyerState(cookie, KEY, alice.email)!);

    const [ticket] = second.svc.ticketsFor(alice.email);
    expect(ticket.token).toBe(first.svc.ticketsFor(alice.email)[0].token);
    expect(second.svc.getOrder(r.order.id)!.status).toBe("paid");
    expect(second.svc.getCheckoutSession(r.session.id)!.amountTotal).toBe(1500);
  });

  test("test_tampered_buyer_state_cookie_is_ignored", () => {
    const { svc } = makeService();
    const r = svc.startCheckout(alice, "evt_musical");
    if (!r.ok) throw new Error(r.error);
    payViaWebhook(svc, r.session.id);
    const cookie = encodeBuyerState(svc.snapshotFor(alice.email), KEY);
    const [body, sig] = cookie.split(".");
    const forgedBody = Buffer.from(Buffer.from(body, "base64url").toString().replaceAll("paid", "xxxx")).toString("base64url");
    expect(decodeBuyerState(`${forgedBody}.${sig}`, KEY, alice.email)).toBeNull();
    expect(decodeBuyerState(cookie, "wrong-secret", alice.email)).toBeNull();
    expect(decodeBuyerState("garbage", KEY, alice.email)).toBeNull();
  });

  test("test_someone_elses_state_cookie_is_not_accepted", () => {
    const { svc } = makeService();
    const cookie = encodeBuyerState(svc.snapshotFor(alice.email), KEY);
    expect(decodeBuyerState(cookie, KEY, bob.email)).toBeNull();
  });

  test("test_restoring_an_older_snapshot_never_undoes_a_cancellation", () => {
    const { svc } = makeService();
    const r = svc.startCheckout(alice, "evt_musical");
    if (!r.ok) throw new Error(r.error);
    payViaWebhook(svc, r.session.id);
    const beforeCancel = svc.snapshotFor(alice.email);
    const [t] = svc.ticketsFor(alice.email);
    svc.cancelTicket(alice.email, t.id);
    svc.restore(beforeCancel);
    expect(svc.ticketsFor(alice.email)[0].status).toBe("void");
    expect(svc.getOrder(r.order.id)!.status).toBe("refunded");
  });
});
