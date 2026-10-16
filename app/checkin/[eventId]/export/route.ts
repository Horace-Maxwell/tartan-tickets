import { getCurrentBuyer } from "@/lib/currentBuyer";
import { getService } from "@/lib/store";

export const dynamic = "force-dynamic";

/** R3.3: CSV of the attendee list, only for an organizer of the event's own club. Anyone else gets 404 (S1). */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const user = await getCurrentBuyer();
  const csv = user && getService().attendeeCsv(user.email, eventId);
  if (!csv) return new Response("Not found", { status: 404 });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="attendees-${eventId.replace(/[^a-z0-9-]/gi, "")}.csv"`,
      "cache-control": "no-store",
    },
  });
}
