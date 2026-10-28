// The office's state: what each of the fourteen seats is doing at a moment of a session, read from
// the stored session alone — on views made by hand for exact timings, and on the service's own
// exported stream for the real shape of a session.

import {describe, expect, it} from 'vitest';
import {OFFICE_REPLAY_MS, ROLE_IDS, WORKER_IDS} from '@/lib/agent-world/config';
import {
    attemptNote,
    careerStats,
    excerpt,
    officeClock,
    officeEvents,
    officeState,
    OFFICE_WINDOWS,
    replayCut,
    replayWindowScale,
    seenAfter,
    type OfficeState,
} from '@/lib/agent-world/office';
import {replayFrame, sessionSpan} from '@/lib/agent-world/replay';
import type {LiveView, RunView, SessionRow, SessionView, StageRecord, ToolResult} from '@/lib/agent-world/types';
import {fixtureView} from './fixture-view';
import {session} from './fixtures';

const T = Date.parse('2026-10-26T13:30:00Z'); // 9:30 AM in New York
const sec = (n: number) => T + n * 1000;

const stage = (start: number, end: number | null = null, report: number | null = null): StageRecord => ({
    status: end === null ? 'working' : 'done',
    startedAt: sec(start),
    finishedAt: end === null ? null : sec(end),
    reportAt: report === null ? null : sec(report),
    llmCalls: 2,
    tokensIn: 1000,
    tokensOut: 200,
    costCents: 0.4,
});

const run = (over: Partial<RunView> = {}): RunView => ({
    symbol: 'AAPL', index: 0, status: 'running', seq: 1, rating: null, review: false, decision: null,
    startedAt: sec(0), finishedAt: null, stages: {}, reports: {}, debate: [], risk: [], tools: [], toolResults: [],
    cost: {totalCents: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0}, extraCost: {}, memoryNote: null, failure: null,
    ...over,
});

const view = (runs: RunView[], over: Partial<SessionView> = {}): LiveView => ({
    version: 1,
    seq: 10,
    serverNow: sec(100),
    session: session({
        sessionId: 'aw-test',
        symbols: runs.map((r) => r.symbol),
        status: 'running',
        current: runs[0] ? {symbol: runs[0].symbol, index: 0} : null,
        runs: runs.map((r) => ({symbol: r.symbol, status: r.status, rating: r.rating, review: r.review, costCents: 0})),
        startedAt: sec(0),
        createdAt: sec(-5),
        ...over,
    }),
    runs,
    partial: false,
});

const at = (v: LiveView, now: number, extra: Partial<Parameters<typeof officeState>[0]> = {}): OfficeState =>
    officeState({view: v, now, mode: 'live', symbol: null, ...extra});
const seat = (state: OfficeState, id: string) => {
    const found = state.workers.find((w) => w.id === id);
    if (!found) throw new Error(`no seat ${id}`);
    return found;
};

// A fetch of AAPL's price bars at +1 s, answered at +21 s by yfinance after OpenBB refused with a 429.
const fallback = (): ToolResult => ({
    seq: 4, callId: 'c1', role: 'market', name: 'get_stock_data', status: 'ok', vendor: 'yfinance', ms: 1500, chars: 300,
    attempts: [{vendor: 'openbb', ok: false, error: 'VendorUnavailableError: OpenBB equity.price.historical rate limited (429): YFRateLimitError'}, {vendor: 'yfinance', ok: true, error: null}],
    at: sec(21),
});
const marketRun = (): RunView => run({
    stages: {market: stage(0, 40.1, 40)},
    reports: {market: '**Market report.** AAPL closed above its 50-day average; the 10-day band narrowed. Volume eased.'},
    tools: [{seq: 3, callId: 'c1', role: 'market', name: 'get_stock_data', args: '{}', at: sec(1)}],
    toolResults: [fallback()],
});

