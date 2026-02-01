"use client";

import { FormEvent, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Status =
  | { type: "idle"; message: "" }
  | { type: "loading"; message: "" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });

  const bgClass = "min-h-screen bg-neutral-950 text-neutral-100";


  async function handleSendLink(e: FormEvent) {
    e.preventDefault();

    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus({ type: "loading", message: "" });

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus({ type: "error", message: error.message });
      return;
    }

    setStatus({
      type: "success",
      message: "Magic link sent. Check your email to sign in.",
    });
  }

  return (
    <main className={bgClass}>
      {/* subtle decorative blobs (premium depth) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#f2675f]/15 blur-3xl" />
        <div className="absolute -bottom-64 -right-40 h-[620px] w-[620px] rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-6">
        {/* TOP: Logo / brand takes a big chunk */}
        <section className="pt-16 sm:pt-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-white/70" />
            <span className="text-xs tracking-widest text-white/80">BEYOND JANUARY</span>
          </div>

          <div className="mt-10 sm:mt-14">
            {/* "Logo" wordmark */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[0.95]">
              <span className="block text-white/95">Beyond</span>
              <span className="block">
                <span className="bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent">
                  January
                </span>
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base sm:text-lg text-white/75 leading-relaxed">
              Consistency after motivation fades — without streak pressure.
            </p>

            <p className="mt-3 max-w-xl text-sm text-white/60">
              

            </p>
          </div>
        </section>

        {/* Spacer to push login lower (but still responsive) */}
        <div className="flex-1" />

        {/* BOTTOM: Login card sits lower */}
        <section className="pb-10 sm:pb-14">
          <div className="rounded-3xl border border-white/12 bg-white/6 p-6 sm:p-8 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="text-sm font-medium text-white/90">Sign in</div>
            <p className="mt-2 text-sm text-white/70 leading-relaxed">
              No password. We’ll email you a magic link.
            </p>

            <form onSubmit={handleSendLink} className="mt-6 space-y-3">
              <label className="block text-sm text-white/80">Email</label>
              <input
                className="w-full rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/25"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />

              <button
                disabled={status.type === "loading"}
                className={cx(
                  "w-full rounded-2xl px-4 py-3 text-sm font-semibold transition",
                  "bg-white text-neutral-950 hover:opacity-95 active:scale-[0.99]",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              >
                {status.type === "loading" ? "Sending…" : "Send magic link"}
              </button>

              {status.type !== "idle" && (
                <div className="rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white/80">
                  {status.message}
                </div>
              )}
            </form>

            <p className="mt-4 text-xs text-white/55">
              Take your goals Beyond January.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
