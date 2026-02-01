"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UserGoal = {
  id: string;
  cadence: "daily" | "weekly";
  share_level: "private" | "goal_feed" | "global_feed";
  custom_title: string | null;
  template_title: string;
  template_category: string;
};

type CheckinStatus = "complete" | "partial" | "checked_in";
type CheckinByGoal = Record<string, CheckinStatus | undefined>;
type HistoryByGoal = Record<string, Record<string, CheckinStatus>>;

function toLocalISODate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysLocalISO(baseISO: string, deltaDays: number) {
  const [y, m, d] = baseISO.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalISODate(dt);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatPrettyDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  const label = dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return label;
}

function appendQuery(baseUrl: string, key: string, value: string) {
  if (!baseUrl) return "";
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export default function TodayClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = useMemo(() => toLocalISODate(new Date()), []);

  // deep link params
  const deepGoalId = searchParams.get("goalId");
  const deepEditDate = searchParams.get("editDate"); // YYYY-MM-DD
  const deepReturnTo = searchParams.get("returnTo"); // e.g. /progress?m=2026-01

  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [checkins, setCheckins] = useState<CheckinByGoal>({});
  const [history, setHistory] = useState<HistoryByGoal>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});

  // 3-dot menu
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  // Backfill modal
  const [backfillFor, setBackfillFor] = useState<string | null>(null);
  const [backfillSaving, setBackfillSaving] = useState(false);

  // ✅ NEW: choose which date you’re editing
  const [backfillDate, setBackfillDate] = useState<string>(() => addDaysLocalISO(today, -1));
  
  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysLocalISO(today, i - 6));
  }, [today]);

  // ✅ NEW: show a small “stack” around chosen date (3 days: selected, -1, -2)
  const backfillDays = useMemo(() => {
    const anchor = backfillDate || addDaysLocalISO(today, -1);
    return [anchor, addDaysLocalISO(anchor, -1), addDaysLocalISO(anchor, -2)];
  }, [backfillDate, today]);

  function statusMeta(status?: CheckinStatus) {
    if (!status) return null;
    if (status === "complete") {
      return { label: "Complete", cls: "border-green-400/30 bg-green-500/10 text-green-200" };
    }
    if (status === "partial") {
      return { label: "Partial", cls: "border-yellow-400/30 bg-yellow-500/10 text-yellow-200" };
    }
    return { label: "Checked in", cls: "border-blue-400/30 bg-blue-500/10 text-blue-200" };
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
    variant?: "neutral" | "good" | "warn" | "info" | "danger";
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
    const danger = "border-red-400/25 bg-red-500/10 text-red-200 hover:bg-red-500/15";

    const v =
      variant === "good"
        ? good
        : variant === "warn"
        ? warn
        : variant === "info"
        ? info
        : variant === "danger"
        ? danger
        : neutral;

    const selectedCls = selected ? "border-neutral-500/60 bg-neutral-900" : "";

    return (
      <button onClick={onClick} disabled={disabled} className={cx(base, v, selectedCls)}>
        {children}
      </button>
    );
  }

  // Close menus on outside click / escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenuFor(null);
        // if deep-linked, Esc should also behave like close -> return
        if (backfillFor && deepReturnTo) {
          const d = deepEditDate || backfillDate;
          router.push(appendQuery(deepReturnTo, "day", d));
          return;
        }
        setBackfillFor(null);
      }
    }
    function onClick() {
      setOpenMenuFor(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backfillFor, deepReturnTo, deepEditDate, backfillDate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErrMsg("");
      setLoading(true);

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

      const userId = sessionData.session.user.id;
      const userEmail = sessionData.session.user.email ?? "";

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

      if (!cancelled) setDisplayName(profile?.full_name || userEmail);

      const { data, error } = await supabase
        .from("user_goals")
        .select(
          `
          id,
          cadence,
          share_level,
          custom_title,
          goal_templates (
            title,
            category
          )
        `
        )
        .eq("active", true)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setGoals([]);
        setCheckins({});
        setHistory({});
        setErrMsg(error.message);
        setLoading(false);
        return;
      }

      const normalized: UserGoal[] = (data ?? []).map((row: any) => {
        const tmpl = Array.isArray(row.goal_templates) ? row.goal_templates[0] : row.goal_templates;
        return {
          id: row.id,
          cadence: row.cadence,
          share_level: row.share_level,
          custom_title: row.custom_title ?? null,
          template_title: tmpl?.title ?? "Goal",
          template_category: tmpl?.category ?? "—",
        };
      });

      let todayMap: CheckinByGoal = {};
      let historyMap: HistoryByGoal = {};

      if (normalized.length > 0) {
        const goalIds = normalized.map((g) => g.id);

        const { data: todayRows } = await supabase
          .from("checkins")
          .select("user_goal_id,status")
          .eq("checkin_date", today)
          .in("user_goal_id", goalIds);

        (todayRows ?? []).forEach((r: any) => {
          todayMap[r.user_goal_id] = r.status as CheckinStatus;
        });

        const startDate = last7Days[0];
        const { data: histRows } = await supabase
          .from("checkins")
          .select("user_goal_id,checkin_date,status")
          .gte("checkin_date", startDate)
          .lte("checkin_date", today)
          .in("user_goal_id", goalIds);

        (histRows ?? []).forEach((r: any) => {
          const gid = r.user_goal_id as string;
          const dt = r.checkin_date as string;
          const st = r.status as CheckinStatus;
          historyMap[gid] = historyMap[gid] || {};
          historyMap[gid][dt] = st;
        });
      }

      if (cancelled) return;

      setGoals(normalized);
      setCheckins(todayMap);
      setHistory(historyMap);

      const initialEdit: Record<string, boolean> = {};
      normalized.forEach((g) => (initialEdit[g.id] = false));
      setEditMode(initialEdit);

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, today, last7Days]);

  // ✅ NEW: auto-open backfill if deep-linked
  useEffect(() => {
    if (!loading && deepGoalId && deepEditDate) {
      setBackfillFor(deepGoalId);
      setBackfillDate(deepEditDate);
    }
  }, [loading, deepGoalId, deepEditDate]);

  const setStatus = useCallback(
    async (userGoalId: string, status: CheckinStatus) => {
      setErrMsg("");
      setSavingId(userGoalId);

      setCheckins((prev) => ({ ...prev, [userGoalId]: status }));
      setHistory((prev) => ({
        ...prev,
        [userGoalId]: { ...(prev[userGoalId] || {}), [today]: status },
      }));

      const { error } = await supabase.from("checkins").upsert(
        { user_goal_id: userGoalId, checkin_date: today, status },
        { onConflict: "user_goal_id,checkin_date" }
      );

      if (error) setErrMsg(error.message);
      else setEditMode((prev) => ({ ...prev, [userGoalId]: false }));

      setSavingId(null);
    },
    [today]
  );

  const removeGoal = useCallback(async (userGoalId: string) => {
    setErrMsg("");
    setSavingId(userGoalId);

    const { error } = await supabase.from("user_goals").update({ active: false }).eq("id", userGoalId);

    if (error) {
      setErrMsg(error.message);
      setSavingId(null);
      return;
    }

    setGoals((prev) => prev.filter((g) => g.id !== userGoalId));
    setCheckins((prev) => {
      const next = { ...prev };
      delete next[userGoalId];
      return next;
    });
    setHistory((prev) => {
      const next = { ...prev };
      delete next[userGoalId];
      return next;
    });

    setSavingId(null);
  }, []);
  const setBackfillStatus = useCallback(
    async (userGoalId: string, dateISO: string, status: CheckinStatus) => {
      setErrMsg("");
      setBackfillSaving(true);

      setHistory((prev) => ({
        ...prev,
        [userGoalId]: { ...(prev[userGoalId] || {}), [dateISO]: status },
      }));
      if (dateISO === today) setCheckins((prev) => ({ ...prev, [userGoalId]: status }));

      const { error } = await supabase.from("checkins").upsert(
        { user_goal_id: userGoalId, checkin_date: dateISO, status },
        { onConflict: "user_goal_id,checkin_date" }
      );

      if (error) setErrMsg(error.message);
      setBackfillSaving(false);
    },
    [today]
  );

  function dotClass(status?: CheckinStatus) {
    if (status === "complete") return "bg-green-400/80";
    if (status === "partial") return "bg-yellow-300/80";
    if (status === "checked_in") return "bg-blue-400/80";
    return "bg-neutral-700";
  }

  const allCheckedToday = useMemo(() => {
    return goals.length > 0 && goals.every((g) => !!checkins[g.id]);
  }, [goals, checkins]);

  const closeBackfill = useCallback(() => {
    // 1) close immediately so UI never feels stuck
    setBackfillFor(null);
    setOpenMenuFor(null);
  
    // 2) if deep-linked, go back to where we came from
    if (deepReturnTo) {
      const d = deepEditDate || backfillDate || today;
  
      // sanitize returnTo (must be an internal path)
      const base =
        deepReturnTo.startsWith("/") ? deepReturnTo : "/progress";
  
      // go back + preserve selected day so Progress re-opens the drawer
      router.replace(appendQuery(base, "day", d));
      return;
    }
  }, [deepReturnTo, deepEditDate, backfillDate, today, router]);
  

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Today</h1>
            <p className="mt-1 text-sm text-neutral-400">Signed in as {displayName || "—"}</p>
            <p className="mt-1 text-xs text-neutral-500">Date: {today}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/notes")}
              className="rounded-full border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
            >
              My Notes
            </button>
          </div>
        </div>

        {errMsg && (
          <div className="mt-6 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
            {errMsg}
          </div>
        )}

        {loading ? (
          <p className="mt-10 text-neutral-400">Loading your goals…</p>
        ) : goals.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <p className="text-neutral-200">You don’t have any goals yet.</p>
          </div>
        ) : (
          <div className="mt-8">
            {allCheckedToday && (
              <div className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-sm font-medium text-neutral-200">You’re done for today.</div>
                <p className="mt-1 text-sm text-neutral-400">
                  The day is locked in. If you need to, you can edit a check-in — otherwise head to Progress.
                </p>
                
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => router.push("/progress")}
                    className="rounded-full bg-neutral-100 text-neutral-950 px-4 py-2 text-sm font-semibold hover:opacity-95 active:scale-[0.99] transition"
                  >
                    View Progress
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4">
              <h2 className="text-lg font-semibold text-neutral-200">Check in (no pressure)</h2>
              <p className="mt-1 text-sm text-neutral-400">
                One check-in per day. You can edit it if you need to — but your day is considered done.
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                  Customize your goals by selecting options to the right of your goal.
              </p>
            </div>

            <div className="space-y-3">
              {goals.map((g) => {
                const title = g.custom_title ?? g.template_title;
                const current = checkins[g.id];
                const meta = statusMeta(current);
                const isSaving = savingId === g.id;

                const locked = !!current && !editMode[g.id];
                const showEditCheckin = !!current;
                const isMenuOpen = openMenuFor === g.id;

                return (
                  <div key={g.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="font-medium truncate">{title}</div>
                          {meta && (
                            <span className={cx("shrink-0 text-xs rounded-full border px-2 py-0.5", meta.cls)}>
                              {meta.label}
                            </span>
                          )}
                          {isSaving && <span className="shrink-0 text-xs text-neutral-500">Saving…</span>}
                        </div>

                        <div className="mt-1 text-xs text-neutral-400">
                          {g.template_category} • {g.cadence}
                        </div>

                        <div className="mt-2 flex items-center gap-1">
                          {last7Days.map((d) => {
                            const st = history[g.id]?.[d];
                            return (
                              <span
                                key={d}
                                title={`${d}: ${st ? st : "no check-in"}`}
                                className={cx("h-2.5 w-2.5 rounded-full", dotClass(st))}
                              />
                            );
                          })}
                          <span className="ml-2 text-xs text-neutral-500">Last 7 days</span>
                        </div>
                      </div>

                      {/* ⋯ menu */}
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setOpenMenuFor((prev) => (prev === g.id ? null : g.id))}
                          className="rounded-full border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
                          aria-label="More actions"
                          title="More"
                        >
                          ⋯
                        </button>

                        {isMenuOpen && (
                          <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl overflow-hidden z-50">
                            <button
                              className="w-full text-left px-4 py-3 text-sm text-neutral-200 hover:bg-neutral-900 transition"
                              onClick={() => {
                                setOpenMenuFor(null);
                                router.push(`/goals/${g.id}/edit`);
                              }}
                            >
                              Edit name
                            </button>

                            <button
                              className="w-full text-left px-4 py-3 text-sm text-neutral-200 hover:bg-neutral-900 transition"
                              onClick={() => {
                                setOpenMenuFor(null);
                                setBackfillFor(g.id);
                                setBackfillDate(addDaysLocalISO(today, -1));
                              }}
                            >
                              Edit previous days
                            </button>

                            <button
                              className="w-full text-left px-4 py-3 text-sm text-neutral-200 hover:bg-neutral-900 transition"
                              onClick={() => {
                                setOpenMenuFor(null);
                                router.push(`/notes?panel=goal_whys&goalId=${g.id}`);
                              }}
                            >
                              Edit my why
                            </button>
                            <div className="h-px bg-neutral-800" />

                            <button
                              disabled={isSaving}
                              className={cx(
                                "w-full text-left px-4 py-3 text-sm hover:bg-neutral-900 transition",
                                isSaving ? "text-neutral-500 cursor-not-allowed" : "text-red-200"
                              )}
                              onClick={() => {
                                setOpenMenuFor(null);
                                removeGoal(g.id);
                              }}
                            >
                              Remove goal
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      <Chip disabled={isSaving || locked} selected={current === "complete"} variant="good" onClick={() => setStatus(g.id, "complete")}>
                        ✅ Complete
                      </Chip>

                      <Chip disabled={isSaving || locked} selected={current === "partial"} variant="warn" onClick={() => setStatus(g.id, "partial")}>
                        🟨 Partial
                      </Chip>

                      <Chip
                        disabled={isSaving || locked}
                        selected={current === "checked_in"}
                        variant="info"
                        onClick={() => setStatus(g.id, "checked_in")}
                      >
                        🤝 Checked in
                      </Chip>

                      {showEditCheckin && (
                        <button
                          onClick={() => setEditMode((prev) => ({ ...prev, [g.id]: !prev[g.id] }))}
                          className="ml-1 text-sm text-neutral-400 hover:text-neutral-200 transition"
                        >
                          {editMode[g.id] ? "Done editing" : "Edit check-in"}
                        </button>
                      )}
                    </div>

                    {locked && (
                      <div className="mt-2 text-xs text-neutral-500">
                        Locked for today.{" "}
                        <button
                          onClick={() => router.push("/progress")}
                          className="text-neutral-300 hover:text-neutral-100 underline underline-offset-4"
                        >
                          See your month
                        </button>
                        .
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-4 text-xs text-neutral-500">Next: weekly/monthly view + reflections.</div>
          </div>
        )}
      </div>

      {/* Backfill modal */}
      {backfillFor && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeBackfill}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">Edit previous days</div>
                <p className="mt-1 text-sm text-neutral-400">
                  Pick a date and check in. This will show normally in Progress.
                </p>
              </div>

              <button
                className="rounded-full border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
                onClick={closeBackfill}
              >
                Close
              </button>
            </div>

            {/* ✅ NEW: date picker */}
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="text-sm text-neutral-300">
                Date: <span className="text-neutral-100 font-medium">{backfillDate}</span>{" "}
                <span className="text-neutral-500">({formatPrettyDay(backfillDate)})</span>
              </div>

              <input
                type="date"
                value={backfillDate}
                max={today}
                onChange={(e) => setBackfillDate(e.target.value)}
                className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-500"
              />
            </div>

            <div className="mt-4 space-y-4">
              {backfillDays.map((dISO, idx) => {
                const label = idx === 0 ? `Selected (${formatPrettyDay(dISO)})` : `${idx} day(s) before (${formatPrettyDay(dISO)})`;
                const current = history[backfillFor]?.[dISO];

                return (
                  <div key={dISO} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-neutral-200">{label}</div>
                      <div className="text-xs text-neutral-500">{dISO}</div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      <Chip
                        disabled={backfillSaving}
                        selected={current === "complete"}
                        variant="good"
                        onClick={() => setBackfillStatus(backfillFor, dISO, "complete")}
                      >
                        ✅ Complete
                      </Chip>

                      <Chip
                        disabled={backfillSaving}
                        selected={current === "partial"}
                        variant="warn"
                        onClick={() => setBackfillStatus(backfillFor, dISO, "partial")}
                      >
                        🟨 Partial
                      </Chip>

                      <Chip
                        disabled={backfillSaving}
                        selected={current === "checked_in"}
                        variant="info"
                        onClick={() => setBackfillStatus(backfillFor, dISO, "checked_in")}
                      >
                        🤝 Checked in
                      </Chip>

                      {backfillSaving && <span className="ml-1 text-xs text-neutral-500">Saving…</span>}
                    </div>

                    <div className="mt-2 text-xs text-neutral-500">
                      Tip: this day will appear normally in Progress.
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded-full border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
                onClick={closeBackfill}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
