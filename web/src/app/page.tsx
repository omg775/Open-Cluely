import Link from "next/link";
import { getSession } from "@/lib/session";

const FEATURES = [
  {
    title: "Grounded in your own documents",
    body: "Upload notes, specs or briefs once. Answers cite what you actually wrote instead of guessing from the model's memory.",
  },
  {
    title: "Nothing is stored",
    body: "Screen frames and speech leave your machine only in the single Claude request that answers each question. We keep session metadata — time and duration — and no content.",
  },
  {
    title: "Answers stream as they are written",
    body: "Claude tokens render the moment they arrive, so you read the first line while the rest is still being generated.",
  },
  {
    title: "Confidence you can see",
    body: "Each answer shows how grounded it is, so you know when to trust it and when to double-check before speaking.",
  },
];

const STEPS = [
  { step: "1", title: "Create an account", body: "Email and password. Takes a few seconds." },
  { step: "2", title: "Pick your model", body: "Sonnet for speed or Opus for depth. There is no API key to bring — Claude runs on our side." },
  { step: "3", title: "Launch the assistant", body: "Open it in the same tab, or link the desktop app for an overlay that stays hidden during a screen share and transcribes locally." },
];

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            OpenCluely
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="#features" className="hidden text-[var(--muted)] hover:text-[var(--foreground)] sm:block">
              Features
            </Link>
            <Link href="#how-it-works" className="hidden text-[var(--muted)] hover:text-[var(--foreground)] sm:block">
              How it works
            </Link>
            {session ? (
              <Link href="/dashboard" className="btn btn-primary">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-secondary">
                  Log in
                </Link>
                <Link href="/signup" className="btn btn-primary">
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Live context assistant
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
            Answers from your own knowledge, while the conversation is still happening.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[var(--muted)]">
            OpenCluely listens to your meeting or study session, reads the screen you share, and
            streams grounded answers back — without storing a word of what was said.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={session ? "/dashboard" : "/signup"} className="btn btn-primary px-6 py-3">
              {session ? "Open dashboard" : "Get started — free"}
            </Link>
            <Link href="#how-it-works" className="btn btn-secondary px-6 py-3">
              See how it works
            </Link>
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Runs in your browser, or as a hidden desktop overlay. No API key either way.
          </p>
        </section>

        <section id="features" className="border-t border-[var(--border)] bg-[var(--panel)]/40">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-16 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="panel p-6">
                <h2 className="text-lg font-medium">{feature.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((item) => (
              <div key={item.step} className="panel p-6">
                <span className="text-xs text-[var(--accent)]">Step {item.step}</span>
                <h3 className="mt-2 text-base font-medium">{item.title}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{item.body}</p>
              </div>
            ))}
          </div>
          <div className="panel mt-10 flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h3 className="text-lg font-medium">Ready to try it in your next call?</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Sign up and launch it in the same tab — about thirty seconds.
              </p>
            </div>
            <Link href={session ? "/dashboard" : "/signup"} className="btn btn-primary px-6 py-3">
              {session ? "Open dashboard" : "Sign up"}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-[var(--muted)]">
          <span>OpenCluely — a live assistant for meetings, research and note-taking.</span>
          <a
            href="https://github.com/omg775/Open-Cluely"
            className="hover:text-[var(--foreground)]"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
