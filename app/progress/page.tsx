import { Suspense } from "react";
import ProgressClient from "./ProgressClient";

export default function ProgressPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
          <div className="max-w-4xl mx-auto">
            <p className="mt-10 text-neutral-400">Loading progress…</p>
          </div>
        </main>
      }
    >
      <ProgressClient />
    </Suspense>
  );
}
