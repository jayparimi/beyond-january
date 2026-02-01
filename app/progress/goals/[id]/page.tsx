"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type CheckinStatus = "complete" | "partial" | "checked_in";

type GoalHeader = {
  id: string;
  custom_title: string | null;
  template_title: string;
  template_category: string;
};

type CheckinRow = {
  checkin_date: string; // YYYY-MM-DD
  status: CheckinStatus;
};

type GoalNotesRow = {
  why: string | null;
  when_hard: string | null;
  updated_at: string | null;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toLocalISODate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseMonthParam(m: string | null): { year: number; month: number } | null {
  if (!m) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(m);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]); // 1..12
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

function monthToParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getMonthInfo(year: number, month: number) {
  const monthIndex = month - 1;
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  return {
    year,
    month,
    monthIndex,
    startISO: toLocalISODate(first),
    endISO: toLocalISODate(last),
    daysInMonth: last.getDate(),
    firstWeekday: first.getDay(), // 0..6
  };
}

function addMonths(year: number, month: number, delta: number) {
  const base = new Date(year, month - 1, 1);
  base.setMonth(base.getMonth() + delta);
  return { year: base.getFullYear(), month: base.getMonth() + 1 };
}

function statusDot(status?: CheckinStatus) {
  if (!status) return "bg-neutral-700";
  if (status === "complete") return "bg-green-400/80";
  if (status === "partial") return "bg-yellow-300/80";
  return "bg-blue-400/80";
}

function tileTone(status?: CheckinStatus) {
  if (!status) return "bg-neutral-900/40 border-neutral-800 text-neutral-400";
  if (status === "complete") return "bg-green-500/10 border-green-400/25 text-green-200";
  if (status === "partial") return "bg-yellow-500/10 border-yellow-400/25 text-yellow-200";
  return "bg-blue-500/10 border-blue-400/25 text-blue-200";
}

function prettyStatus(status?: CheckinStatus) {
  if (!status) return "No check-in";
  if (status === "complete") return "Complete";
  if (status === "partial") return "Partial";
  return "Checked in";
}

