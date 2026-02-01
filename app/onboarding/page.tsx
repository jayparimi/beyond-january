"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type GoalTemplate = {
  id: string;
  title: string;
  category: string;
  default_cadence: "daily" | "weekly";
};

const categoryEmoji: Record<string, string> = {
  "Health & Fitness": "🏃‍♀️",
  "Sleep & Routine": "🛌",
  "Learning & Career": "📚",
  "Mind & Mental Health": "🧠",
  "Nutrition & Wellness": "🥗",
  Creativity: "🎨",
  Relationships: "🤝",
  "Life Admin": "✅",
  "Digital Wellness": "📵",
  "Habits & Boundaries": "🧩",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function OnboardingPage() {
  const router = useRouter();

  const [goals, setGoals] = useState<GoalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bottomMsg, setBottomMsg] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("goal_templates")
        .select("id,title,category,default_cadence")
        .order("category", { ascending: true })
        .order("title", { ascending: true });

      if (cancelled) return;

      if (error) {
        setBottomMsg(error.message);
        setLoading(false);
        return;
      }

      setGoals((data ?? []) as GoalTemplate[]);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filteredGoals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return goals;
    return goals.filter(
      (g) => g.title.toLowerCase().includes(q) || g.category.toLowerCase().includes(q)
    );
  }, [goals, query]);

  const goalsByCategory = useMemo(() => {
    const map: Record<string, GoalTemplate[]> = {};
    for (const g of filteredGoals) {
      if (!map[g.category]) map[g.category] = [];
      map[g.category].push(g);
    }
    return map;
  }, [filteredGoals]);

  function toggleGoal(id: string) {
    setBottomMsg("");

    const isSelected = !!selected[id];
    if (!isSelected && selectedCount >= 5) {
      setBottomMsg("You can pick up to 5 goals for now.");
      return;
    }

    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleContinue() {
    try {
      setBottomMsg("");
      setSaving(true);

      const chosenIds = Object.keys(selected).filter((id) => selected[id]);
      if (chosenIds.length === 0) {
        setBottomMsg("Pick at least 1 goal to continue.");
        setSaving(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      // Fetch templates to get default cadence
      const { data: templates, error: fetchErr } = await supabase
        .from("goal_templates")
        .select("id, default_cadence")
        .in("id", chosenIds);

      if (fetchErr) {
        setBottomMsg(fetchErr.message);
        setSaving(false);
        return;
      }

      const rows =
        (templates ?? []).map((t) => ({
          user_id: user.id,
          goal_template_id: t.id,
          cadence: t.default_cadence ?? "daily",
          share_level: "private",
          active: true, // IMPORTANT: re-activate if it already exists
          custom_title: null,
        })) ?? [];

      // ✅ FIX: Use upsert so re-adding a previously removed goal doesn't violate the unique constraint
      const { error: upsertErr } = await supabase
        .from("user_goals")
        .upsert(rows, { onConflict: "user_id,goal_template_id" });

      if (upsertErr) {
        setBottomMsg(upsertErr.message);
        setSaving(false);
        return;
      }

      setSaving(false);
      router.replace("/today");
    } catch (err: any) {
      setBottomMsg(err?.message ?? "Something went wrong saving your goals.");
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-3xl mx-auto px-6 pt-6 pb-28">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.replace("/")}
            className={cx(
              "rounded-full p-2 transition",
              "text-neutral-200 hover:bg-neutral-900 active:scale-[0.98]",
              "focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-950"
            )}
            aria-label="Back"
            title="Back"
          >
            ←
          </button>

          <div className="flex-1 text-center">
            <div className="text-2xl">🗓️</div>
          </div>

          <div className="w-10" />
        </div>

        <h1 className="mt-4 text-4xl font-semibold text-center">Interests</h1>
        <p className="mt-2 text-center text-neutral-400">
          Pick up to 5 goals to track. You can change them and customize them later.
        </p>

        {/* Search + count */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <input
            className={cx(
              "w-full sm:w-96 rounded-full border px-4 py-2 text-sm outline-none",
              "border-neutral-800 bg-neutral-900/40 text-neutral-100 placeholder:text-neutral-500",
              "focus:ring-2 focus:ring-neutral-600"
            )}
            placeholder="Search goals or categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="text-sm text-neutral-400">
            Selected:{" "}
            <span className="font-semibold text-neutral-200">{selectedCount}</span>/5
          </div>
        </div>

        {loading ? (
          <p className="mt-10 text-center text-neutral-400">Loading goals…</p>
        ) : (
          <div className="mt-10 space-y-10">
            {Object.keys(goalsByCategory).length === 0 ? (
              <p className="text-center text-neutral-400">No goals found.</p>
            ) : (
              Object.entries(goalsByCategory).map(([category, items]) => (
                <section key={category}>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <span>{categoryEmoji[category] ?? "✨"}</span>
                    <span>{category}</span>
                  </h2>

                  <div className="mt-4 flex flex-wrap gap-3">
                    {items.map((g) => {
                      const isSelected = !!selected[g.id];

                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGoal(g.id)}
                          className={cx(
                            "rounded-full px-5 py-2 text-sm border transition select-none",
                            "focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-950",
                            "active:scale-[0.98]",
                            isSelected
                              ? "border-neutral-500/60 bg-neutral-900 text-neutral-100"
                              : "border-neutral-800 bg-neutral-900/40 text-neutral-200 hover:bg-neutral-900/70"
                          )}
                        >
                          {g.title}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-800 bg-neutral-950/85 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {bottomMsg && <div className="mb-3 text-sm text-neutral-300">{bottomMsg}</div>}

          <div className="flex items-center gap-4">
            <button
              className={cx(
                "rounded-full border px-4 py-2 text-sm transition",
                "border-neutral-800 bg-neutral-900/40 text-neutral-200 hover:bg-neutral-900/70",
                "focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-950",
                "active:scale-[0.97]"
              )}
              onClick={() => router.replace("/today")}
              type="button"
            >
              Skip
            </button>

            <button
              className={cx(
                "flex-1 rounded-full py-3 text-sm font-semibold transition",
                "bg-neutral-100 text-neutral-950 hover:opacity-90 active:scale-[0.98]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-950"
              )}
              disabled={selectedCount === 0 || saving}
              onClick={handleContinue}
              type="button"
            >
              {saving ? (
                "Saving..."
              ) : (
                <>
                  Continue{" "}
                  <span className="ml-2 text-sm font-semibold text-neutral-700">
                    ({selectedCount}/5)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
