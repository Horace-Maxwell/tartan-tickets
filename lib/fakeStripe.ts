/**
 * A pretend Stripe. Today we never talk to the real Stripe; this file plays its part.
 * It mirrors the real shapes closely enough that swapping in the Stripe SDK later is a small change:
 *  - a Checkout Session is created on a club's *connected account* for a fixed amount
 *  - when payment finishes, "Stripe" sends a signed `checkout.session.completed` webhook
 *  - the signature header looks like Stripe's: `t=<unix seconds>,v1=<hex HMAC-SHA256>`
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type CheckoutSession = {
  id: string;
  connectedAccountId: string;
  amountTotal: number; // cents
  currency: string;
  orderId: string;
  eventId: string;
  createdAt: Date;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  account: string;
  data: {
    object: {
      id: string;
      amount_total: number;
      currency: string;
      payment_status: "paid";
      metadata: { order_id: string };
    };
  };
};

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function createCheckoutSession(input: Omit<CheckoutSession, "id" | "createdAt">, now: Date): CheckoutSession {
  return { ...input, id: `cs_test_${randomBytes(12).toString("hex")}`, createdAt: now };
}

export function buildCompletedEvent(
  session: CheckoutSession,
  overrides: { amountTotal?: number; currency?: string; eventId?: string } = {},
): StripeWebhookEvent {
  return {
    id: overrides.eventId ?? `evt_${randomBytes(12).toString("hex")}`,
    type: "checkout.session.completed",
    account: session.connectedAccountId,
    data: {
      object: {
        id: session.id,
        amount_total: overrides.amountTotal ?? session.amountTotal,
        currency: overrides.currency ?? session.currency,
        payment_status: "paid",
        metadata: { order_id: session.orderId },
      },
    },
  };
}

function hmac(body: string, secret: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signPayload(body: string, secret: string, timestamp: number): string {
  return `t=${timestamp},v1=${hmac(body, secret, timestamp)}`;
}

export function verifySignature(body: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const timestamp = Number(parts.t);
  const given = parts.v1;
  if (!Number.isFinite(timestamp) || typeof given !== "string" || !/^[0-9a-f]{64}$/.test(given)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = hmac(body, secret, timestamp);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
}
