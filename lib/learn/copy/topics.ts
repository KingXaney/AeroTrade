// Copy for the topics pages: a followed topic's AI brief caveat and the line a topic page shows
// before its first one; the starter chips the empty state and the manage view both offer; and the
// manage view itself (/topics?edit=1). The brief is model output, rendered as plain text
// (invariant 4); these frame it. The test holds every string to the 'copy' tier of lib/learn/banned.ts.

import type {TopicOfferGroup} from '@/lib/topics/manage';
import {DIGEST_ARTICLES_PER_TOPIC, DIGEST_TOPIC_CAP} from '@/lib/topics/config';

const CAVEAT = 'AI summary · may contain errors';

export const TOPIC_BRIEF_COPY = {
    caveat: CAVEAT,
    // In a list without the brief's own heading, the date leads the caveat.
    datedCaveat: (date: string): string => `${date} · ${CAVEAT}`,
    firstBrief: 'Your first “what changed today” brief arrives after tonight\'s refresh.',
} as const;

// The starter chips, shared by TopicsEmptyState and TopicsManager.
export const TOPIC_PICKER_COPY = {
    groups: {
        finance: 'Markets & macro',
        world: 'World news',
        brain: 'What the News Brain is tracking',
    } satisfies Record<TopicOfferGroup, string>,
    // "Follow 2 selected" / "Follow selected"
    followSelected: (count: number): string => count > 0 ? `Follow ${count} selected` : 'Follow selected',
    // "Following 1 topic" / "Following 3 topics"
    following: (count: number): string => count === 1 ? 'Following 1 topic' : `Following ${count} topics`,
} as const;

export const TOPICS_MANAGE_COPY = {
    editTopics: 'Edit topics',
    done: 'Done',
    // The overview's self-extinguishing notice; the QA suite matches /came preinstalled/i.
    preinstalled: 'These came preinstalled to get you started — edit or remove any of them, or add your own.',
    yourTopics: 'Your topics',
    // "6 of 16 followed"
    followedOf: (count: number, max: number): string => `${count} of ${max} followed`,
    // "federal reserve · fomc · fed funds rate · +5 more · 1 excluded" — the first three terms, then the counts.
    keywordLine: (keywords: readonly string[], exclude: readonly string[]): string => {
        const shown = keywords.slice(0, 3);
        const hidden = keywords.length - shown.length;
        const parts = [...shown];
        if (hidden > 0) parts.push(`+${hidden} more`);
        if (exclude.length > 0) parts.push(exclude.length === 1 ? '1 excluded' : `${exclude.length} excluded`);
        return parts.join(' · ');
    },
    // "3 new"; a count already formatted for print ("99+") passes through as it is.
    newCount: (count: number | string): string => `${count} new`,
    edit: 'Edit',
    editRow: (name: string): string => `Edit ${name}`,
    remove: 'Remove',
    removeRow: (name: string): string => `Remove ${name}`,
    // The toast that carries Undo.
    removed: (name: string): string => `Stopped following "${name}"`,
    undo: 'Undo',
    removeFailed: 'Could not remove the topic',
    restored: (name: string): string => `Following "${name}" again`,
    undoFailed: 'Could not bring the topic back',
    addTopics: 'Add topics',
    addOwn: 'Add your own',
    // The toast when a chip would pass the cap: "Room for 2 more topics."
    roomFor: (count: number): string => count === 1 ? 'Room for 1 more topic.' : `Room for ${count} more topics.`,
    atCap: (max: number): string => `You follow ${max} of ${max} topics. Remove one to add another.`,
    nothingToAdd: 'You already follow every suggested topic.',
    digestNote: `The noon ET digest has a separate “Your topics” section when enabled: up to ${DIGEST_TOPIC_CAP} followed topics, their latest brief, and up to ${DIGEST_ARTICLES_PER_TOPIC} recent headlines each.`,
    digestSettings: 'Email settings',
} as const;
