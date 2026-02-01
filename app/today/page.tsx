import { Suspense } from "react";
import TodayClient from "./TodayClient";

export default function TodayPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
          <p className="text-neutral-400">Loading…</p>
        </main>
      }
    >
      <TodayClient />
    </Suspense>
  );
}
