import { signIn } from "../../../auth";
import Link from "next/link";
import { QuickAuditForm } from "@/app/ui/quick-audit-form";

export default async function LoginPage() {
  return (
    <main className="login-shell">
      <div className="login-orbit orbit-one" />
      <div className="login-orbit orbit-two" />
      <section className="login-card">
        <div className="login-main-grid">
          <div className="login-primary">
            <Link className="brand-mark" href="/" aria-label="Pulseboard home"><span className="brand-symbol">p</span><span>pulseboard<span className="brand-dot">.</span></span></Link>
            <div className="login-eyebrow"><span className="live-dot" /> PERFORMANCE INTELLIGENCE</div>
            <h1>See the shifts<br /><em>before your users do.</em></h1>
            <p className="login-description">A calm, evidence-first workspace for watching web performance, finding regressions, and making the next fix count.</p>
            <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
              <button className="oauth-signin google-signin" type="submit">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.72-.06-1.42-.19-2.1H12v3.97h5.38a4.6 4.6 0 0 1-2 3.02v2.59h3.24c1.9-1.75 2.98-4.33 2.98-7.48Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.29l-3.24-2.59c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.67A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.96a6 6 0 0 1 0-3.92V7.37H3.06a10 10 0 0 0 0 9.26l3.35-2.67Z"/><path fill="#EA4335" d="M12 5.92c1.47 0 2.79.5 3.82 1.5l2.86-2.87C16.96 2.98 14.7 2 12 2a10 10 0 0 0-8.94 5.37l3.35 2.67C7.2 7.68 9.4 5.92 12 5.92Z"/></svg>
                Continue with Google <span aria-hidden="true">→</span>
              </button>
            </form>
            <form action={async () => { "use server"; await signIn("github", { redirectTo: "/" }); }}>
              <button className="oauth-signin github-signin" type="submit">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.1c-3.1.68-3.75-1.32-3.75-1.32-.5-1.29-1.23-1.63-1.23-1.63-1.01-.7.08-.69.08-.69 1.12.08 1.71 1.15 1.71 1.15 1 .1.68 1.54 3.28 1.17.1-.73.39-1.23.7-1.51-2.48-.28-5.09-1.24-5.09-5.53 0-1.22.44-2.22 1.16-3-.12-.28-.5-1.42.11-2.96 0 0 .95-.3 3.06 1.15a10.65 10.65 0 0 1 5.57 0c2.12-1.44 3.06-1.15 3.06-1.15.61 1.54.23 2.68.12 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.61 5.25-5.1 5.52.4.35.75 1.03.75 2.08v3.46c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"/></svg>
                Continue with GitHub <span aria-hidden="true">→</span>
              </button>
            </form>
            <div className="login-footnote"><span className="lock-icon">⌑</span> Sign in to keep private audit history and monitor pages over time.</div>
          </div>
          <QuickAuditForm />
        </div>
      </section>
    </main>
  );
}
