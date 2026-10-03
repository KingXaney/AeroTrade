// The manage view's pure layer (/topics?edit=1, drawn by components/topics/TopicsManager): what
// the "Add topics" panel offers, how many slots the cap leaves, the chip selection's rules and
// the input Undo re-creates a removed topic from. No reads and no clock, so the view's maths is
// the same on the server and in the browser.

import {MAX_TOPICS_PER_USER} from "@/lib/topics/config";
import {slugify} from "@/lib/topics/normalize";
import {STARTER_TOPICS, type StarterGroup} from "@/lib/topics/starters";
import type {SuggestedTopic, TopicView} from "@/lib/topics/types";

export type TopicOfferGroup = StarterGroup | 'brain';

// A topic the picker offers, keyed by the slug it would be stored under.
export type TopicOffer = SuggestedTopic & {slug: string; group: TopicOfferGroup};

// The order the groups are drawn in.
export const OFFER_GROUPS: readonly TopicOfferGroup[] = ['finance', 'world', 'brain'];

// The shape followStarterTopics and createTopic take (lib/topics/normalize.topicInputSchema).
export type TopicInput = {name: string; keywords: string[]; exclude: string[]; color?: string};

// The starters in list order, then the brain's suggestions, each slug once and none the reader
// already follows: a starter wins over a brain duplicate, and two brain items with one slug keep
// the first.
export const offeredTopics = (followedSlugs: readonly string[], brain: readonly SuggestedTopic[]): TopicOffer[] => {
    const taken = new Set(followedSlugs);
    const offers: TopicOffer[] = [];
    const offer = (item: SuggestedTopic, group: TopicOfferGroup) => {
        const slug = slugify(item.name);
        if (taken.has(slug)) return;
        taken.add(slug);
        offers.push({...item, slug, group});
    };
    for (const {group, ...starter} of STARTER_TOPICS) offer(starter, group);
    for (const item of brain) offer(item, 'brain');
    return offers;
};

export const slotsLeft = (followedCount: number, max: number = MAX_TOPICS_PER_USER): number =>
    Math.max(0, max - followedCount);

// Removing a chip from the selection is always allowed; adding one past the open slots is
// refused and the selection comes back as it was, so the caller can say why.
export const toggleSelection = (
    selected: ReadonlySet<string>,
    slug: string,
    slots: number,
): {next: ReadonlySet<string>; blocked: boolean} => {
    if (selected.has(slug)) {
        const next = new Set(selected);
        next.delete(slug);
        return {next, blocked: false};
    }
    if (selected.size >= slots) return {next: selected, blocked: true};
    return {next: new Set(selected).add(slug), blocked: false};
};

// The selected offers as followStarterTopics takes them, in offer order. A selected slug that is
// no longer offered — followed meanwhile, from the composer or the chat — is dropped.
export const toFollowInputs = (offers: readonly TopicOffer[], selected: ReadonlySet<string>): TopicInput[] =>
    offers
        .filter((offer) => selected.has(offer.slug))
        .map((offer) => ({name: offer.name, keywords: offer.keywords, exclude: offer.exclude ?? []}));

// What Undo re-creates a removed topic from: the same name, keywords, exclusions and colour,
// hence the same slug and keyword set. A stored null colour is "none", which the schema spells
// as absent.
export const topicToInput = (topic: Pick<TopicView, 'name' | 'keywords' | 'exclude' | 'color'>): TopicInput => ({
    name: topic.name,
    keywords: topic.keywords,
    exclude: topic.exclude,
    color: topic.color ?? undefined,
});
