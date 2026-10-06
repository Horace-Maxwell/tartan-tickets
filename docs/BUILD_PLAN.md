# Build plan for today (answer to the first prompt)

## 1. What we build today: US-1 "Buy a ticket", in plain language
A small website where a CMU student can:
1. Type their name and CMU email to "sign in" (no real Andrew SSO today).
2. See a list of upcoming club events with price and seats left.
3. Click **Buy ticket** on an event. The site creates a pretend Stripe checkout for that club's account at the listed price.
4. On the pretend checkout page, click **Pay (simulated)**. A pretend Stripe "payment completed" message is sent back to our server. It carries a signature, the same way real Stripe does. Our server only marks the order paid if the signature checks out and the amount matches.
5. See **My tickets**, with one ticket and a QR code that is unique and hard to guess.
6. If the event is full, the Buy button is replaced with **Sold out**, and the server refuses the checkout even if someone forces the request.

## 2. Framework and why
**Next.js (App Router) with TypeScript.** One project holds both the web pages and the server code. Vercel (the company that makes Next.js) hosts it in a few clicks. Tests use **Vitest**, a fast test runner. QR codes come from the widely used **qrcode** package.

## 3. Questions the spec did not answer, and the decision we made
| # | Question | Decision for today |
|---|---|---|
| Q1 | Which emails count as "CMU"? | `@andrew.cmu.edu` and `@cmu.edu` only. |
| Q2 | Can one buyer buy several tickets to the same event? (A4 says one ticket per *order*, not per *buyer*) | One paid ticket per buyer per event. A second attempt is refused with "You already have a ticket". |
| Q3 | Does an unpaid checkout hold a seat? (R1.3 is silent) | Yes, for 15 minutes. Paid tickets plus unexpired holds count against capacity. Without this, two people could pay for the last seat. |
| Q4 | What happens if payment arrives after the event sold out? | The server does not issue a ticket. It records the order as "needs refund". Real refunds come later. |
| Q5 | Currency? | USD only. Prices stored in cents. |
| Q6 | Free events ($0)? | Not supported today. Every seed event has a price. |
| Q7 | What does the QR code encode? | Only the random 128-bit ticket token (32 hex chars). It contains no name, email or event ID. |
| Q8 | Where does data live? | In the server's memory. It resets on every restart or redeploy, and different Vercel server copies may not share it. Fine for a demo, not for real use. |
| Q9 | Which events exist? | Seeded demo events from three clubs, including one already sold out and one starting in less than 24 hours (for story 2). |
| Q10 | Maximum name length? | 80 characters. Blank or whitespace-only names are refused. |

## 4. Assumptions (would otherwise be silent)
- Payments are simulated. No real Stripe keys, no real card form.
- "Signed in" just means a cookie holding the typed name and email. Anyone can claim any CMU email. This is a known gap, recorded in the README security audit.
- The webhook signing secret is a random value made when the server starts (or `WEBHOOK_SECRET` if set).
- Event times are shown in America/New_York (A5).
