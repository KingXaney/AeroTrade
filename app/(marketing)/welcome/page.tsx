import type {Metadata} from "next";
import Link from "next/link";
import {LANDING_BALANCE, LANDING_COPY} from "@/lib/learn/copy/landing";
import {DEFAULT_TOPIC_NAMES} from "@/lib/topics/starters";
import {TOPIC_BRIEF_COPY} from "@/lib/learn/copy/topics";
import ThemeDemo from "@/components/landing/ThemeDemo";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {actionButton} from "@/components/primitives/ActionButton";
import {rowCard} from "@/components/primitives/RowCard";

// The front door. proxy.ts shows this page at "/" to a visitor with no session (a rewrite, so
// the address stays "/"); a signed-in reader gets Home there instead. It reads nothing — no
// session, no database — so it renders the same for everyone and cannot fail on a missing key.
//
// Every sentence is lib/learn/copy/landing.ts. The preview is drawn with the app's own
// primitives, so it follows the theme, and it is labelled as an example: it shows the shape of
// a screen, never a claim about a market or an account.

export const metadata: Metadata = {
    title: LANDING_COPY.metaTitle,
    description: LANDING_COPY.metaDescription,
};

const Logo = () => (
    <Link href="/" className="flex items-center gap-2">
        <span className="material-symbols-outlined text-brand-strong" style={{fontVariationSettings: "'FILL' 1"}}>terminal</span>
        <span className="font-heading text-xl font-semibold tracking-tighter text-brand">AeroTrade</span>
    </Link>
);

