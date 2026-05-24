import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";

const sansFont = Space_Grotesk({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-sans"
});

const monoFont = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"]
});

export const metadata: Metadata = {
  description: "Release 1 Web MVP shell for AgentHub",
  title: "AgentHub"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sansFont.variable} ${monoFont.variable}`}>{children}</body>
    </html>
  );
}
