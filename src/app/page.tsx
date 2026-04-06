import { redirect } from "next/navigation";

/** Middleware already sends `/` → `/app` or `/login`. This is a safe fallback. */
export default function Home() {
  redirect("/app");
}
