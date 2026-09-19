import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/session";

export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
