import { describe, expect, test } from "vitest";
import { decodeTicketPass, encodeTicketPass } from "@/lib/ticketPass";
import { alice, makeService, payViaWebhook } from "./helpers";

const KEY = "test-app-secret";
const organizer = "olivia@andrew.cmu.edu";

function buyOnOneServerCopy() {
  const first = makeService();
  const r = first.svc.startCheckout(alice, "evt_musical");
  if (!r.ok) throw new Error(r.error);
  payViaWebhook(first.svc, r.session.id);
  const [ticket] = first.svc.ticketsFor(alice.email);
  return { first, ticket, pass: encodeTicketPass(first.svc.ticketSnapshot(ticket.id)!, KEY) };
}

describe("US-3 ticket pass (so the check-in page on another Vercel server copy can verify a ticket)", () => {
  test("a ticket bought on one server copy is admitted once when its pass is scanned on another copy (R3.1, R3.2)", () => {
    const { ticket, pass } = buyOnOneServerCopy();
    const door = makeService(); // the check-in page's server copy: seed data only
    door.svc.addOrganizer({ email: organizer, clubId: "club_scotch" });
    const decoded = decodeTicketPass(pass, KEY)!;
    door.svc.restore(decoded.snapshot);
    expect(door.svc.scanTicket(organizer, "evt_musical", decoded.token)).toEqual({ ok: true, verdict: "admit", buyerName: "Alice Tartan" });
    door.svc.restore(decodeTicketPass(pass, KEY)!.snapshot); // scanning the same pass again
    expect(door.svc.scanTicket(organizer, "evt_musical", ticket.token)).toMatchObject({ verdict: "reject", reason: "Ticket already used" });
  });

  test("an edited or forged ticket pass is refused (S3)", () => {
    const { pass } = buyOnOneServerCopy();
    const [token, body, sig] = pass.split(".");
    const forged = Buffer.from(Buffer.from(body, "base64url").toString().replaceAll("Alice", "Mallory")).toString("base64url");
    expect(decodeTicketPass(`${token}.${forged}.${sig}`, KEY)).toBeNull();
    expect(decodeTicketPass(pass, "wrong-secret")).toBeNull();
    expect(decodeTicketPass("not-a-pass", KEY)).toBeNull();
  });
});
