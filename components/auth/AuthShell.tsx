import Link from "next/link";
import {LANDING_COPY} from "@/lib/learn/copy/landing";

// The two-column chrome around every auth form. Shared by the (auth) group, which
// bounces signed-in users to /, and the (reset) group, which must not: a
// signed-in user has to be able to finish resetting their own password.
//
// The right column says what the app is, in the landing page's own words
// (lib/learn/copy/landing.ts). It used to hold a mock terminal printing a node count and a
// latency the app never measured.
const AuthShell = ({children}: {children: React.ReactNode}) => (
    <main className="auth-layout">
        <section className="auth-left-section scrollbar-hide-default">
            <Link href="/" className="auth-logo flex items-center gap-2">
                <span className="material-symbols-outlined text-brand-strong"
                      style={{ fontVariationSettings: "'FILL' 1" }}>
                    terminal
                </span>
                <span className="text-xl font-semibold tracking-tighter text-brand font-heading">
                    AeroTrade
                </span>
            </Link>

            <div className="pb-6 lg:pb-8 flex-1">{children}</div>
        </section>

        <section className="auth-right-section">
            <div className="z-10 relative lg:mt-4">
                <p className="auth-blockquote">{LANDING_COPY.title}</p>
                <ul className="hidden md:block space-y-5 max-w-xl">
                    {LANDING_COPY.pillars.map((pillar) => (
                        <li key={pillar.id} className="flex gap-4">
                            <span className="material-symbols-outlined text-2xl text-brand shrink-0" aria-hidden="true">{pillar.icon}</span>
                            <div>
                                <p className="font-heading text-base font-semibold text-fg">{pillar.title}</p>
                                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{pillar.points[0]}</p>
                            </div>
                        </li>
                    ))}
                </ul>
                <p className="mt-6 max-md:mt-2 max-md:text-xs text-xs text-fg-muted">{LANDING_COPY.disclaimer}</p>
                <p className="mt-2 max-md:text-xs text-fg-muted font-mono text-xs">{LANDING_COPY.credit}</p>
            </div>
        </section>
    </main>
);

export default AuthShell;
