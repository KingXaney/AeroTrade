// A test helper, not a test: the service's exported event stream (scripts/qa/fixtures/
// agent-world-events.json) folded into the LiveView the page would read once the desk was done —
// the head through foldHead, each run's document through runUpdateFor applied in memory the way the
// store's seq-guarded upserts apply them, then toRunView — so the office is tested on the service's
// own output rather than on views made by hand.

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {EVENTS_PER_BATCH} from '@/lib/agent-world/config';
import {foldHead, parseBatch, runUpdateFor, symbolOf, type AgentWorldEvent, type RunUpdate, type SessionHead} from '@/lib/agent-world/events';
import type {LiveView} from '@/lib/agent-world/types';
import {toRunView} from '@/lib/agent-world/views';
import {session} from './fixtures';

type Fixture = {sessionId: string; symbols: string[]; events: Record<string, unknown>[]};
type Doc = Record<string, unknown>;

export const FIXTURE = JSON.parse(readFileSync(path.resolve(__dirname, '../../../scripts/qa/fixtures/agent-world-events.json'), 'utf8')) as Fixture;

export const fixtureEvents = (): AgentWorldEvent[] => {
    const events: AgentWorldEvent[] = [];
    for (let i = 0; i < FIXTURE.events.length; i += EVENTS_PER_BATCH) {
        const batch = parseBatch({sessionId: FIXTURE.sessionId, events: FIXTURE.events.slice(i, i + EVENTS_PER_BATCH)});
        if (!batch.ok) throw new Error(`batch at ${i} refused`);
        events.push(...batch.events);
    }
    return events;
};

const getPath = (doc: Doc, dotted: string): unknown =>
    dotted.split('.').reduce<unknown>((at, part) => (at !== null && typeof at === 'object' ? (at as Doc)[part] : undefined), doc);

const setPath = (doc: Doc, dotted: string, value: unknown) => {
    const parts = dotted.split('.');
    let at = doc;
    for (const part of parts.slice(0, -1)) {
        if (at[part] === null || typeof at[part] !== 'object') at[part] = {};
        at = at[part] as Doc;
    }
    at[parts[parts.length - 1]] = value;
};

// $set by path, $inc adding, $push with $each and a negative $slice keeping the tail.
export const applyUpdate = (doc: Doc, update: RunUpdate) => {
    for (const [key, value] of Object.entries(update.$set)) setPath(doc, key, value);
    for (const [key, by] of Object.entries(update.$inc ?? {})) {
        const before = getPath(doc, key);
        setPath(doc, key, (typeof before === 'number' ? before : 0) + by);
    }
    for (const [key, spec] of Object.entries(update.$push ?? {})) {
        const {$each, $slice} = spec as {$each: unknown[]; $slice?: number};
        const before = getPath(doc, key);
        const next = [...(Array.isArray(before) ? before : []), ...$each];
        setPath(doc, key, typeof $slice === 'number' && $slice < 0 ? next.slice($slice) : next);
    }
};

const HEAD: SessionHead = {
    status: 'queued', seq: 0, startedAt: null, finishedAt: null, serviceFinishedAt: null, current: null,
    runs: [], cost: {totalCents: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0}, limits: [], service: null, models: null, dropped: 0,
};

// The session as the page reads it once the desk was done and nobody has decided yet (completed,
// no orders), with both runs whole.
export const fixtureView = (): LiveView => {
    const events = fixtureEvents();
    const head = foldHead(HEAD, events);
    const docs = new Map<string, Doc>();
    for (const event of events) {
        const symbol = symbolOf(event);
        const update = runUpdateFor(event);
        if (symbol === null || update === null) continue;
        const doc = docs.get(symbol) ?? {symbol, seq: 0};
        if (event.seq <= (doc.seq as number)) continue;
        applyUpdate(doc, update);
        docs.set(symbol, doc);
    }
    const runs = [...docs.values()].map(toRunView).sort((a, b) => a.index - b.index);
    const finishedAt = (head.serviceFinishedAt ?? 0) + 60_000;
    return {
        version: 5,
        seq: events.at(-1)?.seq ?? 0,
        serverNow: finishedAt + 1000,
        session: session({
            sessionId: 'aw-fixture',
            symbols: FIXTURE.symbols,
            status: 'completed',
            current: null,
            seq: events.at(-1)?.seq ?? 0,
            runs: head.runs,
            cost: head.cost,
            limits: head.limits,
            startedAt: head.startedAt,
            serviceFinishedAt: head.serviceFinishedAt,
            finishedAt,
            createdAt: (head.startedAt ?? 0) - 5000,
        }),
        runs,
        partial: false,
    };
};
