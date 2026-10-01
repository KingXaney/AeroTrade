// The kind of event an article covers, as the brain's extractor labels it
// (lib/brain/extraction.ts ExtractionBatchSchema), turned into the badge the evidence list
// prints on each row. Eight of the nine labels get a badge; 'other' says nothing, so it
// gets none. What each label means lives in the glossary (event-* entries), which the
// badge carries as its title and the evidence panel's one "What these labels mean" lists.
//
// Pure and import-free apart from a type: the extractor's schema is held to this list by
// the test, not by an import, so a client tree can read it without pulling zod.

import type {GlossaryKey} from '@/lib/learn/glossary';

export const EVENT_TYPES = [
    'earnings', 'guidance', 'mna', 'product', 'macro', 'regulatory', 'analyst', 'legal', 'other',
] as const;

type EventType = (typeof EVENT_TYPES)[number];

export type EventBadge = {label: string; term: GlossaryKey};

export const EVENT_BADGES: Readonly<Record<Exclude<EventType, 'other'>, EventBadge>> = {
    earnings: {label: 'Earnings', term: 'event-earnings'},
    guidance: {label: 'Guidance', term: 'event-guidance'},
    mna: {label: 'M&A', term: 'event-mna'},
    product: {label: 'Product', term: 'event-product'},
    macro: {label: 'Macro', term: 'event-macro'},
    regulatory: {label: 'Regulatory', term: 'event-regulatory'},
    analyst: {label: 'Analyst', term: 'event-analyst'},
    legal: {label: 'Legal', term: 'event-legal'},
};

const isBadged = (value: unknown): value is Exclude<EventType, 'other'> =>
    typeof value === 'string' && value !== 'other' && Object.prototype.hasOwnProperty.call(EVENT_BADGES, value);

// A stored label's badge, or null for 'other', a missing extraction or anything else.
export const eventBadge = (value: unknown): EventBadge | null => (isBadged(value) ? EVENT_BADGES[value] : null);

// The glossary keys of the badges a list shows, once each, in the extractor's order: the
// panel's "What these labels mean" defines only what is on screen.
export const eventTermsShown = (values: readonly unknown[]): GlossaryKey[] =>
    EVENT_TYPES.filter((type) => isBadged(type) && values.includes(type)).map((type) => EVENT_BADGES[type as Exclude<EventType, 'other'>].term);
