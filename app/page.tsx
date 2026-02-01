"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function gate() {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const userId = sessionData.session.user.id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

      if (!profile?.full_name) {
        router.replace("/welcome");
        return;
      }

      // Check if the user has any goals yet (MUST scope to user)
      const { data: userGoals, error } = await supabase
        .from("user_goals")
        .select("id")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(1);

      if (error) {
        // If something goes wrong, be safe and send them to Home (landing) instead of Today
        router.replace("/home");
        return;
      }

      if (!userGoals || userGoals.length === 0) {
        router.replace("/onboarding");
      } else {
        // Send authed + onboarded users to the new landing page
        router.replace("/home");
      }
    }

    gate();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <p>Loading…</p>
    </main>
  );
}
