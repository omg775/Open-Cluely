import Link from "next/link";
import { getSession } from "@/lib/session";

const TRAITS = [
  {
    lead: "Nothing is stored.",
    body: "Screen and speech leave your machine only to answer one question.",
    readout: "retained: 0 bytes",
  },
  {
    lead: "Invisible to screen share.",
    body: "The desktop overlay stays out of shared screens and recordings.",
    readout: "hidden: macOS, Windows",
  },
  {
    lead: "Grounded in your notes.",
    body: "Answers cite the documents you uploaded, not the model's memory.",
    readout: "sources: yours",
  },
];

const STEPS = [
  { step: "1", title: "Create an account", readout: "email and password" },
  { step: "2", title: "Pick your model", readout: "sonnet or opus, no API key" },
  { step: "3", title: "Launch the assistant", readout: "browser tab or hidden overlay" },
];

const BARS = [24, 52, 88, 41, 70, 33, 96, 58, 27, 74, 46, 82, 35, 61, 29, 90, 44, 68, 31, 55];

function Waveform() {
  return (
    <div className="flex items-end gap-[3px]" aria-hidden="true">
      {BARS.map((height, index) => (
        <span
          key={index}
          className="bar w-[3px] bg-[var(--listening)]"
          style={{
            height: `${height * 0.3}px`,
            animationDelay: `${index * 70}ms`,
            animationDuration: `${700 + (index % 5) * 120}ms`,
          }}
        />
      ))}
    </div>
  );
}

function SessionHeader() {
  return (
    <div className="flex items-center gap-3 border-b border-white/15 px-5 py-3">
      <span
        className="inline-block h-2 w-2 rounded-full bg-[var(--listening)]"
        aria-hidden="true"
      />
      <span className="readout text-[var(--surface)]/70">listening</span>
      <span className="readout ml-auto text-[var(--surface)]/70">claude-sonnet-4-5</span>
    </div>
  );
}

function LivePanel() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--ink)] text-[var(--surface)] shadow-[0_24px_60px_-40px_rgba(13,13,13,0.7)]">
      <SessionHeader />
      <div className="px-5 pb-6 pt-5">
        <Waveform />
        <p className="readout mt-5 text-[var(--surface)]/60">
          them: “…so what did we commit to on the migration date?”
        </p>
        <p className="mt-2 text-xl leading-relaxed sm:text-2xl">
          <span className="stream">March 14, with a one-week buffer.</span>
        </p>
        <p className="readout mt-3 text-[var(--listening)]">
          grounded in rollout-brief.md, line 12
        </p>
      </div>
    </div>
  );
}

function TranscriptMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--ink)] text-[var(--surface)]">
      <SessionHeader />
      <div className="space-y-2 px-5 py-5">
        <Waveform />
        <p className="readout pt-2 text-[var(--surface)]/60">
          them: “…can we still hit the date we promised?”
        </p>
        <p className="readout text-[var(--surface)]/60">you: “let me check the brief.”</p>
      </div>
    </div>
  );
}

function AnswerMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--ink)] text-[var(--surface)]">
      <div className="flex items-center gap-3 border-b border-white/15 px-5 py-3">
        <span className="readout text-[var(--surface)]/70">answering</span>
        <span className="readout ml-auto text-[var(--surface)]/70">first token 0.9s</span>
      </div>
      <div className="space-y-3 px-5 py-5">
        <p className="text-base leading-relaxed">
          March 14, with a one-week buffer — the date you committed to in the rollout brief.
        </p>
        <p className="readout text-[var(--listening)]">grounded in rollout-brief.md, line 12</p>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--paper)]/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-base font-bold tracking-tight">
            OpenCluely
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="#how-it-helps" className="readout hidden hover:text-[var(--signal-deep)] sm:block">
              What it does
            </Link>
            <Link href="#how-it-works" className="readout hidden hover:text-[var(--signal-deep)] sm:block">
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
        <section className="hero-wash">
          <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-20 text-center sm:pb-32 sm:pt-28">
            <h1 className="mx-auto max-w-[18ch] text-[2.8rem] font-extrabold leading-[0.95] tracking-[-0.035em] sm:text-[4.6rem]">
              Answers while the conversation is still happening.
            </h1>
            <p className="mx-auto mt-6 max-w-[48ch] text-lg leading-relaxed text-[var(--graphite)]">
              OpenCluely listens to your meeting, reads your screen, and streams grounded answers
              back — without storing a word of it.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href={session ? "/dashboard" : "/signup"} className="btn btn-primary px-7 py-3.5">
                {session ? "Open dashboard" : "Get started — free"}
              </Link>
              <Link href="#how-it-works" className="btn btn-secondary px-7 py-3.5">
                See how it works
              </Link>
            </div>
            <p className="readout mt-5">Browser or hidden desktop overlay. No API key either way.</p>

            <div className="mx-auto mt-16 max-w-3xl text-left">
              <LivePanel />
            </div>
          </div>
        </section>

        <section id="how-it-helps" className="mx-auto w-full max-w-6xl px-6 py-28 sm:py-36">
          <h2 className="max-w-[20ch] text-4xl font-bold tracking-tight sm:text-5xl">
            How OpenCluely helps during a call
          </h2>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <article className="card-warm p-8">
              <h3 className="text-2xl font-semibold tracking-tight">
                It listens in to the conversation
              </h3>
              <p className="mt-3 max-w-[42ch] text-[0.95rem] leading-relaxed text-[var(--graphite)]">
                Speech is transcribed on your own machine, as it is spoken.
              </p>
              <div className="mt-8">
                <TranscriptMock />
              </div>
            </article>

            <article className="card p-8">
              <h3 className="text-2xl font-semibold tracking-tight">
                It answers the moment you need it
              </h3>
              <p className="mt-3 max-w-[42ch] text-[0.95rem] leading-relaxed text-[var(--graphite)]">
                Claude streams the answer while the question is still in the air.
              </p>
              <div className="mt-8">
                <AnswerMock />
              </div>
            </article>
          </div>

          <ul className="mt-20 grid gap-10 sm:grid-cols-3">
            {TRAITS.map((trait) => (
              <li key={trait.lead}>
                <p className="readout text-[var(--signal-deep)]">{trait.readout}</p>
                <p className="mt-3 text-[1.05rem] leading-relaxed">
                  <span className="font-semibold">{trait.lead}</span>{" "}
                  <span className="text-[var(--graphite)]">{trait.body}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="how-it-works"
          className="border-y border-[var(--rule)] bg-[var(--surface)]"
        >
          <div className="mx-auto w-full max-w-6xl px-6 py-28 sm:py-36">
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">How it works</h2>
            <ol className="mt-14 border-t border-[var(--rule)]">
              {STEPS.map((item) => (
                <li
                  key={item.step}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--rule)] py-10"
                >
                  <span className="marker" aria-hidden="true">
                    {item.step}
                  </span>
                  <h3 className="text-2xl font-semibold tracking-tight">{item.title}</h3>
                  <p className="readout ml-auto text-[var(--signal-deep)]">{item.readout}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="hero-wash">
          <div className="mx-auto w-full max-w-5xl px-6 py-32 text-center sm:py-40">
            <h2 className="mx-auto max-w-[20ch] text-4xl font-bold tracking-tight sm:text-5xl">
              Ready for your next call?
            </h2>
            <p className="mt-5 text-lg text-[var(--graphite)]">
              Sign up and launch it in the same tab.
            </p>
            <Link
              href={session ? "/dashboard" : "/signup"}
              className="btn btn-primary mt-9 px-8 py-4 text-base"
            >
              {session ? "Open dashboard" : "Sign up"}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--rule)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-10">
          <span className="readout">
            OpenCluely — a live assistant for meetings, research and note-taking.
          </span>
          <a
            href="https://github.com/omg775/Open-Cluely"
            className="readout hover:text-[var(--signal-deep)]"
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
