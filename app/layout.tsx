import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "./globals.css";
import {Toaster} from "@/components/ui/sonner"
import ThemeProvider from "@/components/theme/ThemeProvider";
import {LANDING_COPY} from "@/lib/learn/copy/landing";
import {PALETTE_CSS} from "@/lib/theme/palettes";
import {decodeThemeCookie, modeOfTheme, THEME_COOKIE} from "@/lib/theme/resolve";

// The six faces ship with the app (app/fonts, SIL Open Font License — app/fonts/licenses) instead
// of being fetched from Google Fonts during the build: when that fetch failed, the whole Vercel
// build failed with it. Latin subset. Each face is declared at exactly the weights Google served
// it at — a variable face's one file listed once per weight, as Google's CSS does — so a weight
// in between (font-medium on a 400/600 face) still renders as it did, not as a true 500.
const sora = localFont({
  src: [
    {path: "./fonts/sora-latin.woff2", weight: "400", style: "normal"},
    {path: "./fonts/sora-latin.woff2", weight: "600", style: "normal"},
    {path: "./fonts/sora-latin.woff2", weight: "700", style: "normal"},
  ],
  variable: "--font-sora",
});

const hankenGrotesk = localFont({
  src: [
    {path: "./fonts/hanken-grotesk-latin.woff2", weight: "400", style: "normal"},
    {path: "./fonts/hanken-grotesk-latin.woff2", weight: "600", style: "normal"},
  ],
  variable: "--font-hanken",
});

const jetbrainsMono = localFont({
  src: [
    {path: "./fonts/jetbrains-mono-latin.woff2", weight: "500", style: "normal"},
    {path: "./fonts/jetbrains-mono-latin.woff2", weight: "700", style: "normal"},
  ],
  variable: "--font-jetbrains",
});

// Style-specific faces. Not preloaded: only the default stack above is on the critical path.
const spaceGrotesk = localFont({
  src: [
    {path: "./fonts/space-grotesk-latin.woff2", weight: "500", style: "normal"},
    {path: "./fonts/space-grotesk-latin.woff2", weight: "700", style: "normal"},
  ],
  variable: "--font-space-grotesk",
  preload: false,
});

const inter = localFont({
  src: [
    {path: "./fonts/inter-latin.woff2", weight: "400", style: "normal"},
    {path: "./fonts/inter-latin.woff2", weight: "600", style: "normal"},
  ],
  variable: "--font-inter",
  preload: false,
});

const plexMono = localFont({
  src: [
    {path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal"},
    {path: "./fonts/ibm-plex-mono-latin-700.woff2", weight: "700", style: "normal"},
  ],
  variable: "--font-plex-mono",
  preload: false,
});

export const metadata: Metadata = {
  // A page names itself ("Portfolio") and this appends the app; a page with no title of its own
  // is the app.
  title: {default: "AeroTrade", template: "%s · AeroTrade"},
  // Every page that sets no description of its own carries this one, and the sign-in and sign-up
  // pages are open to anyone: it is the landing page's sentence, which names only what every
  // account can open (lib/learn/copy/landing.ts, held by its test), never the owner's pages.
  description: LANDING_COPY.metaDescription,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The theme cookie mirrors the account's saved appearance, so the very first
  // HTML already carries the right palette and motion choice — no flash, no client JS. This is
  // the cookie's only parser, so the route groups that never sync it with the account (the
  // landing and auth pages, a poker night table, the office) read an older v1 cookie exactly as
  // the app's own pages do.
  const theme = decodeThemeCookie((await cookies()).get(THEME_COOKIE)?.value);
  const mode = modeOfTheme(theme);
  // Font variables live on <html> so the :root type tokens can reference them.
  const fontClasses = [sora, hankenGrotesk, jetbrainsMono, spaceGrotesk, inter, plexMono].map((f) => f.variable).join(' ');

  // data-style is a literal: the app has one look, and a theme no longer names a style. The
  // stylesheet still writes that look's rules under [data-style="soft"] (app/globals.css), so the
  // attribute stays on <html> — set here only, never by the client (components/theme/ThemeProvider)
  // — until those rules lose the prefix.
  return (
    <html
      lang="en"
      className={mode === 'dark' ? `${fontClasses} dark` : fontClasses}
      data-palette={theme.palette}
      data-style="soft"
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
          className="min-h-full flex flex-col font-sans"
          suppressHydrationWarning
      >
        <ThemeProvider initial={theme}>
          {children}
          <Toaster position="top-center"/>
        </ThemeProvider>
      </body>
    </html>
  );
}
