import Link from "next/link";
import { notFound } from "next/navigation";
import { payCheckout } from "@/app/actions";
import { ErrorBanner } from "@/app/components";
import { getCurrentBuyer } from "@/lib/currentBuyer";
import { formatPrice } from "@/lib/format";
import { getService } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Stands in for the Stripe-hosted Checkout page. A real build would redirect to checkout.stripe.com. */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { sessionId } = await params;
  const { error } = await searchParams;
  const buyer = await getCurrentBuyer();
  const svc = getService();
  const session = svc.getCheckoutSession(sessionId);
  const order = session && svc.getOrder(session.orderId);
  // Only the buyer who started this checkout may see it.
  if (!buyer || !session || !order || order.buyerEmail !== buyer.email) notFound();
  const event = svc.getEvent(order.eventId)!;
  const expired = order.status === "pending" && order.holdExpiresAt.getTime() <= Date.now();

  return (
    <div className="card checkout">
      <p className="stripe-label">Simulated Stripe Checkout</p>
      <h1>{event.title}</h1>
      <p className="muted">Paying {event.clubName}</p>
      <p className="amount">{formatPrice(session.amountTotal)}</p>
      <dl className="facts small">
        <dt>Connected account</dt>
        <dd>
          <code>{session.connectedAccountId}</code>
        </dd>
        <dt>Session</dt>
        <dd>
          <code>{session.id}</code>
        </dd>
        <dt>Buyer</dt>
        <dd>
          {order.buyerName} ({order.buyerEmail})
        </dd>
      </dl>
      <ErrorBanner error={error} />
      {order.status === "paid" ? (
        <p className="success">
          Already paid. <Link href="/tickets">See your ticket</Link>.
        </p>
      ) : order.status === "needs_refund" ? (
        <p className="alert">The event filled up before your payment arrived. No ticket was issued; this order is flagged for a refund.</p>
      ) : (
        <>
          {expired && <p className="alert">Your 15-minute seat hold expired. You can still try to pay if a seat is free.</p>}
          <div className="fake-card muted small">Card details would be collected by Stripe here. Nothing is charged.</div>
          <form action={payCheckout}>
            <input type="hidden" name="sessionId" value={session.id} />
            <button type="submit" className="button big">
              Pay {formatPrice(session.amountTotal)} (simulated)
            </button>
          </form>
          <p>
            <Link href={`/events/${event.id}`}>Cancel and go back</Link>
          </p>
        </>
      )}
    </div>
  );
}
