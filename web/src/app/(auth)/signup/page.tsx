import { redirect } from "next/navigation";
import { AuthForm } from "@/app/(auth)/AuthForm";
import { signup } from "@/app/actions/auth";
import { getSession } from "@/lib/session";

export default async function SignupPage() {
  if (await getSession()) {
    redirect("/dashboard");
  }
  return <AuthForm mode="signup" action={signup} />;
}
