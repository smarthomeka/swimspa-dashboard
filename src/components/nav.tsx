"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Waves, Droplets, Zap, LayoutDashboard, Sun, Moon, Settings, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Übersicht", shortLabel: "Übersicht", icon: LayoutDashboard },
  { href: "/wasserqualitaet", label: "Wasserqualität", shortLabel: "Wasser", icon: Droplets },
  { href: "/dosierung", label: "Dosierung", shortLabel: "Dosierung", icon: FlaskConical },
  { href: "/energie", label: "Energie", shortLabel: "Energie", icon: Zap },
  { href: "/einstellungen", label: "Einstellungen", shortLabel: "Settings", icon: Settings },
];

function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved === "dark" || (!saved && prefersDark);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return { dark, toggle };
}

export function Nav() {
  const pathname = usePathname();
  const { dark, toggle } = useTheme();

  return (
    <>
      {/* Desktop / top header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-card/70 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2.5">
                <Waves className="h-6 w-6 text-primary" />
                <div className="hidden sm:block">
                  <span className="font-semibold">SwimSpa Dashboard</span>
                  <span className="block text-[10px] leading-tight text-muted-foreground">Lotus 460</span>
                </div>
              </Link>
              <nav className="hidden sm:flex gap-1">
                {links.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      pathname === href
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
            <button
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={dark ? "Helles Design" : "Dunkles Design"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex sm:hidden border-t border-border/50 bg-card/80 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60 pb-[env(safe-area-inset-bottom)]">
        {links.map(({ href, shortLabel, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              pathname === href
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <Icon className={cn("h-5 w-5", pathname === href && "scale-110")} />
            {shortLabel}
          </Link>
        ))}
      </nav>
    </>
  );
}
