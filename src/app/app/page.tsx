import { redirect } from "next/navigation";
import { QuestClient } from "@/components/QuestClient";
import { getAppSession } from "@/lib/get-app-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppHomePage() {
  const session = await getAppSession();
  if (!session) redirect("/login");
  return <QuestClient user={session.user} persistence={session.persistence} />;
}
