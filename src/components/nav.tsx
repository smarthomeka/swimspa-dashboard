"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Waves, Droplets, Zap, LayoutDashboard, Sun, Moon, Settings, FlaskConical, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Übersicht", shortLabel: "Übersicht", icon: LayoutDashboard },
  { href: "/wasserqualitaet", label: "Wasserqualität", shortLabel: "Wasser", icon: Droplets },
  { href: "/dosierung", label: "Dosierung", shortLabel: "Dosierung", icon: FlaskConical },
  { href: "/energie", label: "Energie", shortLabel: "Energie", icon: Zap },
  { href: "/assistent", label: "KI-Assistent", shortLabel: "KI", icon: Bot },
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
      {/* Desktop header — refined glass bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 glass">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                  <Waves className="h-5 w-5 text-primary" />
                </div>
                <div className="hidden sm:block">
                  <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
                    SwimSpa
                  </span>
                  <span className="ml-1.5 text-xs font-medium tracking-widest uppercase text-muted-foreground">
                    Lotus 460
                  </span>
                </div>
              </Link>
              <nav className="hidden sm:flex gap-0.5">
                {links.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      pathname === href
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {pathname === href && (
                      <span className="absolute inset-x-1 -bottom-[calc(0.5rem+1px)] h-0.5 rounded-full bg-primary" />
                    )}
                  </Link>
                ))}
              </nav>
            </div>
            <button
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all duration-200 hover:bg-primary/10 hover:text-foreground"
              aria-label={dark ? "Helles Design" : "Dunkles Design"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — refined with active indicator */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex sm:hidden border-t border-border/40 glass pb-[env(safe-area-inset-bottom)]">
        {links.map(({ href, shortLabel, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-all duration-200",
              pathname === href
                ? "text-primary"
                : "text-muted-foreground active:text-foreground"
            )}
          >
            {pathname === href && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
            )}
            <Icon className={cn("h-5 w-5 transition-transform duration-200", pathname === href && "scale-110")} />
            {shortLabel}
          </Link>
        ))}
      </nav>
    </>
  );
}
