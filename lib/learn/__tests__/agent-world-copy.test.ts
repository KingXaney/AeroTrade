// Every sentence the trading agent world shows, held to the no-advice list at the copy tier; the
// legend's to mechanism only besides (lib/agent-world/__tests__/legend.test.ts). The ratings' own
// words are data labels in lib/agent-world/config.ts, never sentences, and are held to their shape.

import {describe, expect, it} from 'vitest';
import {
    DATA_CATEGORIES,
    ORDER_SIDE_LABELS,
    RATING_LABELS,
    RATINGS,
    ROLE_IDS,
    RUN_STATUSES,
    SESSION_KINDS,
    SESSION_STATUSES,
    STAGE_STATUSES,
    TEAM_IDS,
} from '@/lib/agent-world/config';
import {findBanned} from '@/lib/learn/banned';
import {GLOSSARY} from '@/lib/learn/glossary';
import {
    ACTION_COPY,
    AGENT_WORLD_COPY,
    AGENT_WORLD_LEGEND_COPY,
    APPROVAL_COPY,
    COMPANY_COPY,
    COMPANY_TERMS,
    DATA_CATEGORY_COPY,
    DATA_COPY,
    DATA_TERMS,
    DECISION_TERMS,
    FLOOR_COPY,
    KIND_COPY,
    RECORD_COPY,
    RECORD_TERMS,
    REPLAY_COPY,
    REPORT_TERMS,
    ROLE_COPY,
    RUN_STATUS_COPY,
    SESSIONS_COPY,
    SESSIONS_TERMS,
    STAGE_STATUS_COPY,
    STATUS_COPY,
    STRIP_TERMS,
    TEAM_COPY,
} from '@/lib/learn/copy/agent-world';

