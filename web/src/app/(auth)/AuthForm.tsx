"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/actions/auth";

type Props = {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
};

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, { error: null });
  const isSignup = mode === "signup";

  return (
    <div className="mx-auto w-full max-w-sm px-6 py-20">
      <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
        ← OpenCluely
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {isSignup
          ? "Email and password only — there is no API key to bring."
          : "Log in to reach your dashboard and launch the assistant."}
      </p>

      <form action={formAction} className="panel mt-8 flex flex-col gap-4 p-6">
        <label className="flex flex-col gap-2 text-sm">
          Email
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Password
          <input
            className="input"
            type="password"
            name="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 8 : undefined}
            placeholder={isSignup ? "At least 8 characters" : ""}
          />
        </label>

        {state.error ? (
          <p role="alert" className="text-sm text-red-400">
            {state.error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Working…" : isSignup ? "Create account" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-[var(--muted)]">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--accent)]">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="text-[var(--accent)]">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
