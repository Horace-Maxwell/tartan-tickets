import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card">
      <h1>Not found</h1>
      <p>That page does not exist or is not yours to see.</p>
      <Link href="/">Back to events</Link>
    </div>
  );
}
