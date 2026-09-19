import { headers } from "next/headers";
import Link from "next/link";
import { LaunchPanel } from "@/app/dashboard/launch/LaunchPanel";
import { requireUser } from "@/lib/auth";
import { getSettings, listDocuments } from "@/lib/data";

async function resolveBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

export default async function LaunchPage() {
  const user = await requireUser();
  const [settings, documents, baseUrl] = await Promise.all([
    getSettings(user.userId),
    listDocuments(user.userId),
    resolveBaseUrl(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Launch assistant</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          The assistant runs in this browser. Screen frames and speech stay in your tab except for
          the single Claude request that answers each question, and nothing spoken is stored.
        </p>
      </div>

      <div className="panel p-6">
        <h2 className="text-base font-medium">Open in this browser</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Nothing to install. Grant screen and microphone permission when the browser asks, and
          answers stream in as questions come up.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href="/dashboard/assistant" className="btn btn-primary px-5 py-2.5">
            Launch assistant
          </Link>
          <span className="text-xs text-[var(--muted)]">
            Using {settings.model}
            {documents.length > 0 ? ` · ${documents.length} grounding document(s)` : ""}
          </span>
        </div>
      </div>

      <LaunchPanel webBaseUrl={baseUrl} model={settings.model} />
    </div>
  );
}
