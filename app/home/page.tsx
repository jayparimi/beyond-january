"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Status = "complete" | "partial" | "checked_in";
type FeedItem = {
  id: string;
  status: Status;
  goal: string;
  secondsAgo: number;
};

function formatNumber(n: number) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function statusLabel(s: Status) {
  if (s === "complete") return "✅ Complete";
  if (s === "partial") return "🟨 Partial";
  return "🤝 Checked in";
}

const GOAL_SNIPPETS = [
  "Drink water",
  "Run or walk",
  "Stretch",
  "Read 10 pages",
  "Practice a skill",
  "Journal",
  "Meditate",
  "Study session",
  "Cook a real meal",
  "Early bedtime",
  "Clean one thing",
  "Call family",
  "Work on my project",
  "Plan tomorrow",
  "Show up anyway",
];

const STATUSES: Status[] = ["complete", "partial", "checked_in"];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomItem<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------- Deterministic daily counter ----------------

// YYYY-MM-DD in local time
function getLocalDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// seconds since local midnight
function secondsSinceMidnight(now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - midnight.getTime()) / 1000);
}

// stable 32-bit hash
function hashStringToSeed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 seeded RNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Count how many check-ins occurred by time T (seconds since midnight),
 * using deterministic "random" gaps between MIN_GAP and MAX_GAP seconds.
 *
 * NOTE: We use 1..60 to avoid 0-second gaps causing infinite events.
 */
function countEventsByT(seed: number, T: number, minGap: number, maxGap: number) {
  const rng = mulberry32(seed);
  let t = 0;
  let count = 0;

  while (true) {
    const gap = minGap + Math.floor(rng() * (maxGap - minGap + 1)); // inclusive
    t += gap;
    if (t > T) break;
    count++;
  }
  return count;
}

const MIN_GAP_SECONDS = 1;
const MAX_GAP_SECONDS = 60;

export default function HomePage() {
  const [count, setCount] = useState<number>(0);
  const [feed, setFeed] = useState<FeedItem[]>(() => {
    const initial: FeedItem[] = [];
    for (let i = 0; i < 8; i++) {
      initial.push({
        id: `seed-${i}`,
        status: randomItem(STATUSES),
        goal: randomItem(GOAL_SNIPPETS),
        secondsAgo: randInt(12, 360),
      });
    }
    return initial.sort((a, b) => a.secondsAgo - b.secondsAgo);
  });

  const openedAtRef = useRef<number>(Date.now());

  // Deterministic counter: same for everyone, resets daily
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const dateKey = getLocalDateKey(now); // daily reset
      const seed = hashStringToSeed(`beyond-january-daily-counter-${dateKey}`);

      const T = secondsSinceMidnight(now);
      const events = countEventsByT(seed, T, MIN_GAP_SECONDS, MAX_GAP_SECONDS);

      setCount(events); // starts at 0 at midnight
    };

    update();
    const t = setInterval(update, 1000); // “live” feel
    return () => clearInterval(t);
  }, []);

  // Vibe feed (purely visual, no real user data)
  useEffect(() => {
    const t = setInterval(() => {
      if (Math.random() < 0.32) {
        const item: FeedItem = {
          id: `live-${Date.now()}`,
          status: randomItem(STATUSES),
          goal: randomItem(GOAL_SNIPPETS),
          secondsAgo: 1,
        };

        setFeed((prev) => {
          const next = [item, ...prev]
            .map((x) => ({
              ...x,
              secondsAgo: x.id === item.id ? 1 : Math.min(x.secondsAgo + randInt(2, 6), 999),
            }))
            .slice(0, 10);
          return next;
        });
      } else {
        setFeed((prev) =>
          prev.map((x) => ({
            ...x,
            secondsAgo: Math.min(x.secondsAgo + 2, 999),
          }))
        );
      }
    }, 2500);

    return () => clearInterval(t);
  }, []);

  const minutesOnPage = Math.max(1, Math.floor((Date.now() - openedAtRef.current) / 60000));

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">Beyond January</h1>
            <p className="mt-3 max-w-xl text-white/70">
              You’re not alone. Showing up counts — even when it’s not perfect.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/today"
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              Check in today
            </Link>
            <Link
              href="/progress"
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              View progress
            </Link>
          </div>
        </div>

        {/* Counter */}
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-white/60">Check-ins today</p>
              <div className="mt-1 text-5xl font-semibold tracking-tight">
                {formatNumber(count)}
              </div>
             
            </div>

            <div className="text-sm text-white/50">Live while you’re here · {minutesOnPage}m</div>
          </div>

          <div className="mt-4 text-white/60">
            <span className="text-white">No streaks.</span> No pressure. Just consistency over time.
          </div>
        </div>

        {/* Feed + principles */}
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-medium">People are showing up</h2>
            <p className="mt-2 text-sm text-white/60">
              A quiet reminder that effort is happening everywhere — alongside you.
            </p>

            <div className="mt-5 space-y-3">
              {feed.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                >
                  <div className="flex flex-col">
                    <div className="text-sm text-white">
                      {statusLabel(item.status)} ·{" "}
                      <span className="text-white/70">{item.goal}</span>
                    </div>
                    <div className="text-xs text-white/50">{item.secondsAgo}s ago</div>
                  </div>
                
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-medium">Built for real life</h2>

            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-sm font-medium">Any check-in counts</div>
                <div className="mt-1 text-sm text-white/60">Complete, partial, or just showing up.</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-sm font-medium">Backfill is normal</div>
                <div className="mt-1 text-sm text-white/60">Missed a day? Log it later. No guilt.</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-sm font-medium">Private by default</div>
                <div className="mt-1 text-sm text-white/60">Community is a feeling, not exposure.</div>
              </div>
            </div>

            <div className="mt-6 text-sm text-white/60">
              Your only job today: <span className="text-white">show up.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
