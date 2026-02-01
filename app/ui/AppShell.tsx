"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function NavChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "rounded-full border px-3 py-1.5 text-sm transition",
        active
          ? "border-neutral-500/60 bg-neutral-900 text-neutral-100"
          : "border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-900/70"
      )}
    >
      {label}
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  const hideNav = pathname === "/login" || pathname.startsWith("/auth");

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setAuthed(!!data.session);
      setReady(true);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!ready) return <>{children}</>;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {authed && !hideNav && (
        <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
          <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between gap-4">
            <Link href="/home" className="font-semibold tracking-tight">
              Beyond January
            </Link>

            <nav className="flex items-center gap-2">
              <NavChip href="/home" label="Home" active={pathname === "/home"} />
              <NavChip href="/today" label="Today" active={pathname === "/today"} />
              <NavChip
                href="/progress"
                label="Progress"
                active={pathname === "/progress" || pathname.startsWith("/progress/")}
              />
              <NavChip href="/about" label="About" active={pathname === "/about"} />
              <NavChip href="/onboarding" label="Add goals" active={pathname === "/onboarding"} />
              
              <button
                onClick={handleLogout}
                className="ml-2 rounded-full border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900/70 transition"
              >
                Log out
              </button>
            </nav>
          </div>
        </header>
      )}

      <div>{children}</div>
    </div>
  );
}
