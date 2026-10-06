# Tartan Tickets: Requirements

CMU student clubs sell event tickets. Buyers pay with Stripe. Each club has its own Stripe Connect account.

## Data statement
We store each user's name, CMU email, orders and tickets; Stripe stores all card data; buyers see only their own tickets, organizers see only the attendees of their own club's events, and admins see everything.

## Roles
- **Buyer:** any CMU user who signs in with Andrew SSO.
- **Organizer:** a CMU user whom an admin has approved for one specific club.
- **Admin:** platform staff who approve clubs and organizers and can refund any order.

## User stories

### US-1: Buy a ticket
As a CMU student, I want to buy a ticket with my card so that I can attend a club event.

- **R1.1** When a signed-in buyer confirms checkout, the system shall create a Stripe Checkout session on the club's connected account for the listed price.
- **R1.2** When Stripe sends a verified `checkout.session.completed` webhook, the system shall mark the order paid and issue one ticket with a unique QR code.
- **R1.3** If the event has no remaining capacity, then the system shall refuse checkout and show "Sold out".
- **R1.4** While an order is unpaid, the system shall not issue a ticket for it.

### US-2: Refund my ticket
As a buyer, I want to cancel my ticket myself so that I get my money back if my plans change.

- **R2.1** While the event start time is more than 24 hours away, the system shall let the buyer cancel their own ticket.
- **R2.2** When a buyer cancels, the system shall void the ticket's QR code, then issue a full Stripe refund to the original payment method.
- **R2.3** If the event start time is 24 hours away or less, then the system shall hide the cancel option and reject any cancel request.
- **R2.4** When an organizer cancels an event, the system shall void every ticket and refund every paid order.

### US-3: Check in attendees
As a club organizer, I want to scan tickets at the door so that only paid attendees get in.

- **R3.1** When an organizer scans a valid, unused ticket for their own club's event, the system shall mark it used and show "Admit" with the buyer's name.
- **R3.2** If a scanned ticket is already used, voided, or belongs to a different event, then the system shall show "Reject" and the reason.
- **R3.3** The system shall let an organizer view and export the attendee list only for their own club's events.

## Non-goals
- No ticket transfers or resale. A ticket is bound to the buyer's account.
- No non-CMU buyers or guest tickets.
- No partial refunds or refunds inside the 24-hour window.
- No seating charts, waitlists, or tiered pricing.
- No native mobile app. The site is mobile-friendly web only.
- The platform never holds funds. Money flows directly to each club's Stripe account.

## Assumptions (flagged)
- **A1** Andrew SSO (Shibboleth) is available to us and returns a verified name and email.
- **A2** Each club can open a Stripe Connect account. Who legally owns it (club or CMU Student Activities) is unresolved.
- **A3** The platform fee is non-refundable on buyer cancellations. This needs a business decision.
- **A4** One ticket per order. Multi-ticket orders are out of scope for v1.
- **A5** Event times are stored in America/New_York, and the 24-hour cutoff uses that time.
- **A6** Organizers scan with a phone browser. No offline scanning.
- **A7** Chargebacks are handled by the club in its own Stripe dashboard, not in our app.
