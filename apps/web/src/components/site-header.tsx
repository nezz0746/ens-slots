"use client";

import Link from "next/link";

import { ChainSwitch } from "@/components/chain-switch";
import { ConnectButton } from "@/components/connect-button";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { UsdcWidget } from "@/components/usdc-widget";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/60 backdrop-blur-xl">
      <div className="flex w-full items-center gap-4 px-5 py-3 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Mark className="size-5" />
          {/* Never wrapped. It is one token again now that the space is gone,
              but the guard stays: a wordmark that breaks over two lines
              stretches the whole header to match, and that regressed once. */}
          <span className="font-bold text-2xl tracking-tight whitespace-nowrap">
            Nameslots
          </span>
        </Link>

        <nav className="ml-2 flex items-center gap-1 text-sm">
          <Link href="/register">
            <Button variant="ghost" size="sm">
              Open one
            </Button>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <UsdcWidget />
          <ChainSwitch />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
