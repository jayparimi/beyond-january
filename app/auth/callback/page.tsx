"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function finishAuth() {
      // Supabase reads the token from the URL and establishes a session.
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        // ✅ ALWAYS go through the gate so new users get Welcome/Onboarding
        router.replace("/");
      } else {
        router.replace("/login");
      }
    }

    finishAuth();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <p>Signing you in…</p>
    </main>
  );
}