export default function GoalProgressPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const goalId =
    typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const mParam = searchParams.get("m");

  const target = useMemo(() => {
    const parsed = parseMonthParam(mParam);
    if (parsed) return parsed;
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, [mParam]);

  const { year, month, monthIndex, startISO, endISO, daysInMonth, firstWeekday } = useMemo(
    () => getMonthInfo(target.year, target.month),
    [target.year, target.month]
  );

  const monthLabel = useMemo(() => {
    const d = new Date(year, monthIndex, 1);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [year, monthIndex]);

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [goal, setGoal] = useState<GoalHeader | null>(null);
  const [byDay, setByDay] = useState<Record<string, CheckinStatus>>({});

  // NEW: goal notes
  const [notes, setNotes] = useState<GoalNotesRow | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErrMsg("");
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      if (!goalId) {
        setErrMsg("Missing goal id.");
        setLoading(false);
        return;
      }

      // Goal header
      const { data: gRow, error: gErr } = await supabase
        .from("user_goals")
        .select(
          `
          id,
          custom_title,
          goal_templates ( title, category )
        `
        )
        .eq("id", goalId)
        .single();

      if (cancelled) return;

      if (gErr) {
        setErrMsg(gErr.message);
        setLoading(false);
        return;
      }

      const tmpl = Array.isArray((gRow as any).goal_templates)
        ? (gRow as any).goal_templates[0]
        : (gRow as any).goal_templates;

      const header: GoalHeader = {
        id: (gRow as any).id,
        custom_title: (gRow as any).custom_title ?? null,
        template_title: tmpl?.title ?? "Goal",
        template_category: tmpl?.category ?? "—",
      };

      // Month checkins
      const { data: rows, error: cErr } = await supabase
        .from("checkins")
        .select("checkin_date,status")
        .eq("user_goal_id", goalId)
        .gte("checkin_date", startISO)
        .lte("checkin_date", endISO);

      if (cancelled) return;

      if (cErr) {
        setErrMsg(cErr.message);
        setLoading(false);
        return;
      }

      const map: Record<string, CheckinStatus> = {};
      (rows as CheckinRow[] | null)?.forEach((r) => {
        map[r.checkin_date] = r.status;
      });

      // NEW: goal notes
      const { data: nRow, error: nErr } = await supabase
        .from("goal_notes")
        .select("why,when_hard,updated_at")
        .eq("user_goal_id", goalId)
        .maybeSingle();

      if (!cancelled && nErr) setErrMsg((prev) => prev || nErr.message);

      setGoal(header);
      setByDay(map);
      setNotes((nRow as GoalNotesRow | null) ?? null);

      // Auto-open the section if there is content
      const hasNotes = !!(nRow?.why || nRow?.when_hard);
      setNotesOpen(hasNotes);

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, goalId, startISO, endISO]);

  function goToMonth(y: number, m: number) {
    router.push(`/progress/goals/${goalId}?m=${monthToParam(y, m)}`);
  }

  const prev = useMemo(() => addMonths(target.year, target.month, -1), [target.year, target.month]);
  const next = useMemo(() => addMonths(target.year, target.month, 1), [target.year, target.month]);

  const goalTitle = goal ? goal.custom_title ?? goal.template_title : "Goal";

  // Month summary
  const daysWithCheckin = useMemo(() => Object.keys(byDay).length, [byDay]);

  const daysElapsed = useMemo(() => {
    if (target.year === currentYear && target.month === currentMonth) {
      return Math.min(new Date().getDate(), daysInMonth);
    }
    return daysInMonth;
  }, [target.year, target.month, currentYear, currentMonth, daysInMonth]);

  const pct = useMemo(() => {
    if (!daysElapsed) return 0;
    return Math.round((daysWithCheckin / daysElapsed) * 100);
  }, [daysWithCheckin, daysElapsed]);

  const hasNotes = !!(notes?.why || notes?.when_hard);

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{goalTitle}</h1>
            <p className="mt-1 text-sm text-neutral-400">{monthLabel}</p>
            {goal && <p className="mt-1 text-xs text-neutral-500">{goal.template_category}</p>}
          </div>

          <button
            onClick={() => router.push(`/progress?m=${monthToParam(target.year, target.month)}`)}
            className="rounded-full border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/70 transition"
          >
            Back to month
          </button>
        </div>

        {errMsg && (
          <div className="mt-6 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
            {errMsg}
          </div>
        )}

        {loading ? (
          <p className="mt-10 text-neutral-400">Loading…</p>
        ) : (
          <>
            {/* Quick summary (simple + modern) */}
            <div className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-neutral-400">This month</div>
                  <div className="mt-1 text-lg font-semibold text-neutral-100">
                    {daysWithCheckin} check-ins • {pct}% of days (so far)
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Showing up counts. “Checked in” is progress.
                  </div>
                </div>

                <button
                  onClick={() => router.push("/today")}
                  className="rounded-full bg-neutral-100 text-neutral-950 px-4 py-2 text-sm font-semibold hover:opacity-95 active:scale-[0.99] transition"
                >
                  Check in today
                </button>
              </div>
            </div>

            {/* NEW: Why this goal matters (collapsible) */}
            <div className="mt-4 rounded-3xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
              <button
                onClick={() => setNotesOpen((v) => !v)}
                className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-neutral-900/60 transition"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-200">Why this goal matters</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {hasNotes ? "Your reminder for hard days." : "Add a short note to anchor the habit."}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cx(
                      "text-xs rounded-full border px-2 py-0.5",
                      hasNotes
                        ? "border-neutral-700 text-neutral-200"
                        : "border-neutral-800 text-neutral-400"
                    )}
                  >
                    {hasNotes ? "Saved" : "Empty"}
                  </span>
                  <span className="text-neutral-400">{notesOpen ? "–" : "+"}</span>
                </div>
              </button>

              {notesOpen && (
                <div className="px-5 pb-5 pt-0">
                  {!hasNotes ? (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <p className="text-sm text-neutral-400">
                        You haven’t written anything for this goal yet. Add a “why” in My Notes.
                      </p>
                      <div className="mt-3">
                        <button
                          onClick={() => router.push(`/notes?panel=goal_whys&goalId=${goalId}`)}
                          className="rounded-full border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/70 transition"
                        >
                          Add in My Notes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {notes?.why && (
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                          <div className="text-xs uppercase tracking-wide text-neutral-500">
                            Why it matters
                          </div>
                          <p className="mt-2 text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
                            {notes.why}
                          </p>
                        </div>
                      )}

                      {notes?.when_hard && (
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                          <div className="text-xs uppercase tracking-wide text-neutral-500">
                            When it’s hard
                          </div>
                          <p className="mt-2 text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
                            {notes.when_hard}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => router.push(`/notes?panel=goal_whys&goalId=${goalId}`)}
                          className="rounded-full border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/70 transition"
                        >
                          Edit in My Notes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Month nav */}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => goToMonth(prev.year, prev.month)}
                className="rounded-full border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
              >
                ← Prev
              </button>

              <div
                className={cx(
                  "rounded-full border px-4 py-2 text-sm",
                  target.year === currentYear && target.month === currentMonth
                    ? "border-neutral-500/60 bg-neutral-900 text-neutral-100"
                    : "border-neutral-800 bg-neutral-900/40 text-neutral-200"
                )}
                title={target.year === currentYear && target.month === 2 ? "Movement month" : undefined}
              >
                {monthLabel}
                {target.year === currentYear && target.month === 2 && (
                  <span className="ml-2 text-xs text-neutral-400">• Movement</span>
                )}
              </div>

              <button
                onClick={() => goToMonth(next.year, next.month)}
                className="rounded-full border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
              >
                Next →
              </button>
            </div>

            {/* Month grid */}
            <div className="mt-6">
              <div className="grid grid-cols-7 gap-2 text-xs text-neutral-500 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
                  <div key={w} className="px-1">
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <div key={`blank-${i}`} className="h-20 rounded-xl border border-transparent" />
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => {
                  const dayNum = i + 1;
                  const dateISO = toLocalISODate(new Date(year, monthIndex, dayNum));
                  const status = byDay[dateISO];

                  return (
                    <button
                      key={dateISO}
                      type="button"
                      onClick={() => router.push(`/today?goalId=${goalId}&editDate=${dateISO}`)}
                      className={cx(
                        "h-20 rounded-2xl border p-2 flex flex-col justify-between text-left transition",
                        "hover:brightness-110 hover:border-neutral-600/60 cursor-pointer",
                        tileTone(status)
                      )}
                      title={`${dateISO}: ${prettyStatus(status)}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium">{dayNum}</div>
                        <span className={cx("h-2.5 w-2.5 rounded-full", statusDot(status))} />
                      </div>

                      <div className="text-[11px] opacity-90">{status ? prettyStatus(status) : "—"}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-6 text-xs text-neutral-600">January counts. February begins.</div>
          </>
        )}
      </div>
    </main>
  );
}
