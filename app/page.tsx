import Link from "next/link";
import { ErrorBanner, SignInForm } from "./components";
import { getCurrentBuyer } from "@/lib/currentBuyer";
import { formatPrice, formatWhen } from "@/lib/format";
import { getService } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const buyer = await getCurrentBuyer();
  const events = getService().listEvents();

  return (
    <>
      <h1>Upcoming club events</h1>
      <ErrorBanner error={error} />
      {!buyer && <SignInForm next="/" />}
      <ul className="event-list">
        {events.map((e) => (
          <li key={e.id} className="card event-card">
            <div>
              <p className="club">{e.clubName}</p>
              <h2>
                <Link href={`/events/${e.id}`}>{e.title}</Link>
              </h2>
              <p className="muted">
                {formatWhen(e.startsAt)} · {e.venue}
              </p>
            </div>
            <div className="event-meta">
              <span className="price">{formatPrice(e.priceCents)}</span>
              {e.salesClosed ? (
                <span className="badge">Sales closed</span>
              ) : e.soldOut ? (
                <span className="badge sold-out">Sold out</span>
              ) : (
                <>
                  <span className="muted small">
                    {e.seatsLeft} of {e.capacity} left
                  </span>
                  <Link className="button" href={`/events/${e.id}`}>
                    Get ticket
                  </Link>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
