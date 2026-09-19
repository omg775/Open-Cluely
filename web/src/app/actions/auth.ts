"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail } from "@/lib/data";
import { createSession, deleteSession } from "@/lib/session";

export type AuthState = { error: string | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readCredentials(formData: FormData): { email: string; password: string } | null {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return null;
  return { email, password };
}

export async function signup(_state: AuthState, formData: FormData): Promise<AuthState> {
  const credentials = readCredentials(formData);
  if (!credentials) {
    return { error: "Email and password are required." };
  }
  if (!EMAIL_PATTERN.test(credentials.email)) {
    return { error: "Enter a valid email address." };
  }
  if (credentials.password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const existing = await findUserByEmail(credentials.email);
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  let user;
  try {
    user = await createUser(credentials.email, await bcrypt.hash(credentials.password, 10));
  } catch (error) {
    // 23505: a concurrent signup won the race on the unique email index.
    if ((error as { code?: string }).code === "23505") {
      return { error: "An account with that email already exists." };
    }
    throw error;
  }

  await createSession({ userId: user.id, email: user.email });
  redirect("/dashboard");
}

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const credentials = readCredentials(formData);
  if (!credentials) {
    return { error: "Email and password are required." };
  }

  const user = await findUserByEmail(credentials.email);
  if (!user || !(await bcrypt.compare(credentials.password, user.password_hash))) {
    return { error: "Incorrect email or password." };
  }

  await createSession({ userId: user.id, email: user.email });
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}
