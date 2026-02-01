import { Suspense } from "react";
import NotesClient from "./NotesClient";

export default function NotesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
          <div className="max-w-3xl mx-auto">
            <p className="mt-10 text-neutral-400">Loading notes…</p>
          </div>
        </main>
      }
    >
      <NotesClient />
    </Suspense>
  );
}
