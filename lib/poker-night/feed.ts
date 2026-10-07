// The table's feed, as the browser keeps it: the latest view it has applied, the clock offset, the
// emotes, the animation events, and the decisions around them — when to poll, when to tick the
// clock, which transport to trust, when the seat pass is still worth sending. Pure and client-safe;
// components/poker-night/useTableFeed runs it, holding the state in a store and doing the I/O.
//
// Order never matters: a view applies only when its seq is above the one held, so a slow answer, a
// duplicate or a realtime message that arrives late changes nothing. A visitor who has not joined
// holds the page's preview and no view, and polls nothing (the routes answer only players); their
// join's answer is the first view, whatever its seq.

import {nextOffset, offsetSample} from '@/lib/poker-night/client-clock';
import {diffViews, type TableEvent} from '@/lib/poker-night/events';
import type {EmoteView, PlayerView, RoomView, TableView, Unchanged, WireView} from '@/lib/poker-night/view-types';

// An event with the moment (this browser's clock) the table saw it.
export type RoomEvent = TableEvent & {seenAt: number};

export type FeedMode = 'polling' | 'realtime' | 'reconnecting';

export type FeedState = {
    view: PlayerView | null; // the viewer's own view, once they have joined
    preview: RoomView | null; // the page's public view, for a visitor who has not
    seq: number; // of the view held (the preview's until the first view)
    emoteSeq: number;
    knownSeq: number; // the highest seq any answer has named: above seq, a GET state is due
    knownEmoteSeq: number;
    serverNow: number; // the server's time in the latest answer
    nextDueAt: number | null;
    pass: string | null;
    offset: number; // server minus browser, ms
    samples: number[];
    emotes: EmoteView[];
    emoteFloor: number; // emotes from before the page loaded (less EMOTE_GRACE_MS) are never shown
    failures: number; // requests failed in a row
    events: RoomEvent[]; // newest last
    eventIds: string[]; // recent ids, so no event fires twice
};

export type FeedInput =
    // A player view from any request (GET state, POST action, join or tick). at: when the answer
    // arrived; sentAt: when its request left (a clock sample); animate false snaps (a hidden tab).
    | {type: 'view'; view: PlayerView; at: number; sentAt?: number; animate?: boolean}
    // The public part alone, from the realtime channel (P4).
    | {type: 'wire'; wire: WireView; at: number; animate?: boolean}
    | {type: 'unchanged'; body: Unchanged; at: number; sentAt?: number}
    | {type: 'failed'}
    // A visitor's page, rendered again (router.refresh): the public table as it is now.
    | {type: 'preview'; preview: RoomView}
    // The page has mounted: a first guess at the clock until a round trip gives a sample.
    | {type: 'mounted'; at: number};

// Emotes sent this long before the page loaded still show; older ones never do.
export const EMOTE_GRACE_MS = 2000;
// The emotes held at once.
export const EMOTES_KEPT = 24;
// Events are kept this long and at most this many; ids a little longer.
export const EVENT_KEEP_MS = 15_000;
export const EVENTS_KEPT = 64;
export const EVENT_IDS_KEPT = 256;

export const initialFeed = (page: {view: PlayerView} | {preview: RoomView}): FeedState => {
    const base = 'view' in page ? page.view : page.preview;
    const view = 'view' in page ? page.view : null;
    return {
        view, preview: 'preview' in page ? page.preview : null,
        seq: base.seq, emoteSeq: view?.emoteSeq ?? 0, knownSeq: base.seq, knownEmoteSeq: view?.emoteSeq ?? 0,
        serverNow: base.serverNow, nextDueAt: base.nextDueAt, pass: view?.pass ?? null,
        offset: 0, samples: [],
        // The page's own emotes are history: only what arrives after it shows.
        emotes: [], emoteFloor: base.serverNow - EMOTE_GRACE_MS,
        failures: 0, events: [], eventIds: [],
    };
};

// Emotes merged: one per id, none from before the floor, in seq order, the newest kept.
export const mergeEmotes = (held: readonly EmoteView[], incoming: readonly EmoteView[], floor: number): EmoteView[] => {
    const byId = new Map(held.map((e) => [e.id, e]));
    for (const e of incoming) if (e.at >= floor && !byId.has(e.id)) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => a.seq - b.seq).slice(-EMOTES_KEPT);
};

