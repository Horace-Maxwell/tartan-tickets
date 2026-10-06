/**
 * Prototype workaround for "no database": Vercel may answer each click from a different server copy,
 * each with its own memory. So the buyer's browser carries a signed copy of *their own* orders and tickets,
 * and any server copy that has not seen them yet restores them. The HMAC signature stops hand-editing.
 * A real database replaces all of this.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BuyerSnapshot } from "./ticketing";

function sign(body: string, key: string) {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function encodeBuyerState(snapshot: BuyerSnapshot, key: string): string {
  const body = Buffer.from(JSON.stringify(snapshot)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export function decodeBuyerState(raw: string, key: string, expectedEmail: string): BuyerSnapshot | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const snapshot = JSON.parse(Buffer.from(body, "base64url").toString()) as BuyerSnapshot;
    return snapshot.email === expectedEmail.trim().toLowerCase() ? snapshot : null;
  } catch {
    return null;
  }
}
