"use client";

import { useState } from "react";
import { mintLaunchToken } from "@/app/actions/dashboard";

type Props = {
  webBaseUrl: string;
  hasKey: boolean;
  model: string;
  documentCount: number;
};

export function LaunchPanel({ webBaseUrl, hasKey, model, documentCount }: Props) {
  const [status, setStatus] = useState<"idle" | "working" | "launched" | "error">("idle");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deepLink = token
    ? `opencluely://auth?token=${encodeURIComponent(token)}&api=${encodeURIComponent(webBaseUrl)}`
    : null;

  async function launch() {
    setStatus("working");
    setError(null);

    try {
      const result = await mintLaunchToken();
      const url = `opencluely://auth?token=${encodeURIComponent(result.token)}&api=${encodeURIComponent(webBaseUrl)}`;
      setToken(result.token);
      setStatus("launched");
      window.location.href = url;
    } catch {
      setStatus("error");
      setError("Could not create a launch link. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="panel p-6">
        <h2 className="text-base font-medium">One-click launch</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Opens the installed desktop app and hands it a single-use token, valid for two minutes. The
          app exchanges it for your key{documentCount > 0 ? ", model and grounding documents" : " and model"}.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary px-5 py-2.5"
            onClick={launch}
            disabled={status === "working"}
          >
            {status === "working" ? "Preparing…" : "Launch assistant"}
          </button>
          <span className="text-xs text-[var(--muted)]">
            {hasKey ? `Using ${model}` : "No API key saved — the app will ask for one"}
          </span>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        ) : null}

        {status === "launched" && deepLink ? (
          <div className="mt-4 rounded-lg border border-[var(--border)] p-4 text-sm">
            <p>
              Your browser should have asked to open OpenCluely. Nothing happened? The app is
              probably not installed or not registered yet — follow the setup below, then use this
              link:
            </p>
            <code className="mt-2 block truncate rounded bg-black/40 px-3 py-2 font-mono text-xs">
              {deepLink}
            </code>
            <button
              type="button"
              className="btn btn-secondary mt-3 py-1 text-xs"
              onClick={() => navigator.clipboard.writeText(deepLink)}
            >
              Copy link
            </button>
          </div>
        ) : null}
      </div>

      <div className="panel p-6">
        <h2 className="text-base font-medium">Don&apos;t have the desktop app yet?</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          The assistant captures your screen and audio locally, so it runs on your machine rather
          than in this tab. Clone and start it once — after that the launch button finds it.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-black/40 p-4 font-mono text-xs leading-relaxed">
{`git clone https://github.com/omg775/Open-Cluely.git
cd Open-Cluely
./setup.sh      # installs ffmpeg + whisper.cpp for local transcription
npm start`}
        </pre>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Starting the app once registers the <code className="font-mono">opencluely://</code>{" "}
          handler with your OS.
        </p>
      </div>
    </div>
  );
}
