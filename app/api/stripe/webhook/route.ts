import { getService } from "@/lib/store";

/**
 * Where a real Stripe would POST `checkout.session.completed`.
 * Unsigned or wrongly signed requests are rejected with 400 and change nothing (S2).
 */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  const result = getService().handleStripeWebhook(body, signature);
  return Response.json({ message: result.message }, { status: result.status });
}
