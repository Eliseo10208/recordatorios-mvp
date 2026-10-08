import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardClient } from "@/features/auth/dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <DashboardClient />;
}
