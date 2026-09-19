import { redirect } from "next/navigation";
import { AuthForm } from "@/app/(auth)/AuthForm";
import { login } from "@/app/actions/auth";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  if (await getSession()) {
    redirect("/dashboard");
  }
  return <AuthForm mode="login" action={login} />;
}
