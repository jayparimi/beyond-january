"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function WelcomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [name, setName] = useState("");

  const bgClass = "min-h-screen bg-neutral-950 text-neutral-100";

  //const bgClass = useMemo(() => {
    // Base gradient + coral glow like your reference image
    //return [
      //"min-h-screen text-neutral-100",
      //"bg-[radial-gradient(ellipse_at_bottom,_rgba(242,103,95,0.55)_0%,_rgba(242,103,95,0)_55%),linear-gradient(180deg,#0c40b1_0%,#2344a8_35%,#0a102a_100%)]",
    //].join(" ");
  //}, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErrMsg("");
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;

      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      // If profile already exists with a name, skip welcome
      const { data: prof, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setErrMsg(error.message);
        setLoading(false);
        return;
      }

      if (prof?.full_name) {
        router.replace("/onboarding");
        return;
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleContinue() {
    setErrMsg("");
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErrMsg("Please enter your name.");
      return;
    }

    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/login");
      return;
    }

    // upsert profile
    const { error } = await supabase.from("profiles").upsert(
      {
        id: session.user.id,
        full_name: trimmed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      setErrMsg(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.replace("/onboarding");
  }

  return (
    <main className={bgClass}>
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
          <div className="text-xs tracking-wide text-white/70">BEYOND JANUARY</div>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">
            Consistency after motivation fades.
          </h1>

          <p className="mt-4 text-sm text-white/75 leading-relaxed">
            This is a calm place to track habits and goals without streak pressure.
            Showing up counts — even when the day doesn’t go perfectly.
          </p>

          <div className="mt-8">
            <label className="block text-sm text-white/80">What should we call you?</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="mt-2 w-full rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/25"
            />
          </div>

          {errMsg && (
            <div className="mt-4 rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white/80">
              {errMsg}
            </div>
          )}

          <button
            disabled={loading || saving}
            onClick={handleContinue}
            className={cx(
              "mt-8 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition",
              "bg-white text-neutral-950 hover:opacity-95 active:scale-[0.99]",
              (loading || saving) && "opacity-60 cursor-not-allowed"
            )}
          >
            {saving ? "Saving…" : "Continue"}
          </button>

          <p className="mt-3 text-xs text-white/55">
            January counts. February begins.
          </p>
        </div>
      </div>
    </main>
  );
}
