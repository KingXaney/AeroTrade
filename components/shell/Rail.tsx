'use client';

import Link from "next/link";
import {usePathname} from "next/navigation";
import {HoverCard, Tooltip} from "radix-ui";
import {cn} from "@/lib/utils";
import {NAV_SECTIONS, sectionFor, type NavBadges, type NavSection} from "@/lib/shell/navigation";
import {dotLabel} from "@/lib/learn/copy/shell";
import PortfolioSidebarCard from "@/components/shell/PortfolioSidebarCard";
import NewsSidebarCard from "@/components/shell/NewsSidebarCard";
import {useNewsSeen} from "@/components/shell/useNewsSeen";
import type {SidebarNews, SidebarPortfolio} from "@/lib/shell/sidebar";

// The desktop navigation: one icon per section, 64px wide, on every page. It replaced a header
// of eight tabs repeated inside a sidebar of thirteen links and two summary cards.
//
// The rail never widens. A name is a tooltip and a summary is a hover card, both portaled: a
// rail that grew on hover would clip its own flyouts (overflow) or strip their blur (a
// backdrop-filter ancestor), and would push a summary over the page each time the pointer
// crossed it. What the old cards showed all the time — something new in a followed topic since
// the reader last opened News, an unpriced holding — is a dot on the icon, so it is never
// hover-only (invariant 8).
//
// The News dot is cleared locally the moment a News page stamps the look (useNewsSeen): the
// layout does not re-render on a soft navigation, so the server's count would otherwise stay
// lit all session. Server truth returns on the next full load.

type Props = {
    portfolio: SidebarPortfolio | null;
    news: SidebarNews;
    badges: NavBadges;
};

const POPUP = 'chrome-surface z-[70] rounded-lg data-[state=closed]:hidden';

const Rail = ({portfolio, news, badges}: Props) => {
    const pathname = usePathname();
    const current = sectionFor(pathname);
    const clearedAt = useNewsSeen();

    const countFor = (section: NavSection): number => {
        if (!section.badge) return 0;
        if (section.badge === 'newsNew' && clearedAt !== null) return 0;
        return badges[section.badge] ?? 0;
    };

    const item = (section: NavSection) => {
        const active = current?.id === section.id;
        const count = countFor(section);
        return (
            <Link
                href={section.pages[0].href}
                aria-label={count > 0 && section.badge ? `${section.label}, ${dotLabel(section.badge, count)}` : section.label}
                aria-current={active ? 'page' : undefined}
                data-rail={section.id}
                className={cn(
                    'relative flex size-11 items-center justify-center rounded-lg transition-colors outline-none focus-visible:outline-2 focus-visible:outline-brand-strong',
                    active ? 'bg-brand/10 text-brand' : 'text-fg-soft hover:bg-surface-3 hover:text-fg',
                )}
            >
                <span className="material-symbols-outlined" aria-hidden="true"
                      style={active ? {fontVariationSettings: "'FILL' 1"} : undefined}>{section.icon}</span>
                {count > 0 && (
                    <span aria-hidden="true"
                          className={cn('absolute right-2 top-2 size-2 rounded-full', section.badge === 'unpriced' ? 'bg-warning' : 'bg-brand')}/>
                )}
            </Link>
        );
    };

    const flyout = (section: NavSection) => {
        // Straight after the stamp the card says "Since you last looked · just now".
        if (section.flyout === 'news') return <NewsSidebarCard news={news} seenAt={clearedAt ?? news.seenAt}/>;
        if (section.flyout === 'portfolio' && portfolio) return <PortfolioSidebarCard portfolio={portfolio}/>;
        return null;
    };

    return (
        <aside className="rail hidden lg:flex">
            <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
                <nav aria-label="Sections" className="flex flex-col items-center gap-1.5 py-4 w-full">
                    {NAV_SECTIONS.map((section) => {
                        const card = flyout(section);
                        return card ? (
                            <HoverCard.Root key={section.id} openDelay={150} closeDelay={120}>
                                <HoverCard.Trigger asChild>{item(section)}</HoverCard.Trigger>
                                <HoverCard.Portal>
                                    <HoverCard.Content side="right" align="start" sideOffset={12} className={cn(POPUP, 'w-64 p-2')}
                                                       data-rail-flyout={section.id}>
                                        {card}
                                    </HoverCard.Content>
                                </HoverCard.Portal>
                            </HoverCard.Root>
                        ) : (
                            <Tooltip.Root key={section.id}>
                                <Tooltip.Trigger asChild>{item(section)}</Tooltip.Trigger>
                                <Tooltip.Portal>
                                    {/* The link already carries the name as its aria-label. */}
                                    <Tooltip.Content side="right" sideOffset={12} aria-hidden="true" data-rail-tip={section.id}
                                                     className={cn(POPUP, 'control-type px-2.5 py-1.5 text-xs text-fg')}>
                                        {section.label}
                                    </Tooltip.Content>
                                </Tooltip.Portal>
                            </Tooltip.Root>
                        );
                    })}
                </nav>
            </Tooltip.Provider>
        </aside>
    );
};

export default Rail;