describe('the office\'s seats', () => {
    it('names fourteen seats in the order a run reaches them', () => {
        expect(WORKER_IDS).toEqual(['head-trader', ...ROLE_IDS, 'execution-desk']);
        const state = at(view([marketRun()]), sec(10));
        expect(state.workers.map((w) => w.id)).toEqual([...WORKER_IDS]);
    });

    it('is idle with no session', () => {
        const state = officeState({view: {version: 0, seq: 0, serverNow: T, session: null, runs: [], partial: false}, now: T, mode: 'idle', symbol: null});
        expect(state.workers.every((w) => w.status === 'idle')).toBe(true);
        expect(seat(state, 'market').task).toBe('Between sessions.');
        expect(state.flows).toEqual([]);
        expect(state.ticker).toEqual([]);
        expect(state.lamp).toBe('off');
        expect(state.issue.state).toBe('none');
        expect(state.focus).toBeNull();
    });

    it('follows an analyst as it fetches, reads, files and finishes', () => {
        const v = view([marketRun()]);
        const fetching = at(v, sec(10));
        expect(seat(fetching, 'market')).toMatchObject({status: 'fetching', task: "Reading AAPL's price bars through OpenBB."});
        expect(fetching.flows).toContainEqual(expect.objectContaining({kind: 'fetch', open: true, hops: [{vendor: 'openbb', ok: true, note: null}]}));

        const landed = at(v, sec(22));
        expect(seat(landed, 'market')).toMatchObject({status: 'fetching', task: 'OpenBB answered 429; trying yfinance.'});
        expect(landed.shelves.find((s) => s.vendor === 'openbb')).toMatchObject({refused: true, failures: 1, tag: {note: '429'}});
        expect(landed.shelves.find((s) => s.vendor === 'yfinance')).toMatchObject({hot: true, fetches: 1});
        expect(landed.flows).toContainEqual(expect.objectContaining({kind: 'fetch', open: false, hops: [{vendor: 'openbb', ok: false, note: '429'}, {vendor: 'yfinance', ok: true, note: null}]}));

        const reading = at(v, sec(30));
        expect(seat(reading, 'market')).toMatchObject({status: 'working', task: "Read AAPL's price bars through yfinance after OpenBB answered 429."});
        expect(reading.flows.filter((f) => f.kind === 'fetch')).toEqual([]);

        const filed = at(v, sec(42));
        expect(seat(filed, 'market')).toMatchObject({status: 'filed', task: 'Filed the market report.', bubble: 'Market report.'});
        expect(filed.flows).toContainEqual(expect.objectContaining({kind: 'handoff', from: 'market', to: ['bull', 'bear']}));

        const done = at(v, sec(40 + OFFICE_WINDOWS.filed / 1000 + 1));
        expect(seat(done, 'market')).toMatchObject({status: 'done', task: 'The market report is in.', bubble: null});
        expect(done.shelves.find((s) => s.vendor === 'openbb')?.tag).not.toBeNull();
        expect(at(v, sec(21 + OFFICE_WINDOWS.tag / 1000 + 1)).shelves.find((s) => s.vendor === 'openbb')?.tag).toBeNull();
    });

    it('waits before a stage starts while the run is open, and sits idle once it is not', () => {
        const v = view([marketRun()]);
        expect(seat(at(v, sec(10)), 'trader')).toMatchObject({status: 'waiting', task: 'Waiting for the plan.'});
        expect(seat(at(v, sec(10)), 'bull')).toMatchObject({status: 'waiting', task: 'Waiting for the four reports.'});
        const pending = view([run({status: 'pending', startedAt: null})]);
        expect(seat(at(pending, sec(10)), 'trader').status).toBe('idle');
    });

    it('lets a researcher talk after its turn, wait while the other speaks, and finish', () => {
        const v = view([run({
            stages: {bull: stage(0, 60), bear: stage(30, 60)},
            debate: [
                {seq: 5, side: 'bull', round: 1, text: 'The services mix carries the margin. More follows.', at: sec(30)},
                {seq: 6, side: 'bear', round: 1, text: 'A forward P/E of 36 leaves little cushion.', at: sec(59.95)},
            ],
        })]);
        expect(seat(at(v, sec(10)), 'bull')).toMatchObject({status: 'working', task: 'Reading the four reports on AAPL.'});
        expect(seat(at(v, sec(32)), 'bull')).toMatchObject({status: 'talking', task: 'Arguing the bull case, round 1.', bubble: 'The services mix carries the margin.'});
        expect(seat(at(v, sec(32)), 'bear')).toMatchObject({status: 'working', task: "Reading the bull's turn on AAPL."});
        expect(seat(at(v, sec(45)), 'bull')).toMatchObject({status: 'waiting', task: 'Spoke in round 1; the others have the floor.'});
        // The bear's turn lands a moment before both finish: its bubble still shows.
        expect(seat(at(v, sec(61)), 'bear')).toMatchObject({status: 'talking', bubble: 'A forward P/E of 36 leaves little cushion.'});
        expect(seat(at(v, sec(70)), 'bear')).toMatchObject({status: 'done', task: 'The bear case is on the record.'});
    });

    it('never has the sentiment analyst fetch', () => {
        const v = view([run({stages: {sentiment: stage(0, 41, 40.9)}, reports: {sentiment: 'Sentiment report.'}})]);
        for (const t of [1, 10, 30, 40]) expect(seat(at(v, sec(t)), 'sentiment').status).toBe('working');
        expect(seat(at(v, sec(42)), 'sentiment').status).toBe('filed');
    });

    it('has the portfolio manager name the rating once done, and REVIEW name none', () => {
        const rated = (rating: 'Buy' | 'REVIEW') => view([run({status: 'completed', rating, finishedAt: sec(50), stages: {'portfolio-manager': stage(10, 49, 48)}, reports: {'portfolio-manager': 'Rating.'}})]);
        expect(seat(at(rated('Buy'), sec(80)), 'portfolio-manager').task).toBe('Rated AAPL Buy.');
        expect(seat(at(rated('REVIEW'), sec(80)), 'portfolio-manager').task).toBe('Named no readable rating for AAPL.');
    });

    it('stops the seat that was busy when its run failed', () => {
        const v = view([run({status: 'failed', finishedAt: sec(20), stages: {market: stage(0), news: stage(0, 10, 9)}, reports: {news: 'News.'}, failure: {reason: 'limit', message: 'quota'}})]);
        expect(seat(at(v, sec(40)), 'market')).toMatchObject({status: 'stopped', task: 'The run on AAPL stopped here.'});
        expect(seat(at(v, sec(40)), 'news').status).toBe('done');
    });
});

