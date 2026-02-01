"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function EditGoalPage() {
  const router = useRouter();
  const params = useParams();

  const rawId = (params as any)?.id;
  const id: string | null = Array.isArray(rawId) ? rawId[0] : rawId ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [baseTitle, setBaseTitle] = useState("");
  const [category, setCategory] = useState("");
  const [customTitle, setCustomTitle] = useState("");

  useEffect(() => {
    async function load() {
      setErrMsg("");
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      if (!id) {
        setErrMsg("Missing goal id in URL.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_goals")
        .select(
          `
          id,
          custom_title,
          goal_templates (
            title,
            category
          )
        `
        )
        .eq("id", id)
        .single();

      if (error) {
        setErrMsg(error.message);
        setLoading(false);
        return;
      }

      const tmpl = Array.isArray((data as any).goal_templates)
        ? (data as any).goal_templates[0]
        : (data as any).goal_templates;

      const templateTitle = tmpl?.title ?? "Goal";
      const templateCategory = tmpl?.category ?? "—";

      setBaseTitle(templateTitle);
      setCategory(templateCategory);
      setCustomTitle((data as any).custom_title ?? templateTitle);

      setLoading(false);
    }

    load();
  }, [id, router]);

  async function handleSave() {
    setErrMsg("");
    setSaving(true);

    if (!id) {
      setErrMsg("Missing goal id in URL.");
      setSaving(false);
      return;
    }

    const next = customTitle.trim();
    if (!next) {
      setErrMsg("Goal name can’t be empty.");
      setSaving(false);
      return;
    }

    // Keep DB clean: if it matches template, store null
    const valueToStore = next === baseTitle ? null : next;

    const { error } = await supabase
      .from("user_goals")
      .update({ custom_title: valueToStore })
      .eq("id", id);

    if (error) {
      setErrMsg(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.replace("/today");
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-xl mx-auto">
        <button
          onClick={() => router.back()}
          className="
            rounded-full p-2
            hover:bg-neutral-800 active:scale-[0.98] transition
            focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-950
          "
          aria-label="Back"
          title="Back"
        >
          ←
        </button>

        <h1 className="mt-4 text-3xl font-semibold">Edit goal</h1>
        <p className="mt-1 text-sm text-neutral-400">{category}</p>

        {errMsg && (
          <div className="mt-6 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
            {errMsg}
          </div>
        )}

        {loading ? (
          <p className="mt-10 text-neutral-400">Loading…</p>
        ) : (
          <div className="mt-8 space-y-3">
            <label className="text-sm text-neutral-300">Goal name</label>
            <input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="
                w-full rounded-xl border border-neutral-800 bg-neutral-900
                px-4 py-3 text-neutral-100
                outline-none focus:ring-2 focus:ring-neutral-600
              "
              placeholder={baseTitle}
            />

            <p className="text-xs text-neutral-500">
              Tip: make it specific, like “Wake up by 5:00 AM”.
            </p>

            <button
              onClick={handleSave}
              disabled={saving}
              className="
                mt-4 w-full rounded-full py-3 font-semibold
                bg-neutral-100 text-neutral-950
                hover:opacity-95 active:scale-[0.98] transition
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
