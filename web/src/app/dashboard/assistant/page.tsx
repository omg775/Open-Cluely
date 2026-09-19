import { AssistantClient } from "@/app/dashboard/assistant/AssistantClient";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export default async function AssistantPage() {
  const user = await requireUser();
  const settings = await getSettings(user.userId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Assistant</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Share the window you are working in and let the tab listen. Screen frames and speech stay
          in this tab except for the single request that answers each question, and nothing spoken is
          stored.
        </p>
      </div>

      <AssistantClient model={settings.model} />
    </div>
  );
}
