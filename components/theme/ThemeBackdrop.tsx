'use client';

import ParticleBackground from "@/components/theme/ParticleBackground";
import {useTheme} from "@/components/theme/ThemeProvider";

// Ambient layer behind the app for styles that have one. Mounted once in the
// root layout; the CSS for the blobs and the futuristic grid lives in globals.css.
const ThemeBackdrop = () => {
    const {theme, tokens} = useTheme();

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