const withSample = (state: FeedState, sentAt: number | undefined, at: number, serverNow: number): Pick<FeedState, 'offset' | 'samples'> => {
    if (sentAt === undefined) return {offset: state.offset, samples: state.samples};
    const sample = offsetSample(sentAt, at, serverNow);
    return sample === null ? {offset: state.offset, samples: state.samples} : nextOffset(state.samples, sample);
};

const withEvents = (state: FeedState, events: readonly TableEvent[], at: number): Pick<FeedState, 'events' | 'eventIds'> => {
    const seen = new Set(state.eventIds);
    const fresh = events.filter((e) => !seen.has(e.id));
    const kept = state.events.filter((e) => at - e.seenAt < EVENT_KEEP_MS);
    if (fresh.length === 0 && kept.length === state.events.length) return {events: state.events, eventIds: state.eventIds};
    return {
        events: [...kept, ...fresh.map((e) => ({...e, seenAt: at}))].slice(-EVENTS_KEPT),
        eventIds: [...state.eventIds, ...fresh.map((e) => e.id)].slice(-EVENT_IDS_KEPT),
    };
};

const diffOptions = (view: PlayerView) => ({mySeat: view.me.seat, bigBlind: view.config.bigBlind});

// The wire view laid over the viewer's own: the public table replaced, what only they may see —
// their cards and pre-action, the config, the people, the emotes, the pass — kept until a GET
// state brings it fresh (needsPrivate says when).
export const mergeWire = (view: PlayerView, wire: WireView): PlayerView => ({
    ...view,
    v: wire.v, status: wire.status, closing: wire.closing, settings: wire.settings, configV: wire.configV, hostPid: wire.hostPid,
    handNo: wire.handNo, turn: wire.turn, nextHandAt: wire.nextHandAt, seats: wire.seats, hand: wire.hand, ledger: wire.ledger,
    requests: wire.requests, seq: wire.seq, serverNow: wire.serverNow, nextDueAt: wire.nextDueAt, code: wire.code,
    clockLeader: wire.clockLeader, peopleV: wire.peopleV, watchers: wire.watchers, realtimeOk: wire.realtimeOk,
});

export const feedReducer = (state: FeedState, input: FeedInput): FeedState => {
    switch (input.type) {
        case 'mounted':
            return state.samples.length > 0 ? state : {...state, offset: Math.round(state.serverNow - input.at)};
        case 'failed':
            return {...state, failures: state.failures + 1};
        case 'preview': {
            // Only before a join, and only a table at least as new as the one held (presence moves
            // without a seq, so the same seq at a later time still counts).
            const {preview} = input;
            if (state.view !== null || preview.seq < state.seq || (preview.seq === state.seq && preview.serverNow <= state.serverNow)) return state;
            return {
                ...state, preview, seq: preview.seq, knownSeq: Math.max(state.knownSeq, preview.seq),
                serverNow: preview.serverNow, nextDueAt: preview.nextDueAt,
            };
        }
        case 'view': {
            const {view, at} = input;
            const clock = withSample(state, input.sentAt, at, view.serverNow);
            const pass = view.pass ?? state.pass;
            // An answer no newer than the view held: only its clock sample and pass count.
            if (state.view !== null && view.seq <= state.seq) {
                return {...state, ...clock, pass, failures: 0, knownSeq: Math.max(state.knownSeq, view.seq)};
            }
            const prev: (TableView & {seq: number; serverNow: number}) | null = state.view ?? state.preview;
            const events = input.animate === false ? [] : diffViews(prev, view, diffOptions(view));
            const emotes = mergeEmotes(state.emotes, view.emotes, state.emoteFloor);
            return {
                ...state, ...clock, ...withEvents(state, events, at),
                view, preview: null, seq: view.seq, emoteSeq: Math.max(state.emoteSeq, view.emoteSeq),
                knownSeq: Math.max(state.knownSeq, view.seq), knownEmoteSeq: Math.max(state.knownEmoteSeq, view.emoteSeq),
                serverNow: view.serverNow, nextDueAt: view.nextDueAt, pass, emotes, failures: 0,
            };
        }
        case 'unchanged': {
            const {body, at} = input;
            const clock = withSample(state, input.sentAt, at, body.serverNow);
            const emotes = mergeEmotes(state.emotes, body.emotes, state.emoteFloor);
            // Only emotes it delivered move the emote seq: a tick names the room's emoteSeq without
            // reading the emotes, and that says a GET state is due.
            const delivered = body.emotes.reduce((top, e) => Math.max(top, e.seq), state.emoteSeq);
            const current = body.seq === state.seq;
            return {
                ...state, ...clock, emotes, emoteSeq: delivered,
                knownSeq: Math.max(state.knownSeq, body.seq), knownEmoteSeq: Math.max(state.knownEmoteSeq, body.emoteSeq),
                serverNow: Math.max(state.serverNow, body.serverNow),
                nextDueAt: current ? body.nextDueAt : state.nextDueAt,
                pass: body.pass ?? state.pass, failures: 0,
            };
        }
        case 'wire': {
            const {wire, at} = input;
            const knownSeq = Math.max(state.knownSeq, wire.seq);
            if (state.view === null || wire.seq <= state.seq) return knownSeq === state.knownSeq ? state : {...state, knownSeq};
            const view = mergeWire(state.view, wire);
            const events = input.animate === false ? [] : diffViews(state.view, view, diffOptions(view));
            return {...state, ...withEvents(state, events, at), view, seq: wire.seq, knownSeq, serverNow: wire.serverNow, nextDueAt: wire.nextDueAt};
        }
    }
};

