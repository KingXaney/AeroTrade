import type {Metadata, Viewport} from "next";

// The office's route group (/agent-world/office): full screen, with none of the app's shell — no
// rail, header or assistant — opened in its own tab from the trading agent world's floor. The root
// layout still supplies the theme, the fonts and the toaster; proxy.ts gates the address like any
// page, and the page reads the session itself. The page owns its <main>.

// Every office page reads the session and the newest session: never prerendered.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {robots: {index: false, follow: false}};

// viewport-fit=cover lets the top bar pad with a phone's safe areas; zoom stays available.
export const viewport: Viewport = {width: 'device-width', initialScale: 1, viewportFit: 'cover'};

const OfficeLayout = ({children}: {children: React.ReactNode}) => <div className="min-h-dvh bg-bg text-fg-soft">{children}</div>;

export default OfficeLayout;
