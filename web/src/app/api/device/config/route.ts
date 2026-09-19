import { getDocumentContents, getSettings } from "@/lib/data";
import { authenticateDevice, unauthorized } from "@/lib/device";

export async function GET(request: Request): Promise<Response> {
  const device = await authenticateDevice(request);
  if (!device) return unauthorized();

  const [settings, documents] = await Promise.all([
    getSettings(device.userId),
    getDocumentContents(device.userId),
  ]);

  return Response.json({
    email: device.email,
    settings: { anthropicKey: settings.anthropicKey, model: settings.model },
    documents,
  });
}
