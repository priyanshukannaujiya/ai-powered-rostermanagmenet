import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any).role;
  if (role === "manager" || role === "pod_lead") {
    redirect("/manager");
  }

  redirect("/me");
}

