"use client";

import { useState } from "react";
import { mintLaunchToken } from "@/app/actions/dashboard";

type Props = {
  webBaseUrl: string;
  model: string;
};

export function LaunchPanel({ webBaseUrl, model }: Props) {
  const [status, setStatus] = useState<"idle" | "working" | "launched" | "error">("idle");
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setStatus("working");
    setError(null);

    try {
      const result = await mintLaunchToken();
      const url = `opencluely://auth?token=${encodeURIComponent(result.token)}&api=${encodeURIComponent(webBaseUrl)}`;
      setDeepLink(url);
      setStatus("launched");
      window.location.href = url;
    } catch {
      setStatus("error");
      setError("Could not create a launch link. Try again.");
    }
  }

  return (
    <div className="panel p-6">
      <h2 className="text-base font-medium">Optional: the desktop app</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        A browser tab cannot hide itself from a screen share, and it cannot capture the other
        party&apos;s audio without sharing a tab that plays it. The desktop build keeps the
        always-on-top overlay, global hotkeys and system-loopback capture, and links to this account
        with a single-use token valid for two minutes ({model} and your documents come with it).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={launch}
          disabled={status === "working"}
        >
          {status === "working" ? "Preparing…" : "Open the desktop app"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      {status === "launched" && deepLink ? (
        <div className="mt-4 rounded-lg border border-[var(--border)] p-4 text-sm">
          <p>
            Your browser should have asked to open OpenCluely. Nothing happened? The app is probably
            not installed yet — set it up below, then use this link:
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

      <pre className="mt-4 overflow-x-auto rounded-lg bg-black/40 p-4 font-mono text-xs leading-relaxed">
{`git clone https://github.com/omg775/Open-Cluely.git
cd Open-Cluely
./setup.sh      # installs ffmpeg + whisper.cpp for local transcription
npm start`}
      </pre>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Starting the app once registers the <code className="font-mono">opencluely://</code> handler
        with your OS. The desktop build calls Claude with its own key from{" "}
        <code className="font-mono">.env</code>.
      </p>
    </div>
  );
}
