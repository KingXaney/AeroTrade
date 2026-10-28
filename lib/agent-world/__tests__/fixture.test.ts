// The contract between the service and the app, held on the service's own output: the event stream
// services/agent-world/scripts/export_fixture.py writes (its StageMachine over recorded graph
// chunks), which the browser QA's stand-in also plays. Every event must read under the app's
// schemas, the folds must give the run the service meant, and every role the config names must be
// one the service emits.

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {EVENTS_PER_BATCH, ROLE_IDS} from '@/lib/agent-world/config';
import {foldHead, parseBatch, runUpdateFor, type AgentWorldEvent, type SessionHead} from '@/lib/agent-world/events';

type Fixture = {sessionId: string; symbols: string[]; events: Record<string, unknown>[]};
const FIXTURE = JSON.parse(readFileSync(path.resolve(__dirname, '../../../scripts/qa/fixtures/agent-world-events.json'), 'utf8')) as Fixture;

const parseAll = (): {events: AgentWorldEvent[]; invalid: number} => {
    const events: AgentWorldEvent[] = [];
    let invalid = 0;
    for (let i = 0; i < FIXTURE.events.length; i += EVENTS_PER_BATCH) {
        const batch = parseBatch({sessionId: FIXTURE.sessionId, events: FIXTURE.events.slice(i, i + EVENTS_PER_BATCH)});
        if (!batch.ok) throw new Error(`batch at ${i} refused`);
        events.push(...batch.events);
        invalid += batch.invalid;
    }
    return {events, invalid};
};

const HEAD: SessionHead = {
    status: 'queued', seq: 0, startedAt: null, finishedAt: null, serviceFinishedAt: null, current: null,
    runs: [], cost: {totalCents: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0}, limits: [], service: null, models: null, dropped: 0,
};

describe('the service\'s exported event stream', () => {
    it('reads whole under the app\'s schemas, in seq order, from session.started to session.completed', () => {
        const {events, invalid} = parseAll();
        expect(invalid).toBe(0);
        expect(events).toHaveLength(FIXTURE.events.length);
        expect(events.map((event) => event.seq)).toEqual(FIXTURE.events.map((_, index) => index + 1));
        expect(events[0].type).toBe('session.started');
        expect(events.at(-1)?.type).toBe('session.completed');
    });

    it('carries every role the config names for the first symbol, and no role it does not', () => {
        const {events} = parseAll();
        const first = FIXTURE.symbols[0];
        const done = new Set(events.filter((e) => e.type === 'role.done' && e.symbol === first).map((e) => (e as Extract<AgentWorldEvent, {type: 'role.done'}>).role));
        expect([...done].sort()).toEqual([...ROLE_IDS].sort());
    });

    it('folds into the session the service meant: two runs rated, a limit kept, the cost counted', () => {
        const {events} = parseAll();
        const head = foldHead(HEAD, events);
        expect(head.status).toBe('running');
        expect(head.serviceFinishedAt).not.toBeNull();
        expect(head.runs.map((run) => [run.symbol, run.status, run.rating])).toEqual([[FIXTURE.symbols[0], 'completed', 'Buy'], [FIXTURE.symbols[1], 'completed', 'REVIEW']]);
        expect(head.limits.some((limit) => limit.provider === 'openbb-yfinance' && limit.status === 429 && !limit.fatal)).toBe(true);
        expect(head.cost.totalCents).toBeGreaterThan(0);
        expect(head.cost.toolCalls).toBeGreaterThan(0);
    });

    it('turns every run-level event into an update, and only those', () => {
        const {events} = parseAll();
        for (const event of events) {
            const update = runUpdateFor(event);
            const sessionLevel = event.type.startsWith('session.') || event.type === 'limit';
            expect(update === null, event.type).toBe(sessionLevel);
        }
    });
});
