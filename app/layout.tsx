import type { Metadata } from "next";
import { Sora, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import {Toaster} from "@/components/ui/sonner"

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

export const metadata: Metadata = {
  title: "AeroTrade Terminal",
  description: "Precision-futurism trading terminal. Track real-time stock prices, get personalized alerts and explore detailed company insights with a next-gen interface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={"dark"} suppressHydrationWarning>
      <head>
        {/* App-wide Material Symbols icon font, loaded once in the App Router root layout.
            The no-page-custom-font rule targets the Pages Router (_document.js) and is a false
            positive here. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
          className={`${sora.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} min-h-full flex flex-col`}
          style={{ fontFamily: 'var(--font-hanken), sans-serif' }}
          suppressHydrationWarning
      >
          {children}
        <Toaster position="top-center"/>
      </body>
    </html>
  );
}
