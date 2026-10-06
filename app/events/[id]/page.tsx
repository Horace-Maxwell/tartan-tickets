import Link from "next/link";
import { notFound } from "next/navigation";
import { buyTicket } from "@/app/actions";
import { ErrorBanner, SignInForm } from "@/app/components";
import { getCurrentBuyer } from "@/lib/currentBuyer";
import { formatPrice, formatWhen } from "@/lib/format";
import { getService } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const buyer = await getCurrentBuyer(); // first, so this server copy knows the buyer's own holds and tickets
  const svc = getService();
  const event = svc.getEvent(id);
  if (!event) notFound();
  const owned = buyer ? svc.ticketsFor(buyer.email).find((t) => t.eventId === id && t.status !== "void") : undefined;

  return (
    <>
      <p>
        <Link href="/">← All events</Link>
      </p>
      <article className="card">
        <p className="club">{event.clubName}</p>
        <h1>{event.title}</h1>
        <dl className="facts">
          <dt>When</dt>
          <dd>{formatWhen(event.startsAt)}</dd>
          <dt>Where</dt>
          <dd>{event.venue}</dd>
          <dt>Price</dt>
          <dd>{formatPrice(event.priceCents)} (one ticket per order)</dd>
          <dt>Seats left</dt>
          <dd>
            {event.seatsLeft} of {event.capacity}
          </dd>
        </dl>
        <ErrorBanner error={error} />
        {owned ? (
          <p className="success">
            You have a ticket for this event. <Link href="/tickets">See it in My tickets</Link>.
          </p>
        ) : event.salesClosed ? (
          <p className="badge">Sales closed</p>
        ) : event.soldOut ? (
          <p className="badge sold-out big">Sold out</p>
        ) : buyer ? (
          <form action={buyTicket}>
            <input type="hidden" name="eventId" value={event.id} />
            <button type="submit" className="button big">
              Buy ticket · {formatPrice(event.priceCents)}
            </button>
            <p className="muted small">Your seat is held for 15 minutes while you check out.</p>
          </form>
        ) : null}
      </article>
      {!buyer && !event.soldOut && !event.salesClosed && <SignInForm next={`/events/${event.id}`} />}
    </>
  );
}
