import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/get-app-session";
import { getWeekStartIso } from "@/lib/week";
import { AdminHomeworkWeekClient } from "@/components/AdminHomeworkWeekClient";

export default async function AdminPage() {
  const session = await getAppSession();
  if (!session) redirect("/login");
  return <AdminHomeworkWeekClient defaultWeekStart={getWeekStartIso()} />;
}

