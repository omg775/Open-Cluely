import { removeDocument, revokeDevice } from "@/app/actions/dashboard";
import { ApiKeyForm, DocumentUploadForm, ModelForm } from "@/app/dashboard/settings/SettingsForms";
import { requireUser } from "@/lib/auth";
import { maskKey } from "@/lib/crypto";
import { getSettings, listDeviceTokens, listDocuments, MODELS } from "@/lib/data";

function formatWhen(date: Date | null): string {
  if (!date) return "never";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, documents, devices] = await Promise.all([
    getSettings(user.userId),
    listDocuments(user.userId),
    listDeviceTokens(user.userId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          These travel to the desktop app the next time you launch it.
        </p>
      </div>

      <section className="panel p-6">
        <h2 className="text-base font-medium">Anthropic key</h2>
        <div className="mt-4">
          <ApiKeyForm maskedKey={settings.anthropicKey ? maskKey(settings.anthropicKey) : null} />
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="text-base font-medium">Model preference</h2>
        <div className="mt-4">
          <ModelForm model={settings.model} models={MODELS} />
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="text-base font-medium">Document grounding</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Uploaded documents are sent to the assistant on launch and used to ground its answers.
        </p>
        <div className="mt-4">
          <DocumentUploadForm />
        </div>

        {documents.length > 0 ? (
          <ul className="mt-6 flex flex-col gap-2">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3 text-sm"
              >
                <span className="truncate">{document.filename}</span>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {Math.max(1, Math.round(document.size_bytes / 1024))} KB ·{" "}
                  {formatWhen(document.created_at)}
                </span>
                <form action={removeDocument}>
                  <input type="hidden" name="documentId" value={document.id} />
                  <button type="submit" className="btn btn-secondary py-1 text-xs">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel p-6">
        <h2 className="text-base font-medium">Linked desktop apps</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Each launch links the desktop app to this account with its own revocable token.
        </p>
        {devices.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">No desktop app linked yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {devices.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3 text-sm"
              >
                <span>{device.label ?? "Desktop app"}</span>
                <span className="text-xs text-[var(--muted)]">
                  linked {formatWhen(device.created_at)} · last used {formatWhen(device.last_used_at)}
                </span>
                <form action={revokeDevice}>
                  <input type="hidden" name="deviceId" value={device.id} />
                  <button type="submit" className="btn btn-secondary py-1 text-xs">
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
