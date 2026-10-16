import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { signOut } from "./actions";
import { getCurrentBuyer } from "@/lib/currentBuyer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tartan Tickets",
  description: "Buy tickets to CMU student club events (class prototype, payments simulated).",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const buyer = await getCurrentBuyer();
  return (
    <html lang="en">
      <body>
        <div className="demo-banner">Class prototype: payments are simulated, no real money moves.</div>
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden />
            Tartan Tickets
          </Link>
          <nav>
            <Link href="/">Events</Link>
            <Link href="/tickets">My tickets</Link>
            <Link href="/checkin">Check-in</Link>
            {buyer && (
              <form action={signOut} className="inline">
                <span className="who" title={buyer.email}>
                  {buyer.name}
                </span>
                <button type="submit" className="link-button">
                  Sign out
                </button>
              </form>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