describe('the two desks', () => {
    const cases: {name: string; over: Partial<SessionView>; head: [string, RegExp | string]; exec: [string, RegExp | string]; lamp: string; issue?: string}[] = [
        {name: 'queued', over: {status: 'queued', startedAt: null}, head: ['working', 'Opening the session.'], exec: ['waiting', 'Waiting for the ratings.'], lamp: 'off'},
        {name: 'running', over: {status: 'running', paperclip: {issueId: 'i1', identifier: 'TRA-12', url: null, mirrored: null, note: null}}, head: ['working', 'Watching the desk run; issue TRA-12 is open.'], exec: ['waiting', 'Waiting for the ratings.'], lamp: 'off', issue: 'open'},
        {name: 'desk done, planning', over: {status: 'running', serviceFinishedAt: sec(50), paperclip: {issueId: 'i1', identifier: 'TRA-12', url: null, mirrored: null, note: null}}, head: ['done', 'Handed issue TRA-12 in.'], exec: ['working', 'Planning the orders from the ratings.'], lamp: 'off', issue: 'handed-in'},
        {name: 'awaiting', over: {status: 'awaiting-approval', serviceFinishedAt: sec(50)}, head: ['done', 'Handed the issue in.'], exec: ['waiting', 'Waiting for the owner.'], lamp: 'awaiting'},
        {name: 'approved by the owner', over: {status: 'approved', serviceFinishedAt: sec(50), decision: {decision: 'approved', by: 'owner@example.com', at: sec(60)}}, head: ['done', 'Handed the issue in.'], exec: ['working', 'Stamped: approved by the owner.'], lamp: 'approved'},
        {name: 'approved automatically', over: {status: 'approved', serviceFinishedAt: sec(50), decision: {decision: 'approved', by: 'auto', at: sec(60)}}, head: ['done', 'Handed the issue in.'], exec: ['working', 'Stamped: approved without a pause.'], lamp: 'approved'},
        {name: 'declined', over: {status: 'declined', serviceFinishedAt: sec(50), decision: {decision: 'declined', by: 'owner@example.com', at: sec(60)}, paperclip: {issueId: 'i1', identifier: 'TRA-12', url: null, mirrored: true, note: null}}, head: ['done', 'Handed issue TRA-12 in.'], exec: ['done', 'Declined; nothing traded.'], lamp: 'declined', issue: 'declined'},
        {name: 'lapsed', over: {status: 'lapsed', serviceFinishedAt: sec(50), decision: {decision: 'lapsed', by: null, at: sec(60)}}, head: ['done', 'Handed the issue in.'], exec: ['done', 'Lapsed; nothing traded.'], lamp: 'lapsed'},
        {name: 'completed with fills', over: {status: 'completed', serviceFinishedAt: sec(50), finishedAt: sec(70), decision: {decision: 'approved', by: 'owner@example.com', at: sec(60)},
            fills: [{symbol: 'AAPL', side: 'buy', quantity: 10, executed: true, price: 200, message: null, at: sec(65)}, {symbol: 'MSFT', side: 'sell', quantity: 2, executed: false, price: null, message: "Couldn't fetch a live price for MSFT", at: sec(66)}]},
            head: ['done', 'Handed the issue in.'], exec: ['done', '1 of 2 tickets filled.'], lamp: 'approved'},
        {name: 'a preview', over: {status: 'completed', kind: 'preview', serviceFinishedAt: sec(50), finishedAt: sec(55), orders: [{symbol: 'AAPL', side: 'buy', quantity: 10, reason: 'rated Buy → target 20%', rating: 'Buy', targetWeight: 0.2, currentWeight: 0}]},
            head: ['done', 'The preview is done; there is nothing to approve.'], exec: ['done', 'Preview: 1 order planned, none sent.'], lamp: 'preview'},
        {name: 'stopped', over: {status: 'failed', finishedAt: sec(30), service: {outcome: 'limit', message: 'gemini answered 429.'}, paperclip: {issueId: 'i1', identifier: 'TRA-12', url: null, mirrored: null, note: null}},
            head: ['stopped', 'Blocked: gemini answered 429.'], exec: ['stopped', 'The session stopped before a decision.'], lamp: 'off', issue: 'blocked'},
    ];
    for (const c of cases) {
        it(`reads the desks when the session is ${c.name}`, () => {
            const state = at(view([marketRun()], c.over), sec(100));
            expect([seat(state, 'head-trader').status, seat(state, 'head-trader').task]).toEqual(c.head);
            expect([seat(state, 'execution-desk').status, seat(state, 'execution-desk').task]).toEqual(c.exec);
            expect(state.lamp).toBe(c.lamp);
            if (c.issue) expect(state.issue.state).toBe(c.issue);
        });
    }

    it('lays out the tickets the paper account filled, or did not', () => {
        const state = at(view([marketRun()], cases[8].over), sec(100));
        expect(state.tickets.map((t) => [t.symbol, t.executed])).toEqual([['AAPL', true], ['MSFT', false]]);
        expect(state.ticker[0].text).toBe("The order for MSFT was not filled (Couldn't fetch a live price for MSFT).");
        expect(state.ticker[1].text).toBe('The paper account bought 10 shares of AAPL at $200.00.');
        expect(at(view([marketRun()], cases[8].over), sec(67)).flows.filter((f) => f.kind === 'ticket')).toHaveLength(2);
    });
});

