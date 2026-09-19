import { startAssistantSession, updateAssistantSession } from "@/lib/data";
import { authenticateDevice, unauthorized } from "@/lib/device";

export async function POST(request: Request): Promise<Response> {
  const device = await authenticateDevice(request);
  if (!device) return unauthorized();

  let model: string | null = null;
  try {
    const body = (await request.json()) as { model?: unknown };
    if (typeof body.model === "string") model = body.model;
  } catch {
    model = null;
  }

  const sessionId = await startAssistantSession(device.userId, model);
  return Response.json({ sessionId });
}

export async function PATCH(request: Request): Promise<Response> {
  const device = await authenticateDevice(request);
  if (!device) return unauthorized();

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

  const toCount = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

  await updateAssistantSession(device.userId, sessionId, {
    durationSeconds: toCount(body.durationSeconds),
    utteranceCount: toCount(body.utteranceCount),
    answerCount: toCount(body.answerCount),
    ended: body.ended === true,
  });

  return Response.json({ ok: true });
}
