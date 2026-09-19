import {
  consumeLaunchToken,
  createDeviceToken,
  getDocumentContents,
  getSettings,
} from "@/lib/data";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const payload = body as { token?: unknown; label?: unknown };
  const token = typeof payload.token === "string" ? payload.token : "";
  const label = typeof payload.label === "string" ? payload.label.slice(0, 80) : "Desktop app";

  if (!token) {
    return Response.json({ error: "Missing launch token" }, { status: 400 });
  }

  const account = await consumeLaunchToken(token);
  if (!account) {
    return Response.json({ error: "Launch token is expired or already used" }, { status: 401 });
  }

  const [deviceToken, settings, documents] = await Promise.all([
    createDeviceToken(account.userId, label),
    getSettings(account.userId),
    getDocumentContents(account.userId),
  ]);

  return Response.json({
    deviceToken,
    email: account.email,
    settings: { anthropicKey: settings.anthropicKey, model: settings.model },
    documents,
  });
}