describe('the floor\'s focus, wall and ticker', () => {
    it('follows the newest event, then the desks', () => {
        const v = view([marketRun()]);
        expect(at(view([marketRun()], {status: 'queued', startedAt: null}), sec(1)).focus).toBe('head-trader');
        expect(at(v, sec(10)).focus).toBe('market');
        const debate = view([run({stages: {market: stage(0, 5, 4.9), bull: stage(6)}, reports: {market: 'M.'}, debate: [{seq: 9, side: 'bull', round: 1, text: 'Case.', at: sec(20)}]})]);
        expect(at(debate, sec(21)).focus).toBe('bull');
        expect(at(view([marketRun()], {serviceFinishedAt: sec(50)}), sec(60)).focus).toBe('execution-desk');
    });

    it('sums the session on the wall and carries the totals it is given', () => {
        const v = view([marketRun()], {cost: {totalCents: 3.5, tokensIn: 9000, tokensOut: 2000, llmCalls: 12, toolCalls: 4}, limits: [{provider: 'openbb-yfinance', status: 429, message: 'rate', fatal: false, at: sec(21), symbol: 'AAPL'}]});
        const bare = at(v, sec(30));
        expect(bare.scoreboard).toMatchObject({calls: 12, fetches: 4, tokensIn: 9000, tokensOut: 2000, costCents: 3.5, refusals: 1, sessionsToDate: 0, costToDateCents: 0, nextSessionAt: null, elapsed: '0:30'});
        expect(bare.scoreboard.record.map((row) => row.id)).toEqual(['desk', 'spy']);
        const full = at(v, sec(30), {extras: {sessionsToDate: 7, costToDateCents: 41, record: {totalReturnPct: 1.2, benchmarkReturnPct: 0.8, since: '2026-10-05'}, nextSessionAt: sec(9999)}});
        expect(full.scoreboard).toMatchObject({sessionsToDate: 7, costToDateCents: 41, nextSessionAt: sec(9999)});
        expect(full.scoreboard.record).toEqual([{id: 'desk', returnPct: 1.2, since: '2026-10-05'}, {id: 'spy', returnPct: 0.8, since: '2026-10-05'}]);
    });

    it('lists the last twelve events newest first with New York clocks', () => {
        const v = fixtureView();
        const state = at(v, v.serverNow, {mode: 'idle'});
        expect(state.ticker).toHaveLength(12);
        const times = state.ticker.map((line) => line.at);
        expect([...times].sort((a, b) => b - a)).toEqual(times);
        for (const line of state.ticker) {
            expect(line.text.endsWith('.'), line.text).toBe(true);
            expect(line.text, line.text).not.toMatch(/^(buy|sell|hold|avoid|trim|dump)\b/i);
            expect(line.clock).toMatch(/^\d{1,2}:\d{2}:\d{2} (AM|PM)$/);
        }
        expect(state.ticker[0].text).toBe('The desk is done; the ratings went to the execution desk.');
        expect(officeClock(Date.parse('2026-10-26T12:30:05Z'))).toBe('8:30:05 AM');
    });
});

