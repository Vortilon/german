import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#1a472a] px-4 py-10 text-white">
      <Suspense fallback={<div className="text-xl font-bold">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
