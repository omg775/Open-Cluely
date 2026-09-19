import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-semibold">
              DevinAi
            </Link>
            <nav className="flex items-center gap-4 text-sm text-[var(--muted)]">
              <Link href="/dashboard" className="hover:text-[var(--foreground)]">
                Overview
              </Link>
              <Link href="/dashboard/settings" className="hover:text-[var(--foreground)]">
                Settings
              </Link>
              <Link href="/dashboard/assistant" className="hover:text-[var(--foreground)]">
                Assistant
              </Link>
              <Link href="/dashboard/launch" className="hover:text-[var(--foreground)]">
                Desktop app
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            <span className="hidden sm:inline">{user.email}</span>
            <form action={logout}>
              <button type="submit" className="btn btn-secondary py-1.5">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
