"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type CheckinStatus = "complete" | "partial" | "checked_in";

type UserGoal = {
  id: string;
  custom_title: string | null;
  template_title: string;
};

type CheckinRow = {
  user_goal_id: string;
  checkin_date: string; // YYYY-MM-DD
  status: CheckinStatus;
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
  const month = Number(match[2]);
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
    firstWeekday: first.getDay(),
  };
}

function addMonths(year: number, month: number, delta: number) {
  const base = new Date(year, month - 1, 1);
  base.setMonth(base.getMonth() + delta);
  return { year: base.getFullYear(), month: base.getMonth() + 1 };
}

function daysUntilFeb1() {
  const now = new Date();
  const year = now.getFullYear();
  const feb1 = new Date(year, 1, 1);
  if (now >= feb1) return null;
  const diffMs = feb1.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

type DayAgg = { complete: number; partial: number; checked_in: number; total: number };

function dominantTone(stats?: DayAgg) {
  if (!stats || stats.total === 0) return "empty";
  const c = stats.complete ?? 0;
  const p = stats.partial ?? 0;
  const ci = stats.checked_in ?? 0;
  if (c >= p && c >= ci) return "complete";
  if (p >= c && p >= ci) return "partial";
  return "checked_in";
}

function buildUrl(pathname: string, params: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && String(v).length > 0) sp.set(k, String(v));
  });
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function titleForGoal(g: UserGoal) {
  return g.custom_title ?? g.template_title ?? "Goal";
}

function statusLabel(s?: CheckinStatus) {
  if (!s) return "—";
  if (s === "complete") return "✅ Complete";
  if (s === "partial") return "🟨 Partial";
  return "🤝 Checked in";
}

function dayTone(stats?: DayAgg) {
  const tone = dominantTone(stats);
  if (tone === "empty") return "bg-neutral-900/40 border-neutral-800 text-neutral-400";
  if (tone === "complete") return "bg-green-500/10 border-green-400/25 text-green-200";
  if (tone === "partial") return "bg-yellow-500/10 border-yellow-400/25 text-yellow-200";
  return "bg-blue-500/10 border-blue-400/25 text-blue-200";
}

function Chip({
  children,
  selected,
  disabled,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "neutral" | "good" | "warn" | "info";
}) {
  const base =
    "inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-sm " +
    "transition active:scale-[0.98] select-none focus:outline-none " +
    "focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-950 " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const neutral = "border-neutral-800 bg-neutral-900/40 text-neutral-200 hover:bg-neutral-900/70";
  const good = "border-green-400/25 bg-green-500/10 text-green-200 hover:bg-green-500/15";
  const warn = "border-yellow-400/25 bg-yellow-500/10 text-yellow-200 hover:bg-yellow-500/15";
  const info = "border-blue-400/25 bg-blue-500/10 text-blue-200 hover:bg-blue-500/15";

  const v = variant === "good" ? good : variant === "warn" ? warn : variant === "info" ? info : neutral;
  const selectedCls = selected ? "border-neutral-500/60 bg-neutral-900" : "";

  return (
    <button onClick={onClick} disabled={disabled} className={cx(base, v, selectedCls)}>
      {children}
    </button>
  );
}

