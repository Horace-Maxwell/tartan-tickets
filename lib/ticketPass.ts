/**
 * Same "no database" workaround as lib/buyerState.ts, for the door: the ticket code under the QR carries a signed
 * copy of that one ticket, so the check-in page's server copy can restore it even if it never saw the purchase.
 * Format: <token>.<base64url snapshot>.<HMAC>. A real database replaces all of this.
 */
import { decodeBuyerState, encodeBuyerState } from "./buyerState";
import type { BuyerSnapshot } from "./ticketing";

export function encodeTicketPass(snapshot: BuyerSnapshot, key: string): string {
  return `${snapshot.tickets[0].token}.${encodeBuyerState(snapshot, key)}`;
}

export function decodeTicketPass(raw: string, key: string): { token: string; snapshot: BuyerSnapshot } | null {
  const [token, body, sig, ...rest] = raw.trim().split(".");
  if (!token || !body || !sig || rest.length) return null;
  let email: string;
  try {
    email = JSON.parse(Buffer.from(body, "base64url").toString()).email;
  } catch {
    return null;
  }
  const snapshot = typeof email === "string" ? decodeBuyerState(`${body}.${sig}`, key, email) : null;
  if (!snapshot || snapshot.tickets.length !== 1 || snapshot.tickets[0].token !== token) return null;
  return { token, snapshot };
}
