import type { Metadata } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";

import { config } from "@/lib/wagmi";

import { WrongChainNotice } from "@/components/chain-switch";
import { DevTools } from "@/components/dev-bar";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ens-slots",
  description: "ENS subnames, always for sale.",
  // An independent project. It wears ENS's colours; the name and the symbol
  // are its own, and no ENS mark appears anywhere in it.
  applicationName: "ens-slots",
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
    <html lang="en">
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
