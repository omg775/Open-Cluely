import { getSession } from "@/lib/session";
import { getSettings, startAssistantSession, updateAssistantSession } from "@/lib/data";

const toCount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

export async function POST(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in first" }, { status: 401 });
  }

  const settings = await getSettings(session.userId);
  const sessionId = await startAssistantSession(session.userId, settings.model);
  return Response.json({ sessionId, model: settings.model });
}

export async function PATCH(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in first" }, { status: 401 });
  }

  let body: {
    sessionId?: unknown;
    durationSeconds?: unknown;
    utteranceCount?: unknown;
    answerCount?: unknown;
    ended?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  await updateAssistantSession(session.userId, sessionId, {
    durationSeconds: toCount(body.durationSeconds),
    utteranceCount: toCount(body.utteranceCount),
    answerCount: toCount(body.answerCount),
    ended: body.ended === true,
  });

  return Response.json({ ok: true });
}
