import { redirect } from "next/navigation";
import { QuestClient } from "@/components/QuestClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppHomePage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=config");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <QuestClient user={user} />;
}
