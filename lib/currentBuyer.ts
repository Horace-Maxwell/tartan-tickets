/**
 * Today's stand-in for Andrew SSO: the buyer types a name and CMU email, and we keep them in a cookie.
 * This is NOT real authentication. Anyone can type anyone's email. See README "Security spec audit".
 */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { decodeBuyerState, encodeBuyerState } from "./buyerState";
import { getService } from "./store";
import { type Buyer, validateBuyer } from "./ticketing";

export const BUYER_COOKIE = "tt_buyer";
export const STATE_COOKIE = "tt_state";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 8,
};

// Must be the same on every server copy, so set APP_SECRET in production. Without it, each copy makes its own.
const globalForSecret = globalThis as unknown as { tartanAppSecret?: string };
function stateKey() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  if (process.env.NODE_ENV !== "production") return "dev-only-app-secret";
  return (globalForSecret.tartanAppSecret ??= randomBytes(32).toString("hex"));
}

/** Who is signed in. Also restores their signed orders/tickets into this server copy if it has not seen them. */
export async function getCurrentBuyer(): Promise<Buyer | null> {
  const jar = await cookies();
  const raw = jar.get(BUYER_COOKIE)?.value;
  if (!raw) return null;
  let buyer: Buyer;
  try {
    const v = validateBuyer(JSON.parse(raw));
    if (!v.ok) return null;
    buyer = v.buyer;
  } catch {
    return null;
  }
  const state = jar.get(STATE_COOKIE)?.value;
  const snapshot = state ? decodeBuyerState(state, stateKey(), buyer.email) : null;
  if (snapshot) getService().restore(snapshot);
  return buyer;
}

export async function setBuyerCookie(buyer: Buyer) {
  (await cookies()).set(BUYER_COOKIE, JSON.stringify(buyer), COOKIE_OPTIONS);
}

/** Call after anything that changes the buyer's orders or tickets (only allowed inside server actions). */
export async function saveBuyerState(buyer: Buyer) {
  const snapshot = getService().snapshotFor(buyer.email);
  (await cookies()).set(STATE_COOKIE, encodeBuyerState(snapshot, stateKey()), COOKIE_OPTIONS);
}

export async function clearBuyerCookies() {
  const jar = await cookies();
  jar.delete(BUYER_COOKIE);
  jar.delete(STATE_COOKIE);
}