const clean = (text: string) => {
    expect(text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

// Every string of an object, nested objects' strings included, and every function called on its
// sample (a function without one fails).
const rendered = (copy: Record<string, unknown>, samples: Record<string, unknown[]>): string[] =>
    Object.entries(copy).flatMap(([name, value]) => {
        if (typeof value === 'string') return [value];
        if (typeof value === 'function') {
            expect(samples, `no sample for ${name}`).toHaveProperty(name);
            return [(value as (...a: unknown[]) => string)(...samples[name])];
        }
        if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
        return [];
    });

describe('the /agent-world page copy', () => {
    it('holds every sentence of every view to the copy tier', () => {
        const texts = [
            ...rendered(AGENT_WORLD_COPY, {pageSubtitle: [3], nextSession: ['Nov 2, 8:30 AM ET']}),
            ...rendered(FLOOR_COPY, {
                live: [3], tileStats: [4, '12.4k', '$0.04'], reportPending: ['News analyst'], reportMissing: ['News analyst'], round: [1],
                runFailed: ['timeout'], fillLine: ['AAPL', false, 10, '$180.00'], fillFailed: ['AAPL', "Couldn't fetch a live price for AAPL"],
                costLine: [31, 12, '48.2k', '9.1k', '$0.19'], serviceStopped: ['budget: the company is paused'],
            }),
            ...rendered(APPROVAL_COPY, {lapses: ['Oct 29, 8:30 AM ET', '2 days'], approved: ['owner@example.com', 'Oct 26, 10:12 AM ET'], declined: ['owner@example.com', 'Oct 26, 10:12 AM ET'], lapsed: ['Oct 29, 8:30 AM ET']}),
            ...rendered(REPLAY_COPY, {running: [42], note: [20]}),
            ...rendered(RECORD_COPY, {since: ['2026-10-26']}),
            ...rendered(SESSIONS_COPY, {line: ['2026-10-26', 'Weekly', 3], cost: ['$0.19'], fills: [1, 2]}),
            ...rendered(COMPANY_COPY, {companyBudget: ['$4.12', '$30.00'], agentBudget: ['$0.41', '$2.00']}),
            ...rendered(DATA_COPY, {worker: [true], checked: ['2 minutes ago'], vendorGroup: ['OpenBB', 14, '6.2 s'], fellBack: ['OpenBB'], fetchedIn: ['aw-2026-10-26']}),
            ...rendered(ACTION_COPY, {}),
            ...Object.values(AGENT_WORLD_COPY.off),
            ...Object.values(ROLE_COPY).flatMap((role) => [role.name, role.line]),
            ...Object.values(TEAM_COPY), ...Object.values(STATUS_COPY), ...Object.values(STAGE_STATUS_COPY), ...Object.values(RUN_STATUS_COPY),
            ...Object.values(KIND_COPY), ...Object.values(DATA_CATEGORY_COPY),
        ];
        expect(texts.length).toBeGreaterThan(120);
        for (const text of texts) clean(text);
    });

    it('says the caveat as a description, never as advice', () => {
        expect(AGENT_WORLD_COPY.caveat).toContain('shown as written');
        expect(AGENT_WORLD_COPY.caveat).toContain('not advice to a reader');
        expect(FLOOR_COPY.fillLine('AAPL', true, 1, '$1.00')).toBe('AAPL: sold 1 share at $1.00');
        expect(FLOOR_COPY.fillLine('AAPL', false, 100, '$180.00')).toBe('AAPL: bought 100 shares at $180.00');
    });

    it('holds the legend\'s sentences to the copy tier', () => {
        const texts = rendered(AGENT_WORLD_LEGEND_COPY, {
            session: [3, 'AAPL, MSFT, NVDA'], account: ['$100,000'], order: ['Analysts, then Trading'], rounds: [1, 2], models: ['quick', 'deep'],
            scale: ['Buy 20%, Sell 0%'], rails: ['25%', '5%', '2%'], lapse: ['Friday', '15:30', 72], company: [80, 100], data: ['prices from OpenBB'],
            schedule: ['Monday', 'Tuesday', '08:30'], wait: [48], polling: [3, 30], replay: [20], killSwitch: ['AGENT_WORLD_ENABLED'],
        });
        for (const text of texts) clean(text);
    });

    it('words every role, team, status and data category the config names, and no other', () => {
        expect(Object.keys(ROLE_COPY)).toEqual([...ROLE_IDS]);
        expect(Object.keys(TEAM_COPY)).toEqual([...TEAM_IDS]);
        expect(Object.keys(STATUS_COPY)).toEqual([...SESSION_STATUSES]);
        expect(Object.keys(STAGE_STATUS_COPY)).toEqual([...STAGE_STATUSES]);
        expect(Object.keys(RUN_STATUS_COPY)).toEqual([...RUN_STATUSES]);
        expect(Object.keys(KIND_COPY)).toEqual([...SESSION_KINDS]);
        expect(Object.keys(DATA_CATEGORY_COPY)).toEqual([...DATA_CATEGORIES]);
        for (const role of ROLE_IDS) expect(ROLE_COPY[role].line.endsWith('.'), role).toBe(true);
    });

    it('keeps the ratings\' and the sides\' words as one-word data labels, outside every sentence', () => {
        // A word alone reads as an order to findBanned, which is why these live in config, are
        // drawn inside a badge or a cell, and are checked by shape instead.
        expect(Object.keys(RATING_LABELS)).toEqual([...RATINGS]);
        for (const label of [...Object.values(RATING_LABELS), ...Object.values(ORDER_SIDE_LABELS)]) expect(label).toMatch(/^[A-Z][a-z]+$/);
    });

    it('lists only glossary keys in every panel\'s term list', () => {
        for (const key of [...STRIP_TERMS, ...REPORT_TERMS, ...DECISION_TERMS, ...RECORD_TERMS, ...SESSIONS_TERMS, ...COMPANY_TERMS, ...DATA_TERMS]) {
            expect(GLOSSARY, key).toHaveProperty(key);
        }
    });
});
