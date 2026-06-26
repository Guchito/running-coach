"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6m-6 0v-5a1 1 0 011-1h4a1 1 0 011 1v5" },
  { href: "/upload", label: "Upload run", icon: "M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" },
  { href: "/runs", label: "History", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { href: "/coach", label: "Coach", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { href: "/goal", label: "Goal", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <>
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-card flex justify-around py-2">
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`flex flex-col items-center gap-0.5 px-2 text-[10px] ${active ? "text-accent" : "text-muted"}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d={l.icon} />
            </svg>
            {l.label.split(" ")[0]}
          </Link>
        );
      })}
    </nav>
    <aside className="w-60 shrink-0 border-r border-border bg-card/60 backdrop-blur px-4 py-6 hidden md:flex flex-col gap-1 sticky top-0 h-screen">
      <Link href="/" className="flex items-center gap-2 px-2 mb-6">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent text-white font-bold text-lg">S</span>
        <div className="leading-tight">
          <div className="font-semibold">Stride</div>
          <div className="text-xs text-muted">AI Running Coach</div>
        </div>
      </Link>
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              active
                ? "bg-accent-soft text-accent font-medium"
                : "text-foreground/70 hover:bg-black/[0.04]"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d={l.icon} />
            </svg>
            {l.label}
          </Link>
        );
      })}
      <div className="mt-auto px-3 text-xs text-muted">Powered by Claude</div>
    </aside>
    </>
  );
}