// Whether an answer named a seq or an emote seq beyond what is held: a GET state is due.
export const isBehind = (state: Pick<FeedState, 'seq' | 'emoteSeq' | 'knownSeq' | 'knownEmoteSeq'>): boolean =>
    state.knownSeq > state.seq || state.knownEmoteSeq > state.emoteSeq;

// Two failures in a row read as reconnecting.
export const feedMode = (state: Pick<FeedState, 'failures'>, realtime = false): FeedMode =>
    state.failures >= 2 ? 'reconnecting' : realtime ? 'realtime' : 'polling';

// Whether a realtime message (public only) leaves the viewer's own part stale, so one GET state is
// due: a new hand they are dealt into (their cards), their seat or role changed, the config moved,
// or the people did (names and looks travel beside the wire, versioned by peopleV).
export const needsPrivate = (view: PlayerView | null, wire: WireView): boolean => {
    if (!view) return true;
    if (wire.configV !== view.configV || wire.peopleV !== view.peopleV) return true;
    const seat = wire.seats.findIndex((s) => s?.pid === view.me.pid);
    const mine = seat === -1 ? null : seat;
    if (mine !== view.me.seat) return true;
    if (mine !== null && wire.hand && wire.hand.no !== view.hand?.no) return wire.seats[mine]!.cards !== 'none' || wire.seats[mine]!.state === 'folded';
    return false;
};

// ── polling ──

// A visitor who has not joined polls nothing (the routes answer only players): their page is read
// again this often while it is in front, and at once when it comes back, so the table behind the
// join card stays current and a removed, locked or full card finds out when it opens.
export const VISITOR_REFRESH_MS = 12_000;

// A live hand: betting or running out.
export const handLive = (view: Pick<TableView, 'hand'> | null): boolean => !!view?.hand && view.hand.phase !== 'complete';

// Whether the action is at most `within` live seats before the viewer's: the polls come faster then.
export const nearTurn = (view: Pick<TableView, 'hand' | 'seats'> | null, mySeat: number | null, within = 2): boolean => {
    const hand = view?.hand;
    if (!hand || hand.phase !== 'betting' || hand.actor === null || mySeat === null) return false;
    const n = view.seats.length;
    let steps = 0;
    for (let k = 0; k < n; k++) {
        const i = (hand.actor + k) % n;
        if (i === mySeat) return steps <= within;
        const s = view.seats[i];
        if (s && (s.state === 'in-hand' || s.state === 'away' || s.state === 'leaving')) steps++;
    }
    return false;
};

export type PollInput = {mode: FeedMode; hidden: boolean; inHand: boolean; nearTurn: boolean; failures: number; scale: number};

// The wait before the next GET state, or null to pause (a hidden page polls nothing; becoming
// visible fetches at once). Every wait is at least `scale` (POKER_NIGHT_POLL_MS).
export const nextPollDelay = ({mode, hidden, inHand, nearTurn: near, failures, scale}: PollInput): number | null => {
    if (hidden) return null;
    let delay: number;
    if (failures > 0) delay = Math.min(1500 * 2 ** failures, 10_000);
    else if (mode === 'realtime') delay = 20_000;
    else if (inHand && near) delay = 1500;
    else if (inHand) delay = 3000;
    else delay = 4000;
    return Math.max(delay, Number.isFinite(scale) ? scale : 0);
};