describe('the service\'s own session', () => {
    const v = fixtureView();
    const span = sessionSpan(v);
    if (span === null) throw new Error('the fixture has no span');
    // The cut where `at` falls, as a replay progress.
    const progressAt = (time: number) => (time - span.from) / (span.to - span.from);

    it('shows the 429 hop on the market analyst and the shelves', () => {
        const result = v.runs[0].toolResults.find((r) => r.attempts.some((a) => !a.ok) && r.role === 'market');
        if (!result) throw new Error('no fallback in the fixture');
        const p = progressAt(result.at + 1000);
        const state = officeState({view: replayFrame(v, p), now: replayCut(v, p) ?? 0, mode: 'replay', symbol: null});
        expect(seat(state, 'market')).toMatchObject({status: 'fetching', task: 'OpenBB answered 429; trying yfinance.'});
        expect(state.shelves.find((s) => s.vendor === 'openbb')?.refused).toBe(true);
        expect(state.ticker.map((line) => line.text)).toEqual(expect.arrayContaining([
            "Market analyst read AAPL's price bars through yfinance after OpenBB answered 429.",
            'OpenBB (yfinance) refused a request (429).',
        ]));
    });

    it('reads a fetch no provider answered as unanswered', () => {
        const result = v.runs[0].toolResults.find((r) => r.status === 'unavailable');
        if (!result) throw new Error('no unanswered fetch in the fixture');
        expect(at(v, v.serverNow, {mode: 'idle'}).ticker.length).toBeGreaterThan(0);
        const p = progressAt(result.at + 10);
        const state = officeState({view: replayFrame(v, p), now: replayCut(v, p) ?? 0, mode: 'replay', symbol: null});
        expect(state.ticker.some((line) => line.text === "Fundamentals analyst got no answer for AAPL's balance sheet.")).toBe(true);
    });

    it('plays back the same office for the same progress, forwards and backwards', () => {
        const scale = replayWindowScale(v, OFFICE_REPLAY_MS);
        expect(scale).toBeGreaterThan(1);
        const frameAt = (p: number) => officeState({view: replayFrame(v, p), now: replayCut(v, p) ?? 0, mode: 'replay', symbol: null, windowScale: scale});
        const steps = Array.from({length: 21}, (_, i) => i / 20);
        const forwards = steps.map(frameAt);
        const backwards = [...steps].reverse().map(frameAt).reverse();
        expect(backwards).toEqual(forwards);
        expect(steps.map(frameAt)).toEqual(forwards);
        for (let i = 1; i < forwards.length; i += 1) {
            expect(forwards[i].ratings.filter((r) => r.rating !== null).length).toBeGreaterThanOrEqual(forwards[i - 1].ratings.filter((r) => r.rating !== null).length);
            expect(forwards[i].ticker.length).toBeGreaterThanOrEqual(forwards[i - 1].ticker.length);
        }
        expect(replayCut(v, 1)).toBe(span.to);
        // At the start every seat is idle; a step in, the analysts are busy and the rest wait their turn.
        expect(forwards[0].workers.every((w) => w.status === 'idle' || w.id === 'head-trader' || w.id === 'execution-desk')).toBe(true);
        expect(forwards[1].workers.filter((w) => ROLE_IDS.includes(w.id as never)).some((w) => w.status === 'waiting')).toBe(true);
    });

    it('rests with every seat done once the session is over', () => {
        const state = at(v, v.serverNow, {mode: 'idle'});
        for (const role of ROLE_IDS) expect(seat(state, role).status, role).toBe('done');
        expect(state.flows).toEqual([]);
        expect(seat(state, 'portfolio-manager').task).toBe('Rated AAPL Buy.');
        expect(state.ratings.map((r) => [r.symbol, r.rating])).toEqual([['AAPL', 'Buy'], ['MSFT', 'REVIEW']]);
    });

    it('stretches the windows with the replay', () => {
        const turn = v.runs[0].debate[0];
        const base = officeState({view: v, now: turn.at + 60_000, mode: 'replay', symbol: null});
        expect(seat(base, 'bull').status).not.toBe('talking');
        const scaled = officeState({view: v, now: turn.at + 60_000, mode: 'replay', symbol: null, windowScale: 11});
        expect(seat(scaled, 'bull').status).toBe('talking');
    });
});

