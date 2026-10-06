import { signIn } from "./actions";
import { MESSAGES } from "@/lib/ticketing";

/** Shows only our own known messages; unknown ?error= values from a crafted link are ignored. */
export function ErrorBanner({ error }: { error?: string | string[] }) {
  const code = Array.isArray(error) ? error[0] : error;
  if (!code || !Object.hasOwn(MESSAGES, code)) return null;
  return (
    <p className="alert" role="alert">
      {MESSAGES[code as keyof typeof MESSAGES]}
    </p>
  );
}

export function SignInForm({ next }: { next: string }) {
  return (
    <form action={signIn} className="card sign-in">
      <h2>Sign in</h2>
      <p className="muted">Today a typed name stands in for Andrew SSO.</p>
      <input type="hidden" name="next" value={next} />
      <label>
        Full name
        <input name="name" autoComplete="name" maxLength={200} placeholder="Scotty Tartan" />
      </label>
      <label>
        CMU email
        <input name="email" type="text" inputMode="email" autoComplete="email" placeholder="scotty@andrew.cmu.edu" />
      </label>
      <button type="submit" className="button">
        Continue
      </button>
    </form>
  );
}
