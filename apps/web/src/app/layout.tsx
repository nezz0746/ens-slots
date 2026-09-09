import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";

import { config } from "@/lib/wagmi";

import { WrongChainNotice } from "@/components/chain-switch";
import { DevTools } from "@/components/dev-bar";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "./providers";
import "./globals.css";

/**
 * The app's type, served from our own origin.
 *
 * `next/font/google` downloads Urbanist at BUILD time and emits it as a local
 * asset, so "a Google font" costs no request to Google when somebody opens the
 * page: no third-party connection from a reader's browser, no DNS and TLS to
 * fonts.gstatic.com on the critical path, and a metric-matched fallback
 * generated alongside it so swapping the real face in does not reflow the page.
 *
 * The variable is its own, not `--font-sans` directly. next/font puts its
 * variable on a CLASS, `@theme` puts `--font-sans` on `:root`, and the two have
 * equal specificity — which of them won would come down to stylesheet order.
 * `globals.css` composes them instead, where the fallback stack already lives.
 */
const urbanist = Urbanist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-urbanist",
});

export const metadata: Metadata = {
  title: "ENS Slots",
  description: "ENS subnames, always for sale.",
  // An independent project. It wears ENS's colours; the name and the symbol
  // are its own, and no ENS mark appears anywhere in it.
  applicationName: "ENS Slots",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // What the browser already told us, before any JavaScript runs.
  const initialState = cookieToInitialState(
    config,
    (await headers()).get("cookie"),
  );

  return (
    <html lang="en" className={urbanist.variable}>
      <body>
        <Providers initialState={initialState}>
          <div className="ens-wash min-h-screen">
            <SiteHeader />
            <main className="w-full px-5 py-8 lg:px-8">
              <WrongChainNotice />
              {children}
            </main>
            <DevTools />
          </div>
        </Providers>
      </body>
    </html>
  );
}