// ── the clock ──

export type TickRole = 'leader' | 'fallback' | 'none';

// Who ticks: the clock leader at once; every other seated player and the host a moment later, in
// case the leader has gone; a watcher never.
export const tickRole = (view: PlayerView | null): TickRole => {
    if (!view || view.status === 'closed') return 'none';
    if (view.clockLeader !== null && view.clockLeader === view.me.pid) return 'leader';
    return view.me.seat !== null || view.me.isHost ? 'fallback' : 'none';
};

// After an answer that shows the same due time already past (the clocks disagree), tick again this
// much later, at most TICK_RETRIES times.
export const TICK_RETRY_MS = 500;
export const TICK_RETRIES = 5;

// When (this browser's clock) to post the next tick, or null for none: the leader 50–300 ms after
// the due time, a fallback 1.5–2.5 s after it (and only if nothing has moved by then). rand in [0, 1).
export const nextTickAt = ({nextDueAt, offset, role, rand}: {nextDueAt: number | null; offset: number; role: TickRole; rand: number}): number | null => {
    if (nextDueAt === null || role === 'none') return null;
    const due = nextDueAt - offset;
    return role === 'leader' ? due + 50 + rand * 250 : due + 1500 + rand * 1000;
};

// Whether a tick's answer says the due time is still past on the server's own clock, unchanged: a
// skew to wait out with another tick.
export const shouldRetick = (body: Pick<Unchanged, 'nextDueAt' | 'serverNow'>, armedFor: number | null): boolean =>
    body.nextDueAt !== null && body.nextDueAt === armedFor && body.nextDueAt <= body.serverNow;

// ── the clock's ticker ──
//
// When this browser posts a tick, as a pure step (tickerStep) and the small driver around it
// (createTicker) that useTableFeed runs with the real timers and postTick. The rules:
// - One tick out at a time. An answer that lands while one is out (a poll, a beat, the tick's own
//   view) never sends another; the tick's own answer decides what comes next.
// - A due time gets one tick and at most TICK_RETRIES more, whatever the answers: a failure waits
//   TICK_BACKOFF_MS, doubling each time; an answer that shows the same due still past on the
//   server's clock waits TICK_RETRY_MS; an answer that shows it not yet due waits for it on the
//   corrected clock, never sooner than TICK_RETRY_MS. Then the ticks give it up.
// - The count starts again only when the due time or the role changes, or once the feed's failures
//   clear after a run of them (the poll got through): one more go at a due the ticks gave up on.
// - A fallback ticks only once the table has been quiet since it was armed; if it moved, it waits
//   for another quiet spell.

// A failed tick's first wait; it doubles with every retry of the same due time.
export const TICK_BACKOFF_MS = 2000;
// How long a fallback waits for the table to stay quiet before it ticks.
export const FALLBACK_QUIET_MS = 1500;

// How a tick ended: 'moved' answered (a view, or unchanged without the due past on the server's
// clock); 'retick' unchanged with the same due still past there; 'transient' no answer worth the
// name (a dropped connection, busy, rate limited); 'final' refused for good, or aborted.
export type TickOutcome = 'moved' | 'retick' | 'transient' | 'final';

export type TickerState = {
    due: number | null; // the due time armed for (server clock)
    role: TickRole;
    armedSeq: number; // the seq when it was armed: a fallback ticks only if it has not moved
    tries: number; // ticks sent for this due beyond the first
    spent: boolean; // the ticks gave this due up
    inFlight: boolean;
    sentFor: number | null; // the due the tick out was sent for
    failing: boolean; // the feed's failures were above zero at its last change
    timer: number | null; // when (this browser's clock) the next tick goes, or null
};

export const INITIAL_TICKER: TickerState = {
    due: null, role: 'none', armedSeq: -1, tries: 0, spent: false, inFlight: false, sentFor: null, failing: false, timer: null,
};

// What the feed holds now, for the ticker: the due time, the role, the seq, the clock offset and the
// failures in a row.
export type TickerFeed = {due: number | null; role: TickRole; seq: number; offset: number; failures: number};

export type TickerInput =
    | ({type: 'feed'; now: number; rand: number} & TickerFeed)
    | {type: 'fire'; seq: number; now: number; rand: number}
    | {type: 'answer'; outcome: TickOutcome; offset: number; now: number; rand: number};

