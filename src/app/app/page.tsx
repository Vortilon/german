import { redirect } from "next/navigation";
import { QuestClient } from "@/components/QuestClient";
import { getAppSession } from "@/lib/get-app-session";

export default async function AppHomePage() {
  const session = await getAppSession();
  if (!session) redirect("/login");
  return <QuestClient user={session.user} persistence={session.persistence} />;
}
