import "server-only";
import { resolveDeviceToken } from "@/lib/data";

export async function authenticateDevice(
  request: Request
): Promise<{ userId: string; email: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  return resolveDeviceToken(token);
}

export function unauthorized(): Response {
  return Response.json({ error: "Invalid or revoked device token" }, { status: 401 });
}
