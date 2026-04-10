import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-stone-100 px-4 py-10">
      <Suspense fallback={<div className="text-xl font-bold">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
