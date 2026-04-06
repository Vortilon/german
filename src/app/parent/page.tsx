import Link from "next/link";
import { redirect } from "next/navigation";
import { ParentLocalView } from "@/app/parent/ParentLocalView";
import { getAppSession } from "@/lib/get-app-session";
import { fetchHomeworkWeek } from "@/lib/homework-db";
import { getWeekStartIso } from "@/lib/week";
import type { ParentReport } from "@/lib/homework-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ParentPage() {
  const session = await getAppSession();
  if (!session) redirect("/login");

  const week = getWeekStartIso();

  if (session.persistence === "local") {
    return (
      <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 px-4 py-10 text-white">
        <div className="rounded-2xl border-4 border-[#5c4033] bg-[#2d6a4f] p-6 shadow-[6px_6px_0_#2d1f18]">
          <h1 className="text-3xl font-black">Parent dashboard</h1>
          <p className="mt-2 text-sm text-white/80">Week of {week}</p>
          <Link
            href="/app"
            className="mt-4 inline-block rounded-lg border-2 border-[#2d1f18] bg-[#f4d03f] px-4 py-2 text-sm font-black text-[#2d1f18]"
          >
            Back to quest
          </Link>
        </div>
        <ParentLocalView userId={session.user.id} />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=config");

  const row = await fetchHomeworkWeek(supabase, session.user.id, week);
  const report = row?.parent_report as ParentReport | null | undefined;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 px-4 py-10 text-white">
      <div className="rounded-2xl border-4 border-[#5c4033] bg-[#2d6a4f] p-6 shadow-[6px_6px_0_#2d1f18]">
        <h1 className="text-3xl font-black">Parent dashboard</h1>
        <p className="mt-2 text-sm text-white/80">
          Same login as Elio — week of {week}
        </p>
        <Link
          href="/app"
          className="mt-4 inline-block rounded-lg border-2 border-[#2d1f18] bg-[#f4d03f] px-4 py-2 text-sm font-black text-[#2d1f18]"
        >
          Back to quest
        </Link>
      </div>

      <div className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
        <h2 className="text-xl font-black">Latest report</h2>
        {!report ? (
          <p className="mt-3 text-sm text-white/90">
            No report yet — finish step (h) on the quest screen.
          </p>
        ) : (
          <pre className="mt-4 overflow-auto rounded-lg bg-black/30 p-4 text-sm leading-relaxed">
            {JSON.stringify(report, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
