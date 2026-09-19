import { headers } from "next/headers";
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
          OpenCluely is a desktop app — it captures your screen and audio locally and never uploads
          them.
        </p>
      </div>

      <LaunchPanel
        webBaseUrl={baseUrl}
        hasKey={Boolean(settings.anthropicKey)}
        model={settings.model}
        documentCount={documents.length}
      />
    </div>
  );
}
