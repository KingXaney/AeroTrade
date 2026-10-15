import Link from "next/link";
import {CULTURE_PROFILES} from "@/lib/culture/config";
import {TRADED_BY_COPY} from "@/lib/learn/copy/portfolio";
import type {TradedBy as TradedByView} from "@/lib/trading/traded-by";

// One line under an account's name on /portfolio when an automated trader places its fills:
// which one, whether it is paused, and the way to its decisions. Drawn only when there is one
// (invariant 8); the trade log's chips still name each fill's source.
const TradedBy = ({by}: {by: TradedByView}) => {
    if (!by) return null;
    const culture = by.kind === 'culture';
    const text = culture ? TRADED_BY_COPY.culture(CULTURE_PROFILES[by.profile].label) : TRADED_BY_COPY.navigator;
    const href = culture ? '/culture?view=picks' : '/brain?view=navigator';
    return (
        <p className="text-xs text-fg-muted inline-flex flex-wrap items-center gap-1.5" data-traded-by={culture ? `culture:${by.profile}` : 'navigator'}>
            <span className="material-symbols-outlined text-sm text-brand" aria-hidden>smart_toy</span>
            <span>{text}{culture && by.status === 'paused' ? ` (${TRADED_BY_COPY.paused})` : ''}</span>
            <Link href={href} className="text-brand hover:underline">{TRADED_BY_COPY.link}</Link>
        </p>
    );
};

export default TradedBy;
