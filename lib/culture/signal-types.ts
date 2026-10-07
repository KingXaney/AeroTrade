// The evidence badges: seven of the extractor's eight labels, 'other' none, each a glossary
// `signal-*` entry. Import-free apart from a type, so client components can draw a badge
// without zod or the catalog. lib/brain/event-types.ts is the news brain's twin.

import type {GlossaryKey} from "@/lib/learn/glossary";
import {CULTURE_SIGNALS, type CultureSignal} from "@/lib/culture/types";

export type SignalBadge = {label: string; term: GlossaryKey};

export const SIGNAL_BADGES: Record<Exclude<CultureSignal, 'other'>, SignalBadge> = {
    adoption: {label: 'Adoption', term: 'signal-adoption'},
    hype: {label: 'Hype', term: 'signal-hype'},
    backlash: {label: 'Backlash', term: 'signal-backlash'},
    substitution: {label: 'Substitution', term: 'signal-substitution'},
    drop: {label: 'Drop', term: 'signal-drop'},
    price: {label: 'Price talk', term: 'signal-price'},
    fading: {label: 'Fading', term: 'signal-fading'},
};

export const SIGNAL_KINDS = CULTURE_SIGNALS;

// The badge for a stored label; null for 'other' and for anything the extractor never wrote.
export const signalBadge = (value: unknown): SignalBadge | null =>
    typeof value === 'string' && value !== 'other' && value in SIGNAL_BADGES ? SIGNAL_BADGES[value as Exclude<CultureSignal, 'other'>] : null;

// The glossary keys of the labels shown, once each, in the extractor's order.
export const signalTermsShown = (values: readonly unknown[]): GlossaryKey[] => {
    const shown = new Set(values.map(signalBadge).filter((badge): badge is SignalBadge => badge !== null).map((badge) => badge.term));
    return CULTURE_SIGNALS.filter((kind) => kind !== 'other').map((kind) => SIGNAL_BADGES[kind as Exclude<CultureSignal, 'other'>].term).filter((term) => shown.has(term));
};
