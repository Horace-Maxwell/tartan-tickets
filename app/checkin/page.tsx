import Link from "next/link";
import { SignInForm } from "@/app/components";
import { ScanForm } from "./ScanForm";
import { getCurrentBuyer } from "@/lib/currentBuyer";
import { formatWhen } from "@/lib/format";
import { getService } from "@/lib/store";
import { MESSAGES } from "@/lib/ticketing";

export const dynamic = "force-dynamic";

export default async function CheckIn({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event: eventId } = await searchParams;
  const user = await getCurrentBuyer();
  if (!user) {
    return (
      <>
        <h1>Check in attendees</h1>
        <SignInForm next="/checkin" />
      </>
    );
  }
  const svc = getService();
  const org = svc.organizerFor(user.email);
  if (!org) {
    return (
      <>
        <h1>Check in attendees</h1>
        <p className="alert">{MESSAGES.notOrganizer}</p>
        <p className="muted small">
          Demo organizers (stand-in for admin approval): organizer.theatre@andrew.cmu.edu, organizer.comedy@andrew.cmu.edu,
          organizer.jazz@andrew.cmu.edu. Sign out and sign in with one of them.
        </p>
      </>
    );
  }
  const events = svc.eventsForOrganizer(user.email);
  const list = eventId ? svc.attendeeList(user.email, eventId) : null;

  return (
    <>
      <h1>Check in attendees</h1>
      <p className="muted">
        Organizer: {user.name} · {events[0]?.clubName}
      </p>
      <ul className="event-list">
        {events.map((e) => (
          <li key={e.id} className="card event-card">
            <div>
              <h2>{e.title}</h2>
              <p className="muted">{formatWhen(e.startsAt)}</p>
            </div>
            <Link className={e.id === eventId ? "button" : "button secondary"} href={`/checkin?event=${encodeURIComponent(e.id)}`}>
              {e.id === eventId ? "Selected" : "Check in"}
            </Link>
          </li>
        ))}
      </ul>
      {list && !list.ok && <p className="alert">{list.error}</p>}
      {list && list.ok && (
        <>
          <ScanForm eventId={list.event.id} />
          <section className="card">
            <h2>Attendees ({list.attendees.length})</h2>
            <p>
              <a href={`/checkin/${encodeURIComponent(list.event.id)}/export`} download>
                Export attendee list (CSV)
              </a>
            </p>
            <table className="attendees">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.attendees.map((a) => (
                  <tr key={a.email}>
                    <td>{a.name}</td>
                    <td>{a.email}</td>
                    <td className={`status ${a.status}`}>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
