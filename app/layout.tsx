import type { Metadata } from "next";
import { Sora, Hanken_Grotesk, JetBrains_Mono, Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import {Toaster} from "@/components/ui/sonner"
import ThemeProvider from "@/components/theme/ThemeProvider";
import ThemeBackdrop from "@/components/theme/ThemeBackdrop";
import {PALETTE_CSS} from "@/lib/theme/palettes";
import {decodeThemeCookie, modeOfTheme, THEME_COOKIE} from "@/lib/theme/resolve";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "700"],
});

// Style-specific faces. Not preloaded: only the default stack above is on the critical path.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600"],
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "AeroTrade Terminal",
  description: "Paper-trading terminal with an AI news brain: follow the topics you care about, test strategies with virtual money, and let scheduled AI jobs read the news for you.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The theme cookie mirrors the account's saved appearance, so the very first
  // HTML already carries the right palette/style — no flash, no client JS.
  const theme = decodeThemeCookie((await cookies()).get(THEME_COOKIE)?.value);
  const mode = modeOfTheme(theme);
  // Font variables live on <html> so the :root type tokens can reference them.
  const fontClasses = [sora, hankenGrotesk, jetbrainsMono, spaceGrotesk, inter, plexMono].map((f) => f.variable).join(' ');

  return (
    <html
      lang="en"
      className={mode === 'dark' ? `${fontClasses} dark` : fontClasses}
      data-palette={theme.palette}
      data-style={theme.style}
      data-mode={mode}
      data-motion={theme.reduceMotion ? 'reduced' : 'auto'}
      style={{ colorScheme: mode }}
      suppressHydrationWarning
    >
      <head>
        {/* App-wide Material Symbols icon font, loaded once in the App Router root layout.
            The no-page-custom-font rule targets the Pages Router (_document.js) and is a false
            positive here. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        {/* Palette token blocks, generated from the whitelisted registry in lib/theme/palettes.ts. */}
        <style id="aero-palettes" dangerouslySetInnerHTML={{ __html: PALETTE_CSS }} />
      </head>
      <body
          className="min-h-full flex flex-col"
          style={{ fontFamily: 'var(--type-body), sans-serif' }}
          suppressHydrationWarning
      >
        <ThemeProvider initial={theme}>
          <ThemeBackdrop />
          {children}
          <Toaster position="top-center"/>
        </ThemeProvider>
      </body>
    </html>
  );
}