const Welcome = () => (
    <div className="min-h-screen text-fg-soft" data-landing>
        <header className="header">
            <div className="header-wrapper mx-auto max-w-6xl">
                <Logo/>
                <nav aria-label="Account" className="flex items-center gap-2">
                    <Link href="/sign-in" className={actionButton({variant: 'secondary', size: 'md'})}>{LANDING_COPY.signIn}</Link>
                    <Link href="/sign-up" className={actionButton({size: 'md', className: 'hidden sm:inline-block'})}>{LANDING_COPY.signUp}</Link>
                </nav>
            </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-16 px-6 pb-20 pt-28">
            {/* Hero */}
            <section className="grid items-center gap-10 lg:grid-cols-2" aria-labelledby="landing-title">
                <div>
                    <MicroLabel tone="brand">{LANDING_COPY.eyebrow}</MicroLabel>
                    <h1 id="landing-title" className="mt-3 font-heading text-4xl font-semibold leading-tight tracking-tight text-fg md:text-5xl">
                        {LANDING_COPY.title}
                    </h1>
                    <p className="mt-5 max-w-xl text-base leading-relaxed text-fg-soft">{LANDING_COPY.subtitle}</p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Link href="/sign-up" className={actionButton({variant: 'strong', size: 'block', className: 'w-auto px-6 [box-shadow:var(--glow)]'})} data-landing-cta>
                            {LANDING_COPY.signUp}
                        </Link>
                        <Link href="/sign-in" className={actionButton({variant: 'secondary', size: 'block', className: 'w-auto px-6'})}>
                            {LANDING_COPY.signIn}
                        </Link>
                    </div>
                </div>

                {/* The example screen: the app's own boxes, with nothing in them that is a claim. */}
                <div aria-hidden="true" className="space-y-3" data-landing-preview>
                    <MicroLabel>{LANDING_COPY.previewLabel}</MicroLabel>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Panel as="div">
                            <SectionHeading as="h3" size="xs" spacing="sm">{LANDING_COPY.previewAccount}</SectionHeading>
                            <p className="font-heading text-2xl font-semibold text-fg">{LANDING_BALANCE}</p>
                        </Panel>
                        <Panel as="div">
                            <SectionHeading as="h3" size="xs" spacing="sm">{LANDING_COPY.previewTopics}</SectionHeading>
                            <ul className="space-y-1.5">
                                {DEFAULT_TOPIC_NAMES.slice(0, 3).map((name) => (
                                    <li key={name} className="flex items-center gap-2 text-sm text-fg">
                                        <span className="size-2 shrink-0 rounded-full bg-brand"/>{name}
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    </div>
                    <Panel as="div">
                        <SectionHeading as="h3" size="xs" spacing="sm">{LANDING_COPY.previewBriefing}</SectionHeading>
                        <ul className="space-y-2">
                            {LANDING_COPY.previewBullets.map((bullet) => (
                                <li key={bullet} className={rowCard({className: 'text-sm text-fg-soft'})}>{bullet}</li>
                            ))}
                        </ul>
                        <MicroLabel as="p" className="mt-3">{TOPIC_BRIEF_COPY.caveat}</MicroLabel>
                    </Panel>
                </div>
            </section>

            {/* Pillars */}
            <section aria-labelledby="landing-pillars">
                <h2 id="landing-pillars" className="sr-only">{LANDING_COPY.pillarsHeading}</h2>
                <div className="grid gap-4 lg:grid-cols-3">
                    {LANDING_COPY.pillars.map((pillar) => (
                        <Panel key={pillar.id} as="article" pad={6} id={`landing-${pillar.id}`}>
                            <span className="material-symbols-outlined text-3xl text-brand" aria-hidden="true">{pillar.icon}</span>
                            <h3 className="mt-3 font-heading text-xl font-semibold text-fg">{pillar.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-fg-soft">{pillar.body}</p>
                            <ul className="mt-4 space-y-2">
                                {pillar.points.map((point) => (
                                    <li key={point} className="flex gap-2 text-sm text-fg-muted">
                                        <span className="material-symbols-outlined shrink-0 text-base text-brand" aria-hidden="true">check</span>
                                        <span>{point}</span>
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    ))}
                </div>
            </section>

            {/* How it starts */}
            <section aria-labelledby="landing-steps">
                <h2 id="landing-steps" className="font-heading text-2xl font-semibold text-fg">{LANDING_COPY.stepsHeading}</h2>
                <ol className="mt-5 grid gap-4 md:grid-cols-3">
                    {LANDING_COPY.steps.map((step, i) => (
                        <Panel key={step.title} as="li">
                            <MicroLabel tone="brand">{`0${i + 1}`}</MicroLabel>
                            <h3 className="mt-2 font-heading text-base font-semibold text-fg">{step.title}</h3>
                            <p className="mt-1 text-sm leading-relaxed text-fg-muted">{step.body}</p>
                        </Panel>
                    ))}
                </ol>
            </section>

            {/* Themes */}
            <Panel pad={6} aria-labelledby="landing-themes" className="grid items-center gap-6 lg:grid-cols-2">
                <div>
                    <h2 id="landing-themes" className="font-heading text-2xl font-semibold text-fg">{LANDING_COPY.themesHeading}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-fg-soft">{LANDING_COPY.themesBody}</p>
                </div>
                <ThemeDemo/>
            </Panel>

            {/* Closing */}
            <section className="text-center" aria-labelledby="landing-closing">
                <h2 id="landing-closing" className="font-heading text-3xl font-semibold text-fg">{LANDING_COPY.closingTitle}</h2>
                <p className="mt-2 text-sm text-fg-soft">{LANDING_COPY.closingBody}</p>
                <Link href="/sign-up" className={actionButton({variant: 'strong', size: 'block', className: 'mt-6 inline-block w-auto px-8 [box-shadow:var(--glow)]'})}>
                    {LANDING_COPY.signUp}
                </Link>
            </section>
        </main>

        <footer className="border-t border-line-strong/20 px-6 py-8 text-center">
            <p className="mx-auto max-w-2xl text-xs leading-relaxed text-fg-muted" data-landing-disclaimer>{LANDING_COPY.disclaimer}</p>
            <p className="mt-2 font-mono text-[11px] text-fg-muted">{LANDING_COPY.credit}</p>
        </footer>
    </div>
);

export default Welcome;
