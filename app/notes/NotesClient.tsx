"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Panel = "general" | "long_term" | "goal_whys";

type UserGoal = {
  id: string;
  custom_title: string | null;
  template_title: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toTitle(goal: UserGoal) {
  return goal.custom_title ?? goal.template_title ?? "Goal";
}

function isPanel(x: string | null): x is Panel {
  return x === "general" || x === "long_term" || x === "goal_whys";
}

export default function NotesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const deepLinkAppliedRef = useRef(false);

  const deepPanel = searchParams.get("panel");
  const deepGoalId = searchParams.get("goalId");

  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>("general");
  const [errMsg, setErrMsg] = useState("");

  const [userId, setUserId] = useState<string | null>(null);

  // user_notes
  const [generalNotes, setGeneralNotes] = useState("");
  const [longTermGoals, setLongTermGoals] = useState("");
  const [savingUserNotes, setSavingUserNotes] = useState(false);

  // goals + per-goal notes
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [goalWhy, setGoalWhy] = useState("");
  const [goalWhenHard, setGoalWhenHard] = useState("");
  const [savingGoalNotes, setSavingGoalNotes] = useState(false);

  // Apply deep link panel ASAP (once)
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;

    if (isPanel(deepPanel)) {
      setPanel(deepPanel);
    }
    // don't mark applied yet: goalId selection needs goals loaded
  }, [deepPanel]);

  const prompts = useMemo(() => {
    if (panel === "general") {
      return [
        "What did I do well lately (even if small)?",
        "What made this week harder than expected?",
        "What’s one tiny adjustment that would make tomorrow easier?",
      ];
    }
    if (panel === "long_term") {
      return [
        "What kind of person am I becoming this year?",
        "What do I want my life to look like in 12–24 months?",
        "What do I want to protect (energy, health, relationships, craft)?",
      ];
    }
    return [
      "Why does this goal matter to me (not to others)?",
      "What will I feel if I stay consistent for 3 months?",
      "When it’s hard, what’s my smallest acceptable version?",
    ];
  }, [panel]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrMsg("");

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        setErrMsg(sessionErr.message);
        setLoading(false);
        return;
      }
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const uid = sessionData.session.user.id;
      setUserId(uid);

      // Load user_notes (maybe empty)
      const { data: uNotes, error: uErr } = await supabase
        .from("user_notes")
        .select("general_notes,long_term_goals")
        .eq("user_id", uid)
        .maybeSingle();

      if (!cancelled && uErr) setErrMsg(uErr.message);

      if (!cancelled) {
        setGeneralNotes(uNotes?.general_notes ?? "");
        setLongTermGoals(uNotes?.long_term_goals ?? "");
      }

      // Load goals
      const { data: goalsData, error: goalsErr } = await supabase
        .from("user_goals")
        .select(
          `
          id,
          custom_title,
          goal_templates ( title )
        `
        )
        .eq("active", true)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (goalsErr) {
        setErrMsg(goalsErr.message);
        setGoals([]);
        setSelectedGoalId(null);
      } else {
        const normalized: UserGoal[] = (goalsData ?? []).map((row: any) => {
          const tmpl = Array.isArray(row.goal_templates) ? row.goal_templates[0] : row.goal_templates;
          return {
            id: row.id,
            custom_title: row.custom_title ?? null,
            template_title: tmpl?.title ?? "Goal",
          };
        });

        setGoals(normalized);

        // Apply deep link goal selection (once, after goals are known)
        if (!deepLinkAppliedRef.current) {
          const requestedPanel = isPanel(deepPanel) ? deepPanel : null;
          const requestedGoal = deepGoalId;

          if (requestedPanel) setPanel(requestedPanel);

          if (requestedGoal && normalized.some((g) => g.id === requestedGoal)) {
            setSelectedGoalId(requestedGoal);
          } else {
            setSelectedGoalId(normalized[0]?.id ?? null);
          }

          deepLinkAppliedRef.current = true;
        } else {
          // Normal behavior if no deep link or already applied
          setSelectedGoalId((prev) => prev ?? normalized[0]?.id ?? null);
        }
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, deepPanel, deepGoalId]);

  // whenever selectedGoalId changes, load its goal_notes
  useEffect(() => {
    let cancelled = false;

    async function loadGoalNotes() {
      if (!selectedGoalId) return;
      setErrMsg("");

      const { data, error } = await supabase
        .from("goal_notes")
        .select("why,when_hard")
        .eq("user_goal_id", selectedGoalId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setErrMsg(error.message);
        return;
      }

      setGoalWhy(data?.why ?? "");
      setGoalWhenHard(data?.when_hard ?? "");
    }

    loadGoalNotes();
    return () => {
      cancelled = true;
    };
  }, [selectedGoalId]);

  async function saveUserNotes() {
    if (!userId) return;
    setSavingUserNotes(true);
    setErrMsg("");

    const { error } = await supabase
      .from("user_notes")
      .upsert(
        {
          user_id: userId,
          general_notes: generalNotes,
          long_term_goals: longTermGoals,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) setErrMsg(error.message);
    setSavingUserNotes(false);
  }

  async function saveGoalNotes() {
    if (!selectedGoalId) return;
    setSavingGoalNotes(true);
    setErrMsg("");

    const { error } = await supabase
      .from("goal_notes")
      .upsert(
        {
          user_goal_id: selectedGoalId,
          why: goalWhy,
          when_hard: goalWhenHard,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_goal_id" }
      );

    if (error) setErrMsg(error.message);
    setSavingGoalNotes(false);
  }

  function TabButton({ id, label }: { id: Panel; label: string }) {
    const active = panel === id;
    return (
      <button
        onClick={() => setPanel(id)}
        className={cx(
          "rounded-full border px-4 py-2 text-sm transition",
          active
            ? "border-neutral-500/60 bg-neutral-100 text-neutral-950 font-semibold"
            : "border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-900/70"
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">My Notes</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Light prompts. No pressure. This is here to remind you why you’re doing this.
            </p>
          </div>

          <button
            onClick={() => router.push("/today")}
            className="rounded-full border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
          >
            Back to Today
          </button>
        </div>

        {errMsg && (
          <div className="mt-6 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
            {errMsg}
          </div>
        )}

        {loading ? (
          <p className="mt-10 text-neutral-400">Loading notes…</p>
        ) : (
          <>
            {/* tabs */}
            <div className="mt-6 flex flex-wrap gap-2">
              <TabButton id="general" label="General" />
              <TabButton id="goal_whys" label="My Whys" />
              <TabButton id="long_term" label="Long-term" />
            </div>

            {/* prompts bar */}
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Prompts</div>
              <ul className="mt-2 text-sm text-neutral-300 list-disc pl-5 space-y-1">
                {prompts.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>

            {/* panel content */}
            <div className="mt-4 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-5">
              {panel === "general" && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold text-neutral-200">General notes</div>
                    <button
                      onClick={saveUserNotes}
                      disabled={savingUserNotes}
                      className={cx(
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        savingUserNotes
                          ? "bg-neutral-700 text-neutral-300 cursor-not-allowed"
                          : "bg-neutral-100 text-neutral-950 hover:opacity-95"
                      )}
                    >
                      {savingUserNotes ? "Saving…" : "Save"}
                    </button>
                  </div>

                  <textarea
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    placeholder="Write anything here. A quick reflection, a reminder, a truth you want to keep."
                    className="mt-4 w-full min-h-[220px] rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-500"
                  />
                </>
              )}

              {panel === "long_term" && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold text-neutral-200">Long-term goals</div>
                    <button
                      onClick={saveUserNotes}
                      disabled={savingUserNotes}
                      className={cx(
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        savingUserNotes
                          ? "bg-neutral-700 text-neutral-300 cursor-not-allowed"
                          : "bg-neutral-100 text-neutral-950 hover:opacity-95"
                      )}
                    >
                      {savingUserNotes ? "Saving…" : "Save"}
                    </button>
                  </div>

                  <textarea
                    value={longTermGoals}
                    onChange={(e) => setLongTermGoals(e.target.value)}
                    placeholder="What do you want your life to look like in 12–24 months? Keep it simple and honest."
                    className="mt-4 w-full min-h-[220px] rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-500"
                  />
                </>
              )}

              {panel === "goal_whys" && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-neutral-200">Why this goal matters</div>
                      <p className="mt-1 text-sm text-neutral-400">
                        Pick a goal, then write the “why” you want to remember.
                      </p>
                    </div>

                    <button
                      onClick={saveGoalNotes}
                      disabled={savingGoalNotes || !selectedGoalId}
                      className={cx(
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        savingGoalNotes || !selectedGoalId
                          ? "bg-neutral-700 text-neutral-300 cursor-not-allowed"
                          : "bg-neutral-100 text-neutral-950 hover:opacity-95"
                      )}
                    >
                      {savingGoalNotes ? "Saving…" : "Save"}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {goals.length === 0 ? (
                      <div className="text-sm text-neutral-400">No goals yet.</div>
                    ) : (
                      goals.map((g) => {
                        const active = selectedGoalId === g.id;
                        return (
                          <button
                            key={g.id}
                            onClick={() => setSelectedGoalId(g.id)}
                            className={cx(
                              "rounded-full border px-4 py-2 text-sm transition",
                              active
                                ? "border-neutral-500/60 bg-neutral-100 text-neutral-950 font-semibold"
                                : "border-neutral-800 bg-neutral-950/40 text-neutral-300 hover:bg-neutral-900/70"
                            )}
                          >
                            {toTitle(g)}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="text-sm font-medium text-neutral-200">Prompt: Why is this goal important?</div>
                      <textarea
                        value={goalWhy}
                        onChange={(e) => setGoalWhy(e.target.value)}
                        placeholder="Because… (make it personal, not impressive)"
                        className="mt-3 w-full min-h-[120px] rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-500"
                      />
                    </div>

                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="text-sm font-medium text-neutral-200">
                        Prompt: When it’s hard, what’s my smallest acceptable version?
                      </div>
                      <textarea
                        value={goalWhenHard}
                        onChange={(e) => setGoalWhenHard(e.target.value)}
                        placeholder="On hard days, I will… (2 minutes counts)"
                        className="mt-3 w-full min-h-[120px] rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-500"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