const armAt = (s: Pick<TickerState, 'due' | 'role'>, offset: number, rand: number): number | null =>
    nextTickAt({nextDueAt: s.due, offset, role: s.role, rand});

// One more tick for the same due, `wait` from now, or the due given up once the retries are spent.
const retry = (s: TickerState, at: number): TickerState =>
    s.tries >= TICK_RETRIES ? {...s, spent: true, timer: null} : {...s, tries: s.tries + 1, timer: at};

export const tickerStep = (s: TickerState, input: TickerInput): {state: TickerState; send: boolean} => {
    switch (input.type) {
        case 'feed': {
            const failing = input.failures > 0;
            if (input.due !== s.due || input.role !== s.role) {
                // A new due time or role: armed afresh, unless a tick is out (its answer arms it).
                const next = {...s, due: input.due, role: input.role, armedSeq: input.seq, tries: 0, spent: false, failing};
                return {state: {...next, timer: s.inFlight ? null : armAt(next, input.offset, input.rand)}, send: false};
            }
            if (s.failing && !failing && s.spent && !s.inFlight) {
                // The connection is back: one more go at the due the ticks gave up on.
                const next = {...s, failing, tries: 0, spent: false, armedSeq: input.seq};
                return {state: {...next, timer: armAt(next, input.offset, input.rand)}, send: false};
            }
            // Anything else (a failure, an unchanged answer, a view with the same due) arms nothing.
            return {state: failing === s.failing ? s : {...s, failing}, send: false};
        }
        case 'fire': {
            if (s.timer === null) return {state: s, send: false};
            if (s.inFlight || s.spent || s.due === null || s.role === 'none') return {state: {...s, timer: null}, send: false};
            if (s.role === 'fallback' && input.seq !== s.armedSeq) {
                // The table moved since this was armed: whoever leads is about; wait for a quiet spell.
                return {state: {...s, armedSeq: input.seq, timer: input.now + FALLBACK_QUIET_MS + input.rand * 1000}, send: false};
            }
            return {state: {...s, timer: null, inFlight: true, sentFor: s.due}, send: true};
        }
        case 'answer': {
            const sent = s.sentFor;
            const next: TickerState = {...s, inFlight: false, sentFor: null, timer: null};
            if (!s.inFlight) return {state: s, send: false};
            // The due moved while the tick was out: arm the new one (the feed has reset the count).
            if (next.due !== sent) return {state: {...next, timer: next.spent ? null : armAt(next, input.offset, input.rand)}, send: false};
            switch (input.outcome) {
                case 'final':
                    return {state: {...next, spent: true}, send: false};
                case 'transient':
                    return {state: retry(next, input.now + TICK_BACKOFF_MS * 2 ** next.tries), send: false};
                case 'retick':
                    return {state: retry(next, input.now + TICK_RETRY_MS), send: false};
                case 'moved': {
                    // Answered, the due still ahead on the server's clock: wait for it, never sooner
                    // than a retry, and count it.
                    const at = armAt(next, input.offset, input.rand);
                    return {state: at === null ? next : retry(next, Math.max(at, input.now + TICK_RETRY_MS)), send: false};
                }
            }
        }
    }
};

export type TickerIo = {
    now: () => number;
    rand: () => number;
    setTimer: (fire: () => void, ms: number) => unknown;
    clearTimer: (handle: unknown) => void;
    // Posts one tick for this due time (server clock) and says how it ended. The answer goes into the
    // feed (and so through ticker.feed) before the promise settles.
    send: (due: number) => Promise<TickOutcome>;
    seq: () => number; // the feed's seq now
    offset: () => number; // the feed's clock offset now
};

export type Ticker = {feed: (feed: TickerFeed) => void; stop: () => void; state: () => TickerState};

