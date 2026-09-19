import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listSessions, sessionTotals } from "@/lib/data";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [sessions, totals] = await Promise.all([
    listSessions(user.userId),
    sessionTotals(user.userId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Session metadata only — no transcripts, screenshots or answers are ever stored.
          </p>
        </div>
        <Link href="/dashboard/assistant" className="btn btn-primary px-5 py-2.5">
          Launch assistant
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Sessions</p>
          <p className="mt-2 text-3xl font-semibold">{totals.sessions}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Listening time</p>
          <p className="mt-2 text-3xl font-semibold">{totals.minutes}m</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Answers delivered</p>
          <p className="mt-2 text-3xl font-semibold">{totals.answers}</p>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-base font-medium">Recent sessions</h2>
        </div>
        {sessions.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--muted)]">
            No sessions yet. Launch the assistant and each run reports its start time and duration
            here.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3 font-normal">Started</th>
                <th className="px-5 py-3 font-normal">Duration</th>
                <th className="px-5 py-3 font-normal">Utterances</th>
                <th className="px-5 py-3 font-normal">Answers</th>
                <th className="px-5 py-3 font-normal">Model</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-t border-[var(--border)]">
                  <td className="px-5 py-3">{formatWhen(new Date(session.started_at))}</td>
                  <td className="px-5 py-3">{formatDuration(session.duration_seconds)}</td>
                  <td className="px-5 py-3">{session.utterance_count}</td>
                  <td className="px-5 py-3">{session.answer_count}</td>
                  <td className="px-5 py-3 text-[var(--muted)]">{session.model ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
