"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  {
    href: "/",
    label: "Dashboard",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6m-6 0v-5a1 1 0 011-1h4a1 1 0 011 1v5",
    // Reached via the logo in the mobile top bar, so it's dropped from the
    // crowded bottom bar.
    hideOnMobile: true,
  },
  {
    href: "/upload",
    label: "Upload session",
    icon: "M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10",
    // Reached from the Dashboard and History pages instead.
    hideOnMobile: true,
  },
  {
    href: "/runs",
    label: "History",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  {
    href: "/coach",
    label: "Coach",
    icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  },
  {
    href: "/plan",
    label: "Plan",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  },
  {
    href: "/goals",
    label: "Goals",
    icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  },
  {
    href: "/races",
    label: "Races",
    icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m10-14a4 4 0 11-8 0 4 4 0 018 0zM8.21 13.89L7 23l5-3 5 3-1.21-9.12",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

export function Nav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  // Hide the mobile bars when scrolling down, reveal them when scrolling up.
  const [barsHidden, setBarsHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      if (y < 12)
        setBarsHidden(false); // always visible near the top
      else if (y > lastY + 5)
        setBarsHidden(true); // scrolling down
      else if (y < lastY - 5) setBarsHidden(false); // scrolling up
      lastY = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // No app chrome on the auth screens.
  if (pathname === "/login" || pathname === "/signup") return null;

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile top bar: the logo is the home/dashboard link, kept visible while
          scrolling so Dashboard can drop off the crowded bottom bar. */}
      <header
        className={`md:hidden fixed top-0 inset-x-0 z-20 h-14 border-b border-border bg-card/90 backdrop-blur flex items-center px-4 transition-transform duration-300 ${
          barsHidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Home"
            className="w-8 h-8 rounded-lg object-contain"
          />
        </Link>
      </header>

      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-card flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${
          barsHidden ? "translate-y-full" : "translate-y-0"
        }`}
      >
        {links
          .filter((l) => !l.hideOnMobile)
          .map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex flex-col items-center gap-0.5 px-2 text-[10px] transition-[color,transform] duration-150 ease-out active:scale-95 ${active ? "text-accent" : "text-muted"}`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={l.icon}
                  />
                </svg>
                {l.label.split(" ")[0]}
              </Link>
            );
          })}
      </nav>
      <aside className="w-60 shrink-0 border-r border-border bg-card/60 backdrop-blur px-4 py-6 hidden md:flex flex-col gap-1 sticky top-0 h-screen">
        <Link href="/" className="flex items-center gap-2 px-2 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Gunna"
            className="w-9 h-9 rounded-xl object-contain"
          />
          <div className="leading-tight">
            <div className="font-semibold">Gunna</div>
            <div className="text-xs text-muted">AI Running Coach</div>
          </div>
        </Link>
        {links.map((l) => {
          const active =
            l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] ${
                active
                  ? "bg-accent-soft text-accent font-medium"
                  : "text-foreground/70 hover:bg-black/4"
              }`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={l.icon} />
              </svg>
              {l.label}
            </Link>
          );
        })}
        <div className="mt-auto pt-4 border-t border-border">
          {email && (
            <div
              className="px-3 py-1 text-xs text-muted truncate"
              title={email}
            >
              {email}
            </div>
          )}
          <button
            onClick={logout}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground/70 hover:bg-black/4 transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] disabled:opacity-50"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
    </>
  );
}
