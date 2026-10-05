import {eventBadge, eventTermsShown} from "@/lib/brain/event-types";
import {safeArticleUrl} from "@/lib/learn/lesson";
import {NEWS_COPY} from "@/lib/learn/copy/news";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import Badge from "@/components/primitives/Badge";
import Disclosure from "@/components/primitives/Disclosure";
import MicroLabel from "@/components/primitives/MicroLabel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import Term from "@/components/primitives/Term";
import type {BriefingSource} from "@/lib/news/briefing";
import type {NewsBriefing as Briefing} from "@/lib/news/page";

// The morning briefing. Everything the model wrote is rendered as a text node — never HTML,
// never markdown (invariant 4) — and every link is a cited article's own stored URL, checked
// to be http(s). The outlets a point draws on are named beside it, so a reader can go and read
// what it summarises.

const SOURCES_SHOWN = 2;

const Sources = ({sources}: {sources: BriefingSource[]}) => {
    const shown = sources.slice(0, SOURCES_SHOWN);
    const more = sources.length - shown.length;
    return (
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]" data-briefing-sources>
            {shown.map((s) => {
                const href = safeArticleUrl(s.url);
                const name = s.source || 'Source';
                return href
                    ? <a key={s.url} href={href} target="_blank" rel="noopener noreferrer" title={s.headline} className="text-brand hover:underline">{name}</a>
                    : <span key={s.url} title={s.headline} className="text-fg-muted">{name}</span>;
            })}
            {more > 0 && <span className="text-fg-muted">{NEWS_COPY.moreSources(more)}</span>}
        </span>
    );
};

const NewsBriefing = ({briefing}: {briefing: Briefing}) => {
    const eventTypes = briefing.stories.map((s) => s.eventType);
    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <SectionHeading id="news-briefing-heading" spacing="none">{NEWS_COPY.briefingHeading}</SectionHeading>
                <MicroLabel>{NEWS_COPY.briefingCaveat(briefing.date)}</MicroLabel>
            </div>

            {briefing.headline && <p className="mb-3 font-heading text-lg font-semibold leading-snug text-fg" data-briefing-headline>{briefing.headline}</p>}

            <ul className="divide-y divide-line-strong/20 border-y border-line-strong/20">
                {briefing.bullets.map((bullet) => (
                    <li className="py-3" key={bullet.text}>
                        <span className="block text-sm leading-relaxed text-fg" data-briefing-bullet>{bullet.text}</span>
                        <Sources sources={bullet.sources}/>
                    </li>
                ))}
            </ul>

            {briefing.touches.length > 0 && (
                <p className="mt-3 text-xs text-fg-soft" data-briefing-touches>{NEWS_COPY.touches(briefing.touches)}</p>
            )}

            {briefing.stories.length > 0 && (
                <Disclosure className="mt-4" summary={`${NEWS_COPY.storiesHeading} (${briefing.stories.length})`} id="news-briefing-stories">
                    <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        {briefing.stories.map((story) => {
                            const badge = eventBadge(story.eventType);
                            return (
                                <RowCard as="li" key={story.title}>
                                    <span className="flex flex-wrap items-center gap-2">
                                        {badge && <Term k={badge.term} className="no-underline"><Badge>{badge.label}</Badge></Term>}
                                        {story.tickers.slice(0, 3).map((t) => <Badge key={t} tone="brand" variant="outline">{t}</Badge>)}
                                    </span>
                                    <span className="mt-1.5 block font-heading text-sm font-semibold text-fg">{story.title}</span>
                                    <span className="mt-1 block text-xs leading-relaxed text-fg-muted">{story.summary}</span>
                                    <Sources sources={story.sources}/>
                                </RowCard>
                            );
                        })}
                    </ul>
                </Disclosure>
            )}

            <p className="mt-3 text-[11px] text-fg-muted">{NEWS_COPY.briefingNote}</p>
            <WhatTheseMean keys={eventTermsShown(eventTypes)}/>
        </div>
    );
};

export default NewsBriefing;
