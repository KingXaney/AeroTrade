// Every sentence of the office (/agent-world/office), held to the copy tier: it describes what the
// desk's seats did with their own paper account and never tells a reader what to do. Labels carry
// no full stop; sentences end with one and never open on a side of an order; the legend is
// mechanism only; every keyed table covers exactly the ids the config names.

import {describe, expect, it} from 'vitest';
import {DATA_TOOL_NAMES, PAPERCLIP_DESKS, RATING_LABELS, ROLE_IDS, WORKER_STATUSES} from '@/lib/agent-world/config';
import {OFFICE_PRESET_IDS} from '@/lib/agent-world/office-layout';
import {findBanned} from '@/lib/learn/banned';
import {GLOSSARY} from '@/lib/learn/glossary';
import {
    DESK_COPY,
    DESK_TASK_COPY,
    DOSSIER_COPY,
    OFFICE_COPY,
    OFFICE_KEYS_COPY,
    OFFICE_LEGEND_COPY,
    OFFICE_PRESET_COPY,
    OFFICE_TERMS,
    PROVIDER_LABELS,
    providerLabel,
    ROLE_OUTPUT_COPY,
    ROLE_TASK_COPY,
    SCOREBOARD_COPY,
    TASK_COPY,
    TICKER_COPY,
    TOOL_COPY,
    toolLabel,
    toolWhat,
    WORKER_STATUS_COPY,
    workerName,
    ZONE_COPY,
} from '@/lib/learn/copy/agent-world-office';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged|wins?|loses)\b/i;
const SIDE_OPENING = /^(buy|sell|hold|avoid|trim|dump)\b/i;

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

type Copy = Record<string, unknown>;

// Every function of a group, called with each of its samples; a function without samples fails.
const renderGroup = (name: string, copy: Copy, samples: Record<string, unknown[][]>): {strings: string[]; functions: string[]} => {
    const strings: string[] = [];
    const functions: string[] = [];
    for (const [key, value] of Object.entries(copy)) {
        if (typeof value === 'string') strings.push(value);
        else if (typeof value === 'function') {
            functions.push(key);
            expect(samples, `${name}.${key} has no sample`).toHaveProperty(key);
            for (const args of samples[key]) strings.push((value as (...a: unknown[]) => string)(...args));
        }
    }
    return {strings, functions};
};

const LABELS = Object.values(RATING_LABELS);

const SENTENCE_GROUPS: {name: string; copy: Copy; samples: Record<string, unknown[][]>}[] = [
    {
        name: 'TASK_COPY',
        copy: TASK_COPY,
        samples: {
            fetching: [["AAPL's price bars", 'OpenBB']],
            fellBack: [['OpenBB', '429', 'yfinance']],
            fellBackSilent: [['OpenBB', 'SEC EDGAR']],
            read: [["AAPL's key metrics", 'OpenBB']],
            readAfter: [["AAPL's price bars", 'yfinance', 'OpenBB', '429']],
            readAfterSilent: [["AAPL's balance sheet", 'yfinance', 'SEC EDGAR']],
            unanswered: [["AAPL's balance sheet"]],
            noData: [["AAPL's insider filings", 'OpenBB']],
            bullTurn: [[1], [2]],
            bearTurn: [[1]],
            riskAggressiveTurn: [[1]],
            riskConservativeTurn: [[1]],
            riskNeutralTurn: [[2]],
            spoke: [[1]],
            rated: LABELS.map((label) => ['AAPL', label]),
            review: [['MSFT']],
            stopped: [['NVDA']],
        },
    },
    {
        name: 'DESK_TASK_COPY',
        copy: DESK_TASK_COPY,
        samples: {
            watchingIssue: [['TRA-12']],
            handedInIssue: [['TRA-12']],
            blocked: [['service refused (HTTP 503)'], ['gemini answered 429']],
            filled: [[0, 1], [2, 3], [1, 1]],
            previewPlanned: [[1], [3]],
        },
    },
    {
        name: 'TICKER_COPY',
        copy: TICKER_COPY,
        samples: {
            opened: [['AAPL, MSFT, NVDA']],
            turned: [['MSFT']],
            fetched: [['Market analyst', "AAPL's price bars", 'OpenBB']],
            fetchedAfter: [['Market analyst', "AAPL's price bars", 'yfinance', 'OpenBB', '429']],
            fetchedAfterSilent: [['Fundamentals analyst', "AAPL's balance sheet", 'yfinance', 'SEC EDGAR']],
            unanswered: [['Fundamentals analyst', "AAPL's balance sheet"]],
            noData: [['News analyst', 'the news on AAPL', 'yfinance']],
            filed: [['Market analyst', 'the market report', 'AAPL']],
            argued: [['Bull researcher', 'bull', 1], ['Bear researcher', 'bear', 2]],
            weighed: [['Neutral risk analyst', 1]],
            rated: LABELS.map((label) => ['AAPL', label]),
            review: [['MSFT']],
            runStopped: [['NVDA', 'quota']],
            limited: [['OpenBB (yfinance)', 429]],
            filled: [['AAPL', false, 10, '$200.00'], ['MSFT', true, 1, '$410.50']],
            notFilled: [['MSFT', "Couldn't fetch a live price for MSFT"]],
            serviceStopped: [['no answer from the service in 48m']],
        },
    },
    {
        name: 'OFFICE_LEGEND_COPY',
        copy: Object.fromEntries(Object.entries(OFFICE_LEGEND_COPY).filter(([key]) => key !== 'summary' && !key.endsWith('Heading'))),
        samples: {polling: [[3, 30]], replay: [[60]], windows: [[6]]},
    },
];

