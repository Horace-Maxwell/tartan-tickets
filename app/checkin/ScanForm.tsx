"use client";

import { useActionState } from "react";
import { scanTicketAction } from "@/app/actions";

/** The result is rendered as React text, so a buyer's name is always shown as plain text. */
export function ScanForm({ eventId }: { eventId: string }) {
  const [result, action, pending] = useActionState(scanTicketAction, null);
  return (
    <form action={action} className="card sign-in">
      <h2>Scan a ticket</h2>
      <input type="hidden" name="eventId" value={eventId} />
      <label>
        Ticket code
        <input name="token" required maxLength={8000} autoComplete="off" spellCheck={false} placeholder="Paste the ticket code from under the QR" />
      </label>
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Checking…" : "Check in"}
      </button>
      {result && (
        <p className={result.ok && result.verdict === "admit" ? "success verdict" : "alert verdict"} role="status">
          {!result.ok
            ? result.error
            : result.verdict === "admit"
              ? `Admit: ${result.buyerName}`
              : `Reject: ${result.reason}`}
        </p>
      )}
    </form>
  );
}
