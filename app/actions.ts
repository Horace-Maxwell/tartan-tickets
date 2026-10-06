"use server";

import { redirect } from "next/navigation";
import { clearBuyerCookies, getCurrentBuyer, saveBuyerState, setBuyerCookie } from "@/lib/currentBuyer";
import { getService } from "@/lib/store";
import { type MessageKey, validateBuyer } from "@/lib/ticketing";

function withError(path: string, code: MessageKey) {
  return `${path}?error=${code}`;
}

/** Only allow redirects back to our own pages. */
function safeNext(value: FormDataEntryValue | null) {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function signIn(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const v = validateBuyer({ name: formData.get("name"), email: formData.get("email") });
  if (!v.ok) redirect(withError(next, v.code));
  await clearBuyerCookies();
  await setBuyerCookie(v.buyer);
  await saveBuyerState(v.buyer);
  redirect(next);
}

export async function signOut() {
  await clearBuyerCookies();
  redirect("/");
}

export async function buyTicket(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const back = `/events/${encodeURIComponent(eventId)}`;
  const buyer = await getCurrentBuyer();
  if (!buyer) redirect(withError(back, "signInFirst"));
  const r = getService().startCheckout(buyer, eventId);
  if (!r.ok) redirect(withError(back, r.code));
  await saveBuyerState(buyer);
  redirect(`/checkout/${r.session.id}`);
}

export async function payCheckout(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const buyer = await getCurrentBuyer();
  const svc = getService();
  const session = svc.getCheckoutSession(sessionId);
  const order = session && svc.getOrder(session.orderId);
  if (!buyer || !order || order.buyerEmail !== buyer.email) redirect("/");
  const result = svc.simulateStripePayment(sessionId);
  await saveBuyerState(buyer);
  if (result.status !== 200) redirect(withError(`/checkout/${sessionId}`, "paymentFailed"));
  redirect(`/tickets?order=${order.id}`);
}

export async function cancelMyTicket(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  const buyer = await getCurrentBuyer();
  if (!buyer) redirect(withError("/tickets", "signInFirst"));
  const r = getService().cancelTicket(buyer.email, ticketId);
  if (!r.ok) redirect(withError("/tickets", r.code));
  await saveBuyerState(buyer);
  redirect(`/tickets?cancelled=${encodeURIComponent(ticketId)}`);
}