describe('live windows', () => {
    it('opens a window when the browser first sees the event, not when it was stored', () => {
        const v = view([run({stages: {bull: stage(0)}, debate: [{seq: 5, side: 'bull', round: 1, text: 'Case.', at: sec(10)}]})]);
        const now = sec(32);
        expect(seat(at(v, now), 'bull').status).toBe('waiting');
        const seen = seenAfter(new Map(), v, sec(30), false);
        expect(seat(at(v, now, {seen}), 'bull').status).toBe('talking');
        const first = seenAfter(new Map(), v, sec(30), true);
        expect(first.get('turn:5')).toBe(sec(10));
        expect(seenAfter(first, v, sec(40), false)).toBe(first);
        const grown = seenAfter(first, view([run({stages: {bull: stage(0)}, debate: [{seq: 5, side: 'bull', round: 1, text: 'Case.', at: sec(10)}, {seq: 6, side: 'bull', round: 2, text: 'More.', at: sec(35)}]})]), sec(41), false);
        expect(grown.get('turn:5')).toBe(sec(10));
        expect(grown.get('turn:6')).toBe(sec(41));
    });

    it('keys every stored moment once', () => {
        const keys = officeEvents(fixtureView()).map((event) => event.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('small readers', () => {
    it('reads the HTTP status off a failed attempt', () => {
        expect(attemptNote('OpenBB rate limited (429): YFRateLimitError')).toBe('429');
        expect(attemptNote('timed out')).toBeNull();
        expect(attemptNote(null)).toBeNull();
    });

    it('cuts a text to its first sentence without its markdown', () => {
        expect(excerpt('## Plan\n**Hold the position.** The rest follows.')).toBe('Plan Hold the position.');
        expect(excerpt('[A link](https://example.com) and `code` here')).toBe('A link and code here');
        expect(excerpt('x'.repeat(300))?.length).toBe(120);
        expect(excerpt('   ')).toBeNull();
    });
});

describe('careerStats', () => {
    const row = (sessionId: string, r: RunView) => ({sessionId, run: r});
    const sessionRow = (sessionId: string, over: Partial<SessionRow> = {}): SessionRow => ({
        sessionId, kind: 'weekly', weekKey: '2026-10-19', tradeDate: '2026-10-19', status: 'completed', runs: [],
        cost: {totalCents: 5, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0}, decision: null, createdAt: sec(0), fills: [], ...over,
    });

    it('folds the last sessions into each seat\'s figures', () => {
        const results = (vendors: string[]): ToolResult[] => vendors.map((vendor, i) => ({...fallback(), seq: i, callId: `c${i}`, vendor, attempts: []}));
        const rows = [
            row('s1', run({stages: {market: stage(0, 30, 29), bull: stage(30, 50)}, toolResults: results(['openbb', 'openbb']), debate: [{seq: 1, side: 'bull', round: 1, text: 'x', at: sec(40)}]})),
            row('s2', run({stages: {market: stage(0, 20, 19)}, toolResults: results(['yfinance'])})),
        ];
        const sessions = [
            sessionRow('s1', {createdAt: sec(100), decision: {decision: 'approved', by: 'o', at: sec(110)}, fills: [{symbol: 'AAPL', side: 'buy', quantity: 1, executed: true, price: 1, message: null, at: sec(120)}]}),
            sessionRow('s2', {createdAt: sec(50), decision: {decision: 'declined', by: 'o', at: sec(60)}}),
        ];
        const career = careerStats(rows, sessions);
        expect(career).toMatchObject({sessions: 2, runs: 2, from: sec(50)});
        expect(career.roles.market).toMatchObject({sessions: 2, runs: 2, texts: 2, calls: 4, tokens: 2400, fetches: 3, atWorkMs: 50_000});
        expect(career.roles.market.favourite?.vendor).toBe('openbb');
        expect(career.roles.market.favourite?.share).toBeCloseTo(2 / 3);
        expect(career.roles.bull).toMatchObject({sessions: 1, texts: 1});
        expect(career.roles.trader).toMatchObject({sessions: 0, favourite: null});
        expect(career.desks['head-trader']).toMatchObject({sessions: 2, costCents: 10});
        expect(career.desks['execution-desk']).toMatchObject({decided: {approved: 1, declined: 1, lapsed: 0}, filled: 1, tickets: 1});
    });

    it('starts at zero', () => {
        const career = careerStats([], []);
        expect(career).toMatchObject({sessions: 0, runs: 0, from: null});
        expect(career.roles.market).toMatchObject({sessions: 0, favourite: null});
    });
});
