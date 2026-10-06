import type { Metadata } from "next";
import { JetBrains_Mono, Libre_Caslon_Text } from "next/font/google";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { WORLD_LIVE } from "@/lib/config";
import { WorldShell } from "@/world/shell";

import "./globals.css";
import { Providers } from "./providers";

const serif = Libre_Caslon_Text({ variable: "--font-caslon", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "silverchat: ask the network",
  description: "The polling network from Snowmoon, ch. 27. Pay $ZC to ask a question. Holders answer and earn. The result goes on-chain.",
  openGraph: { type: "website", siteName: "silverchat" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          {WORLD_LIVE ? (
            <WorldShell>
              <main className="flex-1">{children}</main>
            </WorldShell>
          ) : (
            <>
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </>
          )}
        </Providers>
      </body>
    </html>
  );
}
