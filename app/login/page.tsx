import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // An already-signed-in visitor landing here (bookmark, PWA start URL, browser
  // autocomplete) must not be asked to log in again — that reads as "it forgot
  // me" even though the session cookie is perfectly valid.
  if (await getCurrentUserId()) redirect("/");
  return <AuthForm mode="login" />;
}
