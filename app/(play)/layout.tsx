import type {Metadata, Viewport} from "next";
import {LOOKS_CSS} from "@/lib/poker-night/looks";

// The poker night table's route group (/play/CODE): full screen, with none of the app's shell — no
// rail, header or assistant, so nothing covers the action bar — and open to guests (proxy.ts
// leaves /play/ alone; the route handlers and the page read the identity themselves). The root
// layout still supplies the theme, the fonts and the toaster. The page owns its <main>.

// Every table page reads the request's cookies and the room: never prerendered.
export const dynamic = 'force-dynamic';

// A table is a private link: never indexed, never followed.
export const metadata: Metadata = {robots: {index: false, follow: false}};

// viewport-fit=cover lets the dock and the top bar pad with the iPhone's safe areas; zoom stays
// available (no maximumScale, no userScalable).
export const viewport: Viewport = {width: 'device-width', initialScale: 1, viewportFit: 'cover'};

const PlayLayout = ({children}: {children: React.ReactNode}) => (
    <>
        {/* The looks' colours (lib/poker-night/looks): data-attribute blocks built from a whitelisted
            registry of literals, never user input — the table carries only the ids. */}
        <style id="pn-looks" dangerouslySetInnerHTML={{__html: LOOKS_CSS}}/>
        <div className="min-h-dvh text-fg-soft">{children}</div>
    </>
);

export default PlayLayout;
