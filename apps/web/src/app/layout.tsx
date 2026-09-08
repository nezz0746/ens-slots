import type { Metadata } from "next";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="ens-wash min-h-screen">
            <SiteHeader />
            <main className="mx-auto w-full max-w-5xl px-5 py-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
