"use client";

import Link from "next/link";

import { DevBar } from "@/components/dev-bar";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { UsdcWidget } from "@/components/usdc-widget";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/60 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Mark className="size-7" />
          <span className="text-sm font-semibold tracking-tight">
            ens-slots
          </span>
        </Link>

        <nav className="ml-2 flex items-center gap-1 text-sm">
          <Link href="/">
            <Button variant="ghost" size="sm">
              Namespaces
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="ghost" size="sm">
              Open one
            </Button>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <UsdcWidget />
          <DevBar />
        </div>
      </div>
    </header>
  );
}