export default function ProgressClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mParam = searchParams.get("m");
  const dayParam = searchParams.get("day"); // drawer controller

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

  const daysToFeb = useMemo(() => daysUntilFeb1(), []);
  const viewingFeb = month === 2 && year === currentYear;

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [totalGoals, setTotalGoals] = useState(0);

  const [byDay, setByDay] = useState<Record<string, DayAgg>>({});
  const [dayStatuses, setDayStatuses] = useState<Record<string, Record<string, CheckinStatus>>>({});

  const selectedDay = useMemo(() => {
    if (!dayParam) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayParam)) return null;
    return dayParam;
  }, [dayParam]);

  const [savingKey, setSavingKey] = useState<string | null>(null); // `${day}:${goalId}`

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

      const userId = sessionData.session.user.id;
      const userEmail = sessionData.session.user.email ?? "";

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

      if (!cancelled) setDisplayName(profile?.full_name || userEmail);

      const { data: goalRows, error: goalErr } = await supabase
        .from("user_goals")
        .select(`id, custom_title, goal_templates ( title )`)
        .eq("user_id", userId)
        .eq("active", true)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (goalErr) {
        setErrMsg(goalErr.message);
        setLoading(false);
        return;
      }

      const normalizedGoals: UserGoal[] = (goalRows ?? []).map((row: any) => {
        const tmpl = Array.isArray(row.goal_templates) ? row.goal_templates[0] : row.goal_templates;
        return {
          id: row.id,
          custom_title: row.custom_title ?? null,
          template_title: tmpl?.title ?? "Goal",
        };
      });

      const goalIds = normalizedGoals.map((g) => g.id);
      setGoals(normalizedGoals);
      setTotalGoals(goalIds.length);

      if (goalIds.length === 0) {
        setByDay({});
        setDayStatuses({});
        setLoading(false);
        return;
      }

      const { data: checkins, error: chkErr } = await supabase
        .from("checkins")
        .select("user_goal_id,checkin_date,status")
        .gte("checkin_date", startISO)
        .lte("checkin_date", endISO)
        .in("user_goal_id", goalIds);

      if (cancelled) return;

      if (chkErr) {
        setErrMsg(chkErr.message);
        setLoading(false);
        return;
      }

      const agg: Record<string, DayAgg> = {};
      const statuses: Record<string, Record<string, CheckinStatus>> = {};

      (checkins as CheckinRow[] | null)?.forEach((r) => {
        const d = r.checkin_date;
        agg[d] = agg[d] || { complete: 0, partial: 0, checked_in: 0, total: 0 };
        agg[d].total += 1;
        agg[d][r.status] += 1;

        statuses[d] = statuses[d] || {};
        statuses[d][r.user_goal_id] = r.status;
      });

      setByDay(agg);
      setDayStatuses(statuses);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, startISO, endISO]);

  const goToMonth = useCallback(
    (y: number, m: number) => {
      router.push(buildUrl("/progress", { m: monthToParam(y, m) })); // clear day drawer
    },
    [router]
  );

  const prev = useMemo(() => addMonths(target.year, target.month, -1), [target.year, target.month]);
  const next = useMemo(() => addMonths(target.year, target.month, 1), [target.year, target.month]);

  const daysWithAnyCheckin = useMemo(() => Object.keys(byDay).length, [byDay]);
  const totalCheckinsThisMonth = useMemo(() => Object.values(byDay).reduce((s, d) => s + (d.total ?? 0), 0), [byDay]);

  const daysElapsed = useMemo(() => {
    if (target.year === currentYear && target.month === currentMonth) {
      return Math.min(new Date().getDate(), daysInMonth);
    }
    return daysInMonth;
  }, [target.year, target.month, currentYear, currentMonth, daysInMonth]);

  const openDay = useCallback(
    (iso: string) => {
      router.replace(buildUrl("/progress", { m: monthToParam(target.year, target.month), day: iso }));
    },
    [router, target.year, target.month]
  );

  const closeDay = useCallback(() => {
    router.replace(buildUrl("/progress", { m: monthToParam(target.year, target.month) }));
  }, [router, target.year, target.month]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedDay) closeDay();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedDay, closeDay]);

  const setInlineStatus = useCallback(
    async (goalId: string, dateISO: string, status: CheckinStatus) => {
      setErrMsg("");
      const key = `${dateISO}:${goalId}`;
      setSavingKey(key);

      // optimistic update
      setDayStatuses((prev) => ({
        ...prev,
        [dateISO]: { ...(prev[dateISO] || {}), [goalId]: status },
      }));

      // update aggregates optimistically too (simple recompute for this day)
      setByDay((prev) => {
        const prevStats = prev[dateISO] || { complete: 0, partial: 0, checked_in: 0, total: 0 };
        const prevStatus = dayStatuses[dateISO]?.[goalId];

        // clone
        const nextStats = { ...prevStats };

        // if previously had a status, decrement that bucket
        if (prevStatus) {
          nextStats[prevStatus] = Math.max(0, (nextStats as any)[prevStatus] - 1);
          // total stays the same
        } else {
          // new check-in
          nextStats.total += 1;
        }

        // increment new bucket
        (nextStats as any)[status] = ((nextStats as any)[status] || 0) + 1;

        return { ...prev, [dateISO]: nextStats };
      });

      const { error } = await supabase.from("checkins").upsert(
        { user_goal_id: goalId, checkin_date: dateISO, status },
        { onConflict: "user_goal_id,checkin_date" }
      );

      if (error) setErrMsg(error.message);
      setSavingKey(null);
    },
    [dayStatuses]
  );

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Progress</h1>
            <p className="mt-1 text-sm text-neutral-400">{monthLabel}</p>
            <p className="mt-1 text-xs text-neutral-500">Signed in as {displayName || "—"}</p>
          </div>
        </div>

        {daysToFeb !== null && (
          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-neutral-200">
                  February 1 is the start of the Beyond January movement
                </div>
                <p className="mt-1 text-sm text-neutral-400">
                  January counts. February is where we collectively reset expectations and focus on consistency.
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  Starts in <span className="font-semibold text-neutral-300">{daysToFeb}</span>{" "}
                  day{daysToFeb === 1 ? "" : "s"}.
                </p>
              </div>

              <button
                onClick={() => goToMonth(currentYear, 2)}
                className={cx(
                  "rounded-full border px-4 py-2 text-sm transition shrink-0",
                  "border-neutral-800 bg-neutral-900/40 text-neutral-200 hover:bg-neutral-900/70",
                  viewingFeb && "border-neutral-500/60 bg-neutral-900"
                )}
              >
                View Feb
              </button>
            </div>
          </div>
        )}

        {errMsg && (
          <div className="mt-6 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
            {errMsg}
          </div>
        )}

        {loading ? (
          <p className="mt-10 text-neutral-400">Loading your month…</p>
        ) : (
          <>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => goToMonth(prev.year, prev.month)}
                className="rounded-full border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
              >
                ← Prev
              </button>

              <div className="flex items-center gap-2">
                <div
                  className={cx(
                    "rounded-full border px-4 py-2 text-sm",
                    target.year === currentYear && target.month === 2
                      ? "border-neutral-500/60 bg-neutral-900 text-neutral-100"
                      : "border-neutral-800 bg-neutral-900/40 text-neutral-200"
                  )}
                >
                  {monthLabel}
                  {target.year === currentYear && target.month === 2 && (
                    <span className="ml-2 text-xs text-neutral-400">• Movement</span>
                  )}
                </div>

                <button
                  onClick={() => goToMonth(currentYear, currentMonth)}
                  className="rounded-full border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
                >
                  This month
                </button>
              </div>

              <button
                onClick={() => goToMonth(next.year, next.month)}
                className="rounded-full border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
              >
                Next →
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-xs text-neutral-500">Days you showed up</div>
                <div className="mt-1 text-2xl font-semibold text-neutral-100">
                  {daysWithAnyCheckin}
                  <span className="text-sm font-normal text-neutral-500"> / {daysElapsed}</span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">Any check-in counts.</div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-xs text-neutral-500">Total check-ins</div>
                <div className="mt-1 text-2xl font-semibold text-neutral-100">{totalCheckinsThisMonth}</div>
                <div className="mt-1 text-xs text-neutral-500">Across all goals.</div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-xs text-neutral-500">Tracking</div>
                <div className="mt-1 text-2xl font-semibold text-neutral-100">{totalGoals}</div>
                <div className="mt-1 text-xs text-neutral-500">Goals in your set.</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {goals.map((g) => (
                <button
                  key={g.id}
                  onClick={() => router.push(`/progress/goals/${g.id}?m=${monthToParam(target.year, target.month)}`)}
                  className="rounded-full border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-900/70 hover:border-neutral-700 transition"
                >
                  {titleForGoal(g)}
                </button>
              ))}
            </div>

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
                  const stats = byDay[dateISO];
                  const tone = dayTone(stats);

                  const total = stats?.total ?? 0;
                  const completed = stats?.complete ?? 0;
                  const partial = stats?.partial ?? 0;
                  const checkedIn = stats?.checked_in ?? 0;

                  const selected = selectedDay === dateISO;

                  return (
                    <button
                      key={dateISO}
                      type="button"
                      onClick={() => openDay(dateISO)}
                      className={cx(
                        "h-20 rounded-2xl border p-2 flex flex-col justify-between text-left transition",
                        "hover:brightness-110 hover:border-neutral-600/60 cursor-pointer",
                        tone,
                        selected && "ring-2 ring-neutral-500/60"
                      )}
                      title={`${dateISO}: ${total}/${totalGoals} goals checked in`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium">{dayNum}</div>
                        {totalGoals > 0 && <div className="text-[11px] opacity-80">{total}/{totalGoals}</div>}
                      </div>

                      {total === 0 ? (
                        <div className="text-[11px] text-neutral-500">—</div>
                      ) : (
                        <div className="text-[11px] leading-snug">
                          <div>✅ {completed}</div>
                          <div>🟨 {partial}</div>
                          <div>🤝 {checkedIn}</div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-6 text-xs text-neutral-600">January counts. Go Beyond January.</div>
          </>
        )}
      </div>

      {/* Day Details Drawer */}
      {selectedDay && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-stretch justify-end"
          onClick={closeDay}
        >
          <div
            className="w-full max-w-md h-full border-l border-neutral-800 bg-neutral-950 p-5 shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-neutral-100">Day details</div>
                <div className="mt-1 text-sm text-neutral-400">{selectedDay}</div>
              </div>

              <button
                onClick={closeDay}
                className="rounded-full border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Edit check-ins</div>

              <div className="mt-3 space-y-3">
                {goals.length === 0 ? (
                  <div className="text-sm text-neutral-400">No goals.</div>
                ) : (
                  goals.map((g) => {
                    const st = dayStatuses[selectedDay]?.[g.id];
                    const key = `${selectedDay}:${g.id}`;
                    const isSaving = savingKey === key;

                    return (
                      <div key={g.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-neutral-200 truncate">{titleForGoal(g)}</div>
                            <div className="mt-1 text-xs text-neutral-500">
                              {isSaving ? "Saving…" : statusLabel(st)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Chip
                            disabled={isSaving}
                            selected={st === "complete"}
                            variant="good"
                            onClick={() => setInlineStatus(g.id, selectedDay, "complete")}
                          >
                            ✅ Complete
                          </Chip>
                          <Chip
                            disabled={isSaving}
                            selected={st === "partial"}
                            variant="warn"
                            onClick={() => setInlineStatus(g.id, selectedDay, "partial")}
                          >
                            🟨 Partial
                          </Chip>
                          <Chip
                            disabled={isSaving}
                            selected={st === "checked_in"}
                            variant="info"
                            onClick={() => setInlineStatus(g.id, selectedDay, "checked_in")}
                          >
                            🤝 Checked in
                          </Chip>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 text-xs text-neutral-500">
                Tip: This edits the actual day. Backfill is just regular editing.
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