describe('the office\'s copy', () => {
    it('holds every sentence group to the copy tier, a full stop each, none opening on a side', () => {
        for (const group of SENTENCE_GROUPS) {
            const {strings, functions} = renderGroup(group.name, group.copy, group.samples);
            expect(Object.keys(group.samples).sort(), `${group.name}: a sample for every function and a function for every sample`).toEqual(functions.sort());
            expect(strings.length, group.name).toBeGreaterThan(3);
            for (const text of strings) {
                clean(text);
                expect(text.endsWith('.'), `${group.name}: ${text}`).toBe(true);
                expect(text, text).not.toMatch(SIDE_OPENING);
            }
        }
    });

    it('keeps the legend to mechanism only', () => {
        const {strings} = renderGroup('OFFICE_LEGEND_COPY', OFFICE_LEGEND_COPY, {polling: [[3, 30]], replay: [[60]], windows: [[6]]});
        for (const text of strings) expect(text, text).not.toMatch(MECHANISM_ONLY);
    });

    it('holds every seat\'s task lines, for every role', () => {
        for (const table of [ROLE_TASK_COPY.waiting, ROLE_TASK_COPY.filed, ROLE_TASK_COPY.done, ROLE_TASK_COPY.started]) {
            expect(Object.keys(table)).toEqual([...ROLE_IDS]);
        }
        for (const role of ROLE_IDS) {
            for (const text of [ROLE_TASK_COPY.waiting[role], ROLE_TASK_COPY.filed[role], ROLE_TASK_COPY.done[role], ROLE_TASK_COPY.started[role]('AAPL')]) {
                clean(text);
                expect(text.endsWith('.'), text).toBe(true);
                expect(text, text).not.toMatch(SIDE_OPENING);
            }
            clean(ROLE_OUTPUT_COPY[role]);
        }
        expect(Object.keys(ROLE_OUTPUT_COPY)).toEqual([...ROLE_IDS]);
    });

    it('names the desks, the statuses, the presets and the tools for exactly the ids the config has', () => {
        expect(Object.keys(WORKER_STATUS_COPY)).toEqual([...WORKER_STATUSES]);
        expect(Object.keys(DESK_COPY).sort()).toEqual(Object.keys(PAPERCLIP_DESKS).sort());
        expect(Object.keys(OFFICE_PRESET_COPY)).toEqual([...OFFICE_PRESET_IDS]);
        expect(Object.keys(TOOL_COPY)).toEqual([...DATA_TOOL_NAMES]);
        for (const desk of Object.values(DESK_COPY)) {
            clean(desk.name);
            clean(desk.line);
            expect(desk.line.endsWith('.')).toBe(true);
        }
        expect(workerName('head-trader')).toBe('Head trader');
        expect(workerName('market')).toBe('Market analyst');
        for (const name of DATA_TOOL_NAMES) {
            clean(toolLabel(name));
            clean(toolWhat(name, 'AAPL'));
        }
        expect(toolWhat('get_stock_data', 'AAPL')).toBe("AAPL's price bars");
        expect(toolWhat('get_unknown', 'AAPL')).toBe("AAPL's data from get_unknown");
        expect(providerLabel('openbb-yfinance')).toBe('OpenBB (yfinance)');
        expect(providerLabel('somewhere')).toBe('somewhere');
    });

    it('holds every label, the page\'s words and the files\' to the copy tier', () => {
        const pageWords: string[] = Object.values(OFFICE_COPY as Record<string, unknown>).filter((value): value is string => typeof value === 'string');
        const texts: string[] = [
            ...Object.values(WORKER_STATUS_COPY), ...Object.values(ZONE_COPY), ...Object.values(OFFICE_PRESET_COPY), ...Object.values(PROVIDER_LABELS),
            ...OFFICE_KEYS_COPY.flatMap((row) => [row.keys, row.what]),
            ...Object.values(SCOREBOARD_COPY.labels), SCOREBOARD_COPY.heading, SCOREBOARD_COPY.lead, SCOREBOARD_COPY.since('2026-10-05'), SCOREBOARD_COPY.notStarted, SCOREBOARD_COPY.next('Mon 8:30 AM ET'), SCOREBOARD_COPY.lanes,
            DOSSIER_COPY.lead, DOSSIER_COPY.rightNow, DOSSIER_COPY.thisSession, DOSSIER_COPY.career, DOSSIER_COPY.company, DOSSIER_COPY.latest,
            DOSSIER_COPY.desk(4, 14), DOSSIER_COPY.team, DOSSIER_COPY.model, ...Object.values(DOSSIER_COPY.tiers), DOSSIER_COPY.status, DOSSIER_COPY.task, DOSSIER_COPY.on, DOSSIER_COPY.since,
            ...Object.values(DOSSIER_COPY.figures), DOSSIER_COPY.careerSince('2026-10-05', 3), DOSSIER_COPY.careerSince('2026-10-05', 1), DOSSIER_COPY.careerNone,
            DOSSIER_COPY.favourite('OpenBB', 61), DOSSIER_COPY.decided(3, 1, 0), DOSSIER_COPY.budgetLine('$1.20', '$2.00'), DOSSIER_COPY.noCap, DOSSIER_COPY.paused,
            DOSSIER_COPY.budgetUnknown, DOSSIER_COPY.budgetUnreachable, DOSSIER_COPY.noText('Trader'), DOSSIER_COPY.replaying, DOSSIER_COPY.readOnFloor, DOSSIER_COPY.close,
            ...pageWords,
            OFFICE_COPY.live(3), OFFICE_COPY.replaying(42), OFFICE_COPY.replayNote(60), OFFICE_COPY.clock('9:31:05 AM'), OFFICE_COPY.following('Bull researcher'),
            OFFICE_COPY.picked('Market analyst', 'Busy', "Reading AAPL's price bars through OpenBB."),
            OFFICE_LEGEND_COPY.summary,
        ];
        expect(texts.length).toBeGreaterThan(80);
        for (const text of texts) clean(text);
        for (const sentence of [SCOREBOARD_COPY.lead, DOSSIER_COPY.lead, DOSSIER_COPY.careerNone, DOSSIER_COPY.noCap, DOSSIER_COPY.paused, DOSSIER_COPY.budgetUnknown, DOSSIER_COPY.budgetUnreachable, DOSSIER_COPY.replaying,
            OFFICE_COPY.subtitle, OFFICE_COPY.openHint, OFFICE_COPY.errorBody, OFFICE_COPY.noSessionBody, OFFICE_COPY.engine2d, OFFICE_COPY.soundOn]) {
            expect(sentence.endsWith('.'), sentence).toBe(true);
        }
        for (const label of [...Object.values(WORKER_STATUS_COPY), OFFICE_COPY.title, OFFICE_COPY.open, OFFICE_COPY.back, OFFICE_COPY.follow]) {
            expect(label.endsWith('.'), label).toBe(false);
        }
    });

    it('lists only glossary terms in each file', () => {
        for (const [group, keys] of Object.entries(OFFICE_TERMS)) {
            for (const key of keys) expect(Object.prototype.hasOwnProperty.call(GLOSSARY, key), `${group}: ${key}`).toBe(true);
        }
    });

    it('composes the lines the office shows', () => {
        expect(TASK_COPY.fellBack('OpenBB', '429', 'yfinance')).toBe('OpenBB answered 429; trying yfinance.');
        expect(TASK_COPY.rated('AAPL', RATING_LABELS.Buy)).toBe('Rated AAPL Buy.');
        expect(DESK_TASK_COPY.filled(0, 1)).toBe('0 of 1 ticket filled.');
        expect(DESK_TASK_COPY.filled(2, 3)).toBe('2 of 3 tickets filled.');
        expect(TICKER_COPY.filled('AAPL', false, 10, '$200.00')).toBe('The paper account bought 10 shares of AAPL at $200.00.');
        expect(DOSSIER_COPY.careerSince('2026-10-05', 1)).toBe('Over 1 finished session since 2026-10-05.');
    });
});
