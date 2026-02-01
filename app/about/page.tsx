"use client";

import { useMemo, useState } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Section({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-neutral-900/60 transition"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-neutral-200">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-neutral-500">{subtitle}</div>}
        </div>
        <span className="shrink-0 text-neutral-400">{open ? "–" : "+"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-0 text-sm text-neutral-300 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

export default function AboutPage() {
  const principles = useMemo(
    () => [
      {
        title: "No streak punishment",
        body: "Missing a day is normal. The app won’t shame you, reset you, or treat you like you failed.",
      },
      {
        title: "Showing up counts",
        body: "“Checked in” is a real win. It keeps the habit alive even when your day isn’t perfect.",
      },
      {
        title: "Simple over perfect",
        body: "The system should be easy enough to use on your hardest days — not only your best days.",
      },
    ],
    []
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Hero */}
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6">
          <h1 className="text-3xl font-semibold">About</h1>
          <p className="mt-2 text-sm text-neutral-300 leading-relaxed">
            Beyond January is a calm goal tracker built for consistency — without shame.
          </p>

          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Mission</div>
            <p className="mt-2 text-sm text-neutral-200 leading-relaxed">
              Help people keep going after motivation fades — by making progress feel normal, flexible, and sustainable.
            </p>
          </div>
        </div>

        {/* Key Principles (visible, not overwhelming) */}
        <div className="mt-6">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-semibold text-neutral-200">What we believe</h2>
            <div className="text-xs text-neutral-500">Keep it light. Keep it honest.</div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {principles.map((p) => (
              <div key={p.title} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-sm font-medium text-neutral-200">{p.title}</div>
                <p className="mt-2 text-sm text-neutral-400 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Modern “hide depth” sections */}
        <div className="mt-6 space-y-3">
          <Section
            title="Why no streaks?"
            subtitle="Streaks are motivating… until they aren’t."
            defaultOpen={false}
          >
            <p>
              Streaks can create an “all-or-nothing” mindset. Missing one day can feel like losing everything.
              We’d rather reward consistency over time, even when life is messy.
            </p>
          </Section>

          <Section
            title="Tools beyond the app"
            subtitle="Practical ways to make habits easier."
          >
            <ul className="mt-2 list-disc pl-5 space-y-2 text-neutral-300">
              <li><span className="text-neutral-200">Reduce friction:</span> make the habit the easiest option.</li>
              <li><span className="text-neutral-200">Environment design:</span> cues visible, distractions harder.</li>
              <li><span className="text-neutral-200">Minimum viable effort:</span> a small version keeps you in motion.</li>
              <li><span className="text-neutral-200">Sleep + recovery:</span> regulation makes habits easier.</li>
            </ul>
          </Section>

          <Section
            title="What’s coming"
            subtitle="Only what improves clarity and consistency."
          >
            <ul className="mt-2 list-disc pl-5 space-y-2">
              <li>Better weekly/monthly views</li>
              <li>Optional reflections (lightweight)</li>
              <li>More goal customization</li>
            </ul>
          </Section>
        </div>

        <p className="mt-10 text-xs text-neutral-500">
          The point isn’t perfection. It’s staying in the game.
        </p>
      </div>
    </main>
  );
}
