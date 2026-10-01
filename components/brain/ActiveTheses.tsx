import Link from "next/link";
import {cn, getChangeColorClass} from "@/lib/utils";
import {formatSigned} from "@/lib/format";
import TradeLink from "@/components/trade/TradeLink";
import FollowTopicButton from "@/components/topics/FollowTopicButton";
import type {FollowedByName} from "@/components/brain/NarrativeLeaderboard";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {BRAIN_COPY} from "@/lib/learn/copy/brain";
import type {SinceThesisLegs} from "@/lib/brain/since-thesis";
import {evidenceHref} from "@/lib/brain/links";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// Same pattern as formatTimeAgoMs — time-relative display computed in a helper.
const weeksActive = (thesisSince: number | null): number =>
    thesisSince ? Math.max(1, Math.round((Date.now() - thesisSince) / MS_PER_WEEK)) : 0;

type Props = {
    theses: BrainEntitySummary[];
    followedByName?: FollowedByName;
    // Ticker key → both legs of "since thesis"; a thesis without an entry shows no line.
    sinceThesis?: Record<string, SinceThesisLegs>;
    // Opts the page into the panel's "What these mean". The active-theses widget never passes
    // it (no definitions or "Ask in chat" on a dashboard widget, invariant 12) nor sinceThesis.
    definitions?: boolean;
};

// The centerpiece of /brain: narratives whose SLOW-layer weight has sustained above
// the thesis threshold — "where the market's favor has been shifting for weeks".
const ActiveTheses = ({theses, followedByName, sinceThesis, definitions = false}: Props) => {
    if (theses.length === 0) {
        return (
            <p className="text-sm text-fg-muted">
                No active theses yet. A narrative becomes a thesis once it keeps accumulating
                attention for several weeks — check back as the brain ingests more news.
            </p>
        );
    }

    const anySince = theses.some((t) => sinceThesis?.[t.key] !== undefined);
    return (
        <div className="space-y-1.5">
            {theses.map((t) => {
                const weeks = weeksActive(t.thesisSince);
                const since = sinceThesis?.[t.key];
                return (
                    <div key={t.key}
                         className="flex items-center justify-between px-4 py-3 rounded-lg border bg-surface-2/40 border-brand/15">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-base text-brand">trending_up</span>
                            <div>
                                {/* A row used to be a dead end. The name opens the evidence behind
                                    the thesis; the follow button stays a sibling, never nested. */}
                                <Link href={evidenceHref(t.key)}
                                      className="text-sm font-semibold text-fg hover:text-brand transition-colors" style={{fontFamily: 'var(--type-display)'}}>
                                    {t.displayName}
                                </Link>
                                <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                                    {t.type} · active {weeks} {weeks === 1 ? 'week' : 'weeks'}
                                    {t.type === 'ticker' && (
                                        <> · <Link href={`/stocks/${encodeURIComponent(t.key)}`} className="text-brand hover:underline normal-case tracking-normal">stock page</Link></>
                                    )}
                                </div>
                                {since && (
                                    <div data-testid="since-thesis" className="font-mono text-[11px] text-fg-soft"
                                         title={BRAIN_COPY.sinceThesisWindow(since.from, since.to)}>
                                        <Term k="since-thesis">{BRAIN_COPY.sinceThesisLabel}</Term>: {BRAIN_COPY.sinceThesisFigures(t.key, since.symbolPct, since.spyPct)}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-right" style={{fontFamily: 'var(--type-mono)'}}>
                                <div className="text-sm text-fg"><Term k="news-weight">weight</Term> {t.weightSlow.toFixed(1)}</div>
                                <div className={cn('text-xs', getChangeColorClass(t.sentimentSlow || undefined))}>
                                    <Term k="news-sentiment">sentiment</Term> {formatSigned(t.sentimentSlow)}
                                </div>
                            </div>
                            {t.type === 'ticker' && <TradeLink symbol={t.key} variant="icon" className="size-7" />}
                            {followedByName && (
                                <FollowTopicButton name={t.displayName} keywords={t.type === 'ticker' ? [t.displayName, t.key] : [t.displayName]}
                                                   followed={followedByName[t.displayName.toLowerCase()] ?? null} />
                            )}
                        </div>
                    </div>
                );
            })}
            {definitions && <WhatTheseMean keys={['thesis', 'news-weight', 'news-sentiment', ...(anySince ? ['since-thesis'] : [])]} />}
        </div>
    );
};

export default ActiveTheses;
