import { describe, expect, test } from "vitest";
import { alice, bob, makeService, payViaWebhook } from "./helpers";

describe("S1 Tenant isolation", () => {
  test("an organizer who asks for another club's attendee list or scans its tickets gets not-found and the attempt is logged", () => {
    const { svc } = makeService();
    svc.addOrganizer({ email: "kevin@andrew.cmu.edu", clubId: "club_kgb" });
    const r = svc.startCheckout(alice, "evt_musical"); // evt_musical belongs to Scotch'n'Soda, not KGB
    if (!r.ok) throw new Error(r.error);
    payViaWebhook(svc, r.session.id);
    const [ticket] = svc.ticketsFor(alice.email);

    expect(svc.attendeeList("kevin@andrew.cmu.edu", "evt_musical")).toMatchObject({ ok: false, code: "eventNotFound" });
    expect(svc.scanTicket("kevin@andrew.cmu.edu", "evt_musical", ticket.token)).toMatchObject({ ok: false, code: "eventNotFound" });

    expect(svc.securityLog()).toEqual([
      expect.objectContaining({ kind: "cross_tenant_denied", actor: "kevin@andrew.cmu.edu", action: "attendee_list", resource: "event:evt_musical" }),
      expect.objectContaining({ kind: "cross_tenant_denied", actor: "kevin@andrew.cmu.edu", action: "scan_ticket", resource: "event:evt_musical" }),
    ]);
  });

  test("a buyer who tries to cancel someone else's ticket gets not-found and the attempt is logged", () => {
    const { svc } = makeService();
    const r = svc.startCheckout(alice, "evt_musical");
    if (!r.ok) throw new Error(r.error);
    payViaWebhook(svc, r.session.id);
    const [ticket] = svc.ticketsFor(alice.email);

    expect(svc.cancelTicket(bob.email, ticket.id)).toMatchObject({ ok: false, code: "ticketNotFound" });
    expect(svc.ticketsFor(alice.email)[0].status).toBe("valid");
    expect(svc.securityLog()).toEqual([
      expect.objectContaining({ kind: "cross_tenant_denied", actor: "bob@andrew.cmu.edu", action: "cancel_ticket", resource: `ticket:${ticket.id}` }),
    ]);
  });

  test("a ticket id that does not exist is not logged as a cross-tenant attempt", () => {
    const { svc } = makeService();
    expect(svc.cancelTicket(bob.email, "tkt_doesnotexist")).toMatchObject({ ok: false, code: "ticketNotFound" });
    expect(svc.securityLog()).toEqual([]);
  });
});
