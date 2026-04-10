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
      <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 px-4 py-10 text-stone-800">
        <div className="rounded-2xl border border-stone-300 bg-stone-100 p-6 shadow-sm">
          <h1 className="text-3xl font-black">Parent dashboard</h1>
          <p className="mt-2 text-sm text-stone-600">Week of {week}</p>
          <Link
            href="/app"
            className="mt-4 inline-block rounded-lg border border-stone-400 bg-stone-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Back to quest
          </Link>
        </div>
        <ParentLocalView userId={session.user.email ?? session.user.id} />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=config");

  const row = await fetchHomeworkWeek(supabase, session.user.id, week);
  const report = row?.parent_report as ParentReport | null | undefined;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 px-4 py-10 text-stone-800">
      <div className="rounded-2xl border border-stone-300 bg-stone-100 p-6 shadow-sm">
        <h1 className="text-3xl font-black">Parent dashboard</h1>
        <p className="mt-2 text-sm text-stone-600">
          Same login as Elio — week of {week}
        </p>
        <Link
          href="/app"
          className="mt-4 inline-block rounded-lg border border-stone-400 bg-stone-800 px-4 py-2 text-sm font-semibold text-white"
        >
          Back to quest
        </Link>
      </div>

      <div className="rounded-2xl border border-stone-300 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-black">Latest report</h2>
        {!report ? (
          <p className="mt-3 text-sm text-stone-700">
            No report yet — finish step (h) on the quest screen.
          </p>
        ) : (
          <pre className="mt-4 overflow-auto rounded-lg bg-stone-100 p-4 text-sm leading-relaxed text-stone-800">
            {JSON.stringify(report, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
