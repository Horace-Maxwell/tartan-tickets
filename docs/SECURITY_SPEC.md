# Tartan Tickets: Security Requirements (EARS)

Top risks the team named: duplicate or fake tickets, organizer fraud, buyer data leaks, and payment bugs.

- **S1 Tenant isolation.** If a user requests an event, order, ticket, or attendee list that belongs to a club they are not an organizer of, then the system shall return 404 and log the attempt. (Buyer data leak, organizer fraud)
- **S2 Payment truth comes from Stripe only.** The system shall mark an order paid only after receiving a Stripe webhook whose signature verifies, whose amount and currency match the order, and whose event ID has not been processed before. (Payment bugs, double charges)
- **S3 Unforgeable, single-use tickets.** When a ticket is issued, the system shall encode it as a random 128-bit token with no guessable structure, and when it is scanned, the system shall mark it used in the same database transaction so a second scan is rejected. (Duplicate and fake tickets)
- **S4 Controlled organizer powers.** When an organizer changes a club's Stripe payout account, creates an event, or triggers a mass refund, the system shall require admin approval and write an audit log entry. (Organizer fraud)

## Supporting rules (not counted in the four)
- The system shall never store card numbers. Stripe Checkout collects them.
- If a user is not signed in via Andrew SSO, then the system shall deny access to any page except public event listings.
- The system shall send refunds only to the original payment method, never to an address or account the requester supplies.