// The ticker's driver: tickerStep over real (or fake) timers. One timer at most, cleared before
// another is set; a send's answer is stepped in only while the ticker runs.
export const createTicker = (io: TickerIo): Ticker => {
    let state = INITIAL_TICKER;
    let handle: unknown = null;
    let armedAt: number | null = null;
    let stopped = false;

    const apply = (step: {state: TickerState; send: boolean}) => {
        state = step.state;
        if (state.timer !== armedAt) {
            if (handle !== null) io.clearTimer(handle);
            handle = null;
            armedAt = state.timer;
            if (state.timer !== null) handle = io.setTimer(fire, Math.max(0, state.timer - io.now()));
        }
        if (step.send && state.sentFor !== null) void run(state.sentFor);
    };
    const fire = () => {
        handle = null;
        armedAt = null;
        if (stopped) return;
        // The timer has gone: step with the state's own timer still set, so the step sees it fire.
        apply(tickerStep(state, {type: 'fire', seq: io.seq(), now: io.now(), rand: io.rand()}));
    };
    const run = async (due: number) => {
        let outcome: TickOutcome;
        try {
            outcome = await io.send(due);
        } catch {
            outcome = 'transient';
        }
        if (stopped) return;
        apply(tickerStep(state, {type: 'answer', outcome, offset: io.offset(), now: io.now(), rand: io.rand()}));
    };

    return {
        feed: (feed) => {
            if (!stopped) apply(tickerStep(state, {type: 'feed', ...feed, now: io.now(), rand: io.rand()}));
        },
        stop: () => {
            stopped = true;
            if (handle !== null) io.clearTimer(handle);
            handle = null;
            armedAt = null;
        },
        state: () => state,
    };
};

// ── the transport (P4 runs the realtime side; polling never needs it) ──

export type AblyState = 'initialized' | 'connecting' | 'connected' | 'disconnected' | 'suspended' | 'failed' | 'closing' | 'closed';
export type Transport = 'realtime' | 'poll' | 'both';

// Once tripped, both transports run this long.
export const BOTH_FOR_MS = 5 * 60_000;
export const CONNECT_GRACE_MS = 8000;
export const DISCONNECT_GRACE_MS = 10_000;

// Which transport to trust now. Without realtime, polling. With it, realtime while it is connected
// or still within its grace; both (polls as a safety net) once it has not connected within 8 s, has
// been disconnected over 10 s, is suspended or failed, or the watchdog has tripped.
export const transportPolicy = ({realtime, ablyState, msInState, watchdog}: {realtime: boolean; ablyState: AblyState; msInState: number; watchdog: boolean}): Transport => {
    if (!realtime || ablyState === 'closed' || ablyState === 'closing') return 'poll';
    if (watchdog || ablyState === 'suspended' || ablyState === 'failed') return 'both';
    if ((ablyState === 'initialized' || ablyState === 'connecting') && msInState > CONNECT_GRACE_MS) return 'both';
    if (ablyState === 'disconnected' && msInState > DISCONNECT_GRACE_MS) return 'both';
    return 'realtime';
};

export type WatchdogInput = {
    now: number; // server time
    realtimeOk: boolean; // the latest answer's: a publish failed on the server lately
    liveHand: boolean;
    responseAheadSince: number | null; // since when a response's seq has been above the last realtime one
    lastMessageAt: number | null; // the last realtime message (server time)
    nextDueAt: number | null;
};

// Whether realtime looks stalled: the server says its publishes fail, or during a live hand an
// answer has been ahead of the channel for over 3 s, or nothing came 5 s past a due time.
export const watchdogTripped = ({now, realtimeOk, liveHand, responseAheadSince, lastMessageAt, nextDueAt}: WatchdogInput): boolean => {
    if (!realtimeOk) return true;
    if (!liveHand) return false;
    if (responseAheadSince !== null && now - responseAheadSince > 3000) return true;
    return nextDueAt !== null && now > nextDueAt + 5000 && (lastMessageAt === null || lastMessageAt < nextDueAt);
};

// ── the seat pass ──

// The pass is sent while more than this is left of it; after that the request goes without it,
// reads the identity in full and is answered with a fresh one.
export const PASS_MARGIN_MS = 2 * 60_000;

// The pass's expiry (server ms), read from its own text (v1.<room>.<pid>.<expires, base 36 s>.<mac>).
export const passExpiry = (pass: string | null): number | null => {
    if (!pass) return null;
    const parts = pass.split('.');
    if (parts.length !== 5 || parts[0] !== 'v1' || !/^[0-9a-z]{1,9}$/.test(parts[3])) return null;
    return parseInt(parts[3], 36) * 1000;
};

// The pass to send now (serverNow on the server's clock), or null.
export const passFresh = (pass: string | null, serverNow: number): string | null => {
    const exp = passExpiry(pass);
    return exp !== null && exp - serverNow > PASS_MARGIN_MS ? pass : null;
};
