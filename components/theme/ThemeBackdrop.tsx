'use client';

import {usePathname} from "next/navigation";
import ParticleBackground from "@/components/theme/ParticleBackground";
import {useTheme} from "@/components/theme/ThemeProvider";

// Ambient layer behind the app for styles that have one. Mounted once in the
// root layout; the CSS for the blobs and the futuristic grid lives in globals.css.
// A poker night table (/play/CODE) and the trading agent world's office (/agent-world/office) draw
// their own scenes, so the backdrop stays out of them.
const ThemeBackdrop = () => {
    const {theme, tokens} = useTheme();
    const pathname = usePathname();

    if (pathname?.startsWith('/play/') || pathname?.startsWith('/agent-world/office')) return null;

    if (theme.style === 'futuristic') {
        return <ParticleBackground color={tokens.brand} reduced={theme.reduceMotion} />;
    }

    if (theme.style === 'liquid-glass') {
        return (
            <div className="theme-blobs" aria-hidden="true">
                <span className="theme-blob theme-blob--1" />
                <span className="theme-blob theme-blob--2" />
                <span className="theme-blob theme-blob--3" />
            </div>
        );
    }

    return null;
};

export default ThemeBackdrop;
