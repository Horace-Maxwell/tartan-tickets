import { describe, expect, test } from "vitest";
import { alice, bob, makeService, payViaWebhook } from "./helpers";
import type { TicketingService } from "@/lib/ticketing";

const scotchOrganizer = "olivia@andrew.cmu.edu"; // approved for Scotch'n'Soda (evt_musical)
const kgbOrganizer = "kevin@andrew.cmu.edu"; // approved for KGB (evt_tiny)

function setup() {
  const ctx = makeService();
  ctx.svc.addOrganizer({ email: scotchOrganizer, clubId: "club_scotch" });
  ctx.svc.addOrganizer({ email: kgbOrganizer, clubId: "club_kgb" });
  return ctx;
}

function buyAndPay(svc: TicketingService, eventId: string, buyer = alice) {
  const r = svc.startCheckout(buyer, eventId);
  if (!r.ok) throw new Error(r.error);
  payViaWebhook(svc, r.session.id);
  return svc.ticketsFor(buyer.email).find((t) => t.eventId === eventId)!;
}

describe("US-3 Check in attendees", () => {
  test("test_valid_unused_ticket_scans_as_admit (R3.1)", () => {
    const { svc } = setup();
    const ticket = buyAndPay(svc, "evt_musical");
    const r = svc.scanTicket(scotchOrganizer, "evt_musical", ticket.token);
    expect(r).toEqual({ ok: true, verdict: "admit", buyerName: "Alice Tartan" });
    expect(svc.ticketsFor(alice.email)[0].status).toBe("used");
  });

  test("test_same_ticket_scanned_twice_is_rejected_the_second_time (R3.2, S3)", () => {
    const { svc } = setup();
    const ticket = buyAndPay(svc, "evt_musical");
    expect(svc.scanTicket(scotchOrganizer, "evt_musical", ticket.token)).toMatchObject({ verdict: "admit" });
    expect(svc.scanTicket(scotchOrganizer, "evt_musical", ticket.token)).toEqual({
      ok: true,
      verdict: "reject",
      reason: "Ticket already used",
    });
  });

  test("test_voided_ticket_scans_as_reject (R3.2)", () => {
    const { svc } = setup();
    const ticket = buyAndPay(svc, "evt_musical");
    svc.cancelTicket(alice.email, ticket.id);
    expect(svc.scanTicket(scotchOrganizer, "evt_musical", ticket.token)).toEqual({
      ok: true,
      verdict: "reject",
      reason: "Ticket voided",
    });
  });

  test("test_ticket_for_a_different_event_scans_as_reject (R3.2)", () => {
    const { svc } = setup();
    svc.addEvent({
      id: "evt_cabaret",
      clubId: "club_scotch",
      title: "Cabaret Night",
      startsAt: new Date("2026-10-20T19:00:00-04:00"),
      venue: "Rangos Ballroom",
      priceCents: 1000,
      capacity: 10,
    });
    const ticket = buyAndPay(svc, "evt_cabaret");
    expect(svc.scanTicket(scotchOrganizer, "evt_musical", ticket.token)).toEqual({
      ok: true,
      verdict: "reject",
      reason: "Ticket is for a different event",
    });
    expect(svc.ticketsFor(alice.email)[0].status).toBe("valid");
  });

  test("test_guessed_or_altered_qr_token_scans_as_reject (R3.2, S3)", () => {
    const { svc } = setup();
    const ticket = buyAndPay(svc, "evt_musical");
    const altered = (ticket.token[0] === "a" ? "b" : "a") + ticket.token.slice(1);
    for (const token of [altered, "0".repeat(32), "", "x".repeat(5000)]) {
      expect(svc.scanTicket(scotchOrganizer, "evt_musical", token)).toEqual({
        ok: true,
        verdict: "reject",
        reason: "Unknown ticket",
      });
    }
  });

  test("test_organizer_sees_attendee_list_for_own_clubs_event (R3.3)", () => {
    const { svc } = setup();
    buyAndPay(svc, "evt_musical", alice);
    const bobTicket = buyAndPay(svc, "evt_musical", bob);
    svc.scanTicket(scotchOrganizer, "evt_musical", bobTicket.token);
    const r = svc.attendeeList(scotchOrganizer, "evt_musical");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attendees.map((a) => [a.name, a.status])).toEqual([
      ["Alice Tartan", "valid"],
      ["Bob Scotty", "used"],
    ]);
    expect(svc.attendeeCsv(scotchOrganizer, "evt_musical")).toBe(
      "name,email,status\r\nAlice Tartan,alice@andrew.cmu.edu,valid\r\nBob Scotty,bob@andrew.cmu.edu,used\r\n",
    );
  });

  test("test_organizer_of_one_club_cannot_see_another_clubs_attendee_list (R3.3, S1)", () => {
    const { svc } = setup();
    buyAndPay(svc, "evt_musical");
    expect(svc.attendeeList(kgbOrganizer, "evt_musical")).toMatchObject({ ok: false, code: "eventNotFound" });
    expect(svc.attendeeCsv(kgbOrganizer, "evt_musical")).toBeNull();
    expect(svc.attendeeList(alice.email, "evt_musical")).toMatchObject({ ok: false, code: "eventNotFound" });
  });

  test("test_organizer_cannot_check_in_tickets_for_another_clubs_event (R3.1, S1)", () => {
    const { svc } = setup();
    const ticket = buyAndPay(svc, "evt_musical");
    expect(svc.scanTicket(kgbOrganizer, "evt_musical", ticket.token)).toMatchObject({ ok: false, code: "eventNotFound" });
    expect(svc.ticketsFor(alice.email)[0].status).toBe("valid");
  });

  test("test_csv_export_neutralizes_spreadsheet_formulas_in_names (R3.3)", () => {
    const { svc } = setup();
    buyAndPay(svc, "evt_musical", { name: "=HYPERLINK(1)", email: "eve@andrew.cmu.edu" });
    expect(svc.attendeeCsv(scotchOrganizer, "evt_musical")).toContain("\"'=HYPERLINK(1)\",eve@andrew.cmu.edu,valid");
  });
});
