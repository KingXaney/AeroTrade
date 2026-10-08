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
import type {EmoteView, MeView, PlayerView, RoomView, TableView, Unchanged, WireView} from '@/lib/poker-night/view-types';

// An event with the moment (this browser's clock) the table saw it.
export type RoomEvent = TableEvent & {seenAt: number};

export type FeedMode = 'polling' | 'realtime' | 'reconnecting';

export type FeedState = {
    view: PlayerView | null; // the viewer's own view, once they have joined
    preview: RoomView | null; // the page's public view, for a visitor who has not
    seq: number; // of the view held (the preview's until the first view)
    // How far the viewer's own part — their cards, the config, the people — is known fresh: the last
    // whole view's seq (a GET state, a move's answer, or an older one kept by graftPrivate), carried
    // on by each realtime message that leaves it as it was (needsPrivate) while no move of the
    // viewer's own is out. Below seq, the next GET state asks for the whole view again
    // (since=privateSeq) instead of Unchanged, at the table's own pace (pollPace).
    privateSeq: number;
    emoteSeq: number;
    knownSeq: number; // the highest seq any answer has named: above seq, a GET state is due
    knownEmoteSeq: number;
    // The viewer's nudge count (PlayerView.nudge) of the view held, and the highest any answer or
    // the viewer's own channel has named: above it, a GET state is due — their own view changed
    // where the public seq did not move (an ask to see their cards, its answer).
    nudge: number;
    knownNudge: number;
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
    // own: the answer to a move of the viewer's own — maybe a write nobody else can see (a
    // pre-action, leaving after the hand, an ask, its answer), which moves no seq
    // (room-doc.publicSeq), so at the seq held it still brings the viewer's own part.
    | {type: 'view'; view: PlayerView; at: number; sentAt?: number; animate?: boolean; own?: boolean}
    // The public part alone, from the realtime channel (P4). moving: a move of the viewer's own is
    // out, whose commit may change their own part where no message shows it (a pre-action), so the
    // message does not count that part fresh — the move's answer brings it.
    | {type: 'wire'; wire: WireView; at: number; animate?: boolean; moving?: boolean}
    | {type: 'unchanged'; body: Unchanged; at: number; sentAt?: number}
    // The viewer's own channel says their nudge count is now this (a 'nudge' message).
    | {type: 'nudge'; nudge: number}
    | {type: 'failed'}
    // Emotes that came on their own: the realtime channel's 'emote' messages, the sender's own (P6).
    | {type: 'emotes'; emotes: EmoteView[]}
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
        seq: base.seq, privateSeq: base.seq, emoteSeq: view?.emoteSeq ?? 0, knownSeq: base.seq, knownEmoteSeq: view?.emoteSeq ?? 0,
        nudge: view?.nudge ?? 0, knownNudge: view?.nudge ?? 0,
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
// state brings it fresh (needsPrivate says when). What the message itself shows to be over is
// dropped at once: a new hand's message leaves the last hand's cards out, and a pre-action goes
// once the server has cleared it (ownPart).
export const mergeWire = (view: PlayerView, wire: WireView): PlayerView => ({
    ...view,
    me: ownPart(view, wire),
    v: wire.v, status: wire.status, closing: wire.closing, settings: wire.settings, configV: wire.configV, hostPid: wire.hostPid,
    handNo: wire.handNo, turn: wire.turn, nextHandAt: wire.nextHandAt, seats: wire.seats, hand: wire.hand, ledger: wire.ledger,
    requests: wire.requests, seq: wire.seq, serverNow: wire.serverNow, nextDueAt: wire.nextDueAt, code: wire.code,
    clockLeader: wire.clockLeader, peopleV: wire.peopleV, watchers: wire.watchers, realtimeOk: wire.realtimeOk,
});

// The viewer's own part, the same in every field.
const sameMe = (a: MeView, b: MeView): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

// Whether the viewer's pre-action still stands after this message. Only its owner sets one (and
// the move's own answer brings it), and the engine clears it when its owner acts, folds or leaves,
// when the turn reaches them, when the street moves on and when the hand ends — every one of
// which the public table shows.
const preStands = (view: PlayerView, wire: WireView): boolean => {
    const seat = view.me.seat;
    const was = view.hand;
    const now = wire.hand;
    if (seat === null || !was || !now || now.no !== was.no || now.street !== was.street || now.phase !== 'betting' || now.actor === seat) return false;
    const before = view.seats[seat];
    const after = wire.seats[seat];
    return !!before && !!after && after.pid === before.pid && after.state === before.state && after.acted === before.acted && after.bet === before.bet;
};

const NO_ASKS: MeView['asks'] = [];
const NO_PIDS: string[] = [];
const NO_SHOWN: MeView['shownToMe'] = [];

// The viewer's own part under a realtime message: the cards of the hand they were dealt (and the one
// they threw away), a pre-action the server has not cleared, what their seat does when that hand
// ends (a new deal has done it: a sit-out has begun, a leave has cashed the seat out), the hand's
// asks and what was shown to them alone (a new deal ends every one), and whether they host (the
// message names the host).
const ownPart = (view: PlayerView, wire: WireView): MeView => {
    const sameHand = (wire.hand?.no ?? null) === (view.hand?.no ?? null);
    const pre = view.me.pre !== null && preStands(view, wire) ? view.me.pre : null;
    const isHost = wire.hostPid === view.me.pid;
    if (sameHand) return pre === view.me.pre && isHost === view.me.isHost ? view.me : {...view.me, pre, isHost};
    return {...view.me, hole: null, pre, next: null, discard: null, asks: NO_ASKS, canAsk: NO_PIDS, shownToMe: NO_SHOWN, isHost};
};

// A whole view older than the table held — the read a message asked for, overtaken by the next
// message — still brings the viewer's own part when nothing between the two could have changed it:
// the same hand, seat, config and people (needsPrivate, read from the older view to the held one).
// Its own part is then laid under the held table as a message would be (mergeWire: the cards of the
// same hand, a pre-action only while the seat is as it was); null when something could have.
export const graftPrivate = (held: PlayerView, whole: PlayerView): PlayerView | null =>
    whole.me.pid === held.me.pid && whole.seq < held.seq && !needsPrivate(whole, held) ? mergeWire(whole, held) : null;

// Emotes that came on their own (P6): an 'emote' message off the realtime channel, or the sender's
// own from POST emote's answer. Merged once each (mergeEmotes); the emote seq moves only while the
// emotes held run on without a gap from it, so a poll's esince never skips one the channel missed —
// and an emote past a gap names a newer emote seq (knownEmoteSeq), which reads the table once.
export const withEmotes = (state: FeedState, incoming: readonly EmoteView[]): FeedState => {
    if (incoming.length === 0 || state.view === null) return state;
    const emotes = mergeEmotes(state.emotes, incoming, state.emoteFloor);
    const seqs = new Set([...emotes, ...incoming].map((e) => e.seq));
    let emoteSeq = state.emoteSeq;
    while (seqs.has(emoteSeq + 1)) emoteSeq++;
    const knownEmoteSeq = Math.max(state.knownEmoteSeq, ...incoming.map((e) => e.seq));
    if (emoteSeq === state.emoteSeq && knownEmoteSeq === state.knownEmoteSeq && emotes.length === state.emotes.length && emotes.every((e, i) => e === state.emotes[i])) return state;
    return {...state, emotes, emoteSeq, knownEmoteSeq};
};

export const feedReducer = (state: FeedState, input: FeedInput): FeedState => {
    switch (input.type) {
        case 'mounted':
            return state.samples.length > 0 ? state : {...state, offset: Math.round(state.serverNow - input.at)};
        case 'failed':
            return {...state, failures: state.failures + 1};
        case 'emotes':
            return withEmotes(state, input.emotes);
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
            const nudge = view.nudge ?? 0;
            const knownNudge = Math.max(state.knownNudge, nudge);
            // An answer no newer than the view held: only its clock sample and pass count — unless it
            // is the whole view of the table a realtime message already showed, whose private part
            // (a new hand's cards, a seat, the config, the people) is what it was fetched for, or the
            // whole view a nudge asked for (the viewer's own part changed at the seq held).
            const samePlayer = state.view !== null && view.me.pid === state.view.me.pid;
            const freshens = view.seq === state.seq && (state.privateSeq < view.seq || (samePlayer && nudge > state.nudge));
            if (state.view !== null && view.seq <= state.seq && !freshens) {
                const kept = {...state, ...clock, pass, failures: 0, knownSeq: Math.max(state.knownSeq, view.seq), knownNudge};
                // The viewer's own move, answered at the seq held (a write only they can see): their
                // own part from it, the table as held — unless a nudge since says it is older.
                if (input.own === true && view.seq === state.seq && samePlayer && nudge >= state.nudge) {
                    const held = state.view;
                    return sameMe(held.me, view.me) ? {...kept, nudge} : {...kept, nudge, view: {...held, me: view.me}};
                }
                // Older still, yet newer than the own part held: that part, kept under the table held
                // when nothing since could have changed it (graftPrivate) — else a read again.
                const grafted = view.seq > state.privateSeq ? graftPrivate(state.view, view) : null;
                if (grafted === null) return kept;
                const events = input.animate === false ? [] : diffViews(state.view, grafted, diffOptions(grafted));
                return {
                    ...kept, ...withEvents(state, events, at), view: grafted, privateSeq: state.seq,
                    emotes: mergeEmotes(state.emotes, view.emotes, state.emoteFloor),
                    emoteSeq: Math.max(state.emoteSeq, view.emoteSeq), knownEmoteSeq: Math.max(state.knownEmoteSeq, view.emoteSeq),
                };
            }
            const prev: (TableView & {seq: number; serverNow: number}) | null = state.view ?? state.preview;
            const events = input.animate === false ? [] : diffViews(prev, view, diffOptions(view));
            const emotes = mergeEmotes(state.emotes, view.emotes, state.emoteFloor);
            return {
                ...state, ...clock, ...withEvents(state, events, at),
                view, preview: null, seq: view.seq, privateSeq: view.seq, emoteSeq: Math.max(state.emoteSeq, view.emoteSeq),
                knownSeq: Math.max(state.knownSeq, view.seq), knownEmoteSeq: Math.max(state.knownEmoteSeq, view.emoteSeq),
                nudge, knownNudge,
                serverNow: view.serverNow, nextDueAt: view.nextDueAt, pass, emotes, failures: 0,
            };
        }
        case 'nudge':
            return input.nudge > state.knownNudge ? {...state, knownNudge: input.nudge} : state;
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
                // An older server's Unchanged names no nudge count.
                knownNudge: typeof body.nudge === 'number' ? Math.max(state.knownNudge, body.nudge) : state.knownNudge,
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
            // The viewer's own part stays as fresh as the message when nothing in it says otherwise
            // (what moved, mergeWire worked out) and no move of theirs is out; else it waits for the
            // whole view.
            const carried = input.moving !== true && state.privateSeq === state.seq && !needsPrivate(state.view, wire);
            const privateSeq = carried ? wire.seq : state.privateSeq;
            return {
                ...state, ...withEvents(state, events, at), view, seq: wire.seq, privateSeq, knownSeq, serverNow: wire.serverNow, nextDueAt: wire.nextDueAt,
            };
        }
    }
};

// Whether an answer named a seq, an emote seq or a nudge count beyond what is held: a GET state is
// due.
export const isBehind = (state: Pick<FeedState, 'seq' | 'emoteSeq' | 'knownSeq' | 'knownEmoteSeq' | 'nudge' | 'knownNudge'>): boolean =>
    state.knownSeq > state.seq || state.knownEmoteSeq > state.emoteSeq || state.knownNudge > state.nudge;

// Two failures in a row read as reconnecting.
export const feedMode = (state: Pick<FeedState, 'failures'>, realtime = false): FeedMode =>
    state.failures >= 2 ? 'reconnecting' : realtime ? 'realtime' : 'polling';

// Whether a realtime message (public only) leaves the viewer's own part stale, so one GET state is
// due: a new hand they are dealt into (their cards), their seat or role changed, the config moved,
// the people did (names and looks travel beside the wire, versioned by peopleV), the hand they were
// dealt into has just completed (who they may ask to see their cards), or their seat now holds a
// different count of cards face down than they hold (a card thrown away for them).
export const needsPrivate = (view: PlayerView | null, wire: WireView): boolean => {
    if (!view) return true;
    if (wire.configV !== view.configV || wire.peopleV !== view.peopleV) return true;
    const seat = wire.seats.findIndex((s) => s?.pid === view.me.pid);
    const mine = seat === -1 ? null : seat;
    if (mine !== view.me.seat) return true;
    if (mine !== null && wire.hand && wire.hand.no !== view.hand?.no) return wire.seats[mine]!.cards !== 'none' || wire.seats[mine]!.state === 'folded';
    if (wire.hand && view.hand && wire.hand.no === view.hand.no && view.me.hole !== null) {
        if (wire.hand.phase === 'complete' && view.hand.phase !== 'complete') return true;
        const cards = mine === null ? null : wire.seats[mine]!.cards;
        if (typeof cards === 'number' && cards !== view.me.hole.length) return true;
    }
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

// The pace the poll keeps under a transport: over a healthy channel only the safety poll, unless the
// viewer's own part is stale (its read failed, or came back older than a message and could not be
// kept), which the table's own pace reads again; else the table's own pace.
export const pollPace = (transport: Transport, state: Pick<FeedState, 'seq' | 'privateSeq'>): FeedMode =>
    transport === 'realtime' && state.privateSeq >= state.seq ? 'realtime' : 'polling';

// Whether a GET state's answer calls for another at once: one was asked for while it was out, an
// answer named a newer seq or emote seq, or a whole view came back older than the messages with its
// own part not kept (graftPrivate) — the next read is the whole view at the head. An Unchanged says
// the server had nothing past what was asked, so the pace reads again, not a loop.
export const readAgain = ({again, whole, state}: {
    again: boolean;
    whole: boolean;
    state: Pick<FeedState, 'seq' | 'privateSeq' | 'emoteSeq' | 'knownSeq' | 'knownEmoteSeq' | 'nudge' | 'knownNudge'>;
}): boolean => again || isBehind(state) || (whole && state.privateSeq < state.seq);

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

// ── the transport (realtime where the deployment has it; polling never needs it) ──

export type AblyState = 'initialized' | 'connecting' | 'connected' | 'disconnected' | 'suspended' | 'failed' | 'closing' | 'closed';
export type Transport = 'realtime' | 'poll' | 'both';

// Once tripped, both transports run this long.
export const BOTH_FOR_MS = 5 * 60_000;
export const CONNECT_GRACE_MS = 8000;
export const DISCONNECT_GRACE_MS = 10_000;

// A first token that does not come is asked for again (components/poker-night/realtime-client):
// after TOKEN_RETRY_MS while the refusal is one that passes (a dropped connection, a busy room, the
// token counter), then every TOKEN_RETRY_LATER_MS for as long as the page is open — never given up,
// so a table that missed its first token goes live once the route answers again. From the first
// long wait (tokenRetryLate) the link reports 'failed', and both transports run until it connects.
export const TOKEN_RETRY_MS = [5000, 15_000, 45_000] as const;
export const TOKEN_RETRY_LATER_MS = BOTH_FOR_MS;

export const tokenRetryLate = (attempt: number, transient: boolean): boolean => !transient || attempt >= TOKEN_RETRY_MS.length;

export const tokenRetryDelay = (attempt: number, transient: boolean): number =>
    tokenRetryLate(attempt, transient) ? TOKEN_RETRY_LATER_MS : TOKEN_RETRY_MS[attempt] ?? TOKEN_RETRY_LATER_MS;

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

// The watchdog's limits: an answer ahead of the channel this long, or nothing on it this long past a
// due time, during a live hand.
export const AHEAD_GRACE_MS = 3000;
export const SILENCE_GRACE_MS = 5000;

export type WatchdogInput = {
    now: number; // server time
    realtimeOk: boolean; // the latest answer's: a publish failed on the server lately
    liveHand: boolean;
    responseAheadSince: number | null; // since when a response's seq has been above the last realtime one
    lastMessageAt: number | null; // the last realtime message (server time)
    nextDueAt: number | null;
    // Since when (server time) the channel has been connected; the silence counts only for a due
    // time it was connected for. Left out: connected all along.
    connectedAt?: number | null;
};

// Whether realtime looks stalled: the server says its publishes fail, or during a live hand an
// answer has been ahead of the channel for over 3 s, or nothing came 5 s past a due time.
export const watchdogTripped = ({now, realtimeOk, liveHand, responseAheadSince, lastMessageAt, nextDueAt, connectedAt}: WatchdogInput): boolean => {
    if (!realtimeOk) return true;
    if (!liveHand) return false;
    if (responseAheadSince !== null && now - responseAheadSince > AHEAD_GRACE_MS) return true;
    if (nextDueAt === null || (connectedAt !== undefined && (connectedAt === null || connectedAt > nextDueAt))) return false;
    return now > nextDueAt + SILENCE_GRACE_MS && (lastMessageAt === null || lastMessageAt < nextDueAt);
};

// ── the realtime monitor ──
//
// What the browser knows about its channel, as a pure step (monitorStep) the hook feeds — the
// connection's states, each message, each answer to a request, the read after an attach, and a
// check once a second — and what it says (transportOf): realtime alone while the channel is
// healthy; both (polls beside it) for BOTH_FOR_MS once anything in transportPolicy or the watchdog
// says otherwise, counted again from the last time it did; polling alone without realtime.
//
// "Ahead" compares the answers with the channel: an answer whose seq the channel has not delivered
// yet is normal for a moment (a player's own move is answered before the publish that follows it),
// stalled after AHEAD_GRACE_MS. Only what the channel could have carried counts: the read that
// follows each attach sets the baseline (the channel need not repeat what came before it), and an
// answer counts only while connected.

export type RealtimeMonitor = {
    on: boolean; // this table goes live (the page said so, or the QA's relay is there)
    ablyState: AblyState;
    since: number; // browser time ablyState began
    connectedAt: number | null; // server time the channel connected, null while it is not
    bothUntil: number; // browser time: polls run beside the channel until then
    wireSeq: number; // the newest seq the channel delivered, or the baseline
    answerSeq: number; // the newest seq an answer named
    aheadSince: number | null; // server time since an answer has been ahead of the channel
    lastMessageAt: number | null; // server time of the last message
    realtimeOk: boolean; // the latest answer's or message's word on the server's publishes
};

// realtimeOk: the word of the view the page holds when the monitor starts, so a page opened inside a
// failure window runs both from the start.
export const initialMonitor = (on: boolean, at: number, realtimeOk = true): RealtimeMonitor => ({
    on, ablyState: 'initialized', since: at, connectedAt: null, bothUntil: on && !realtimeOk ? at + BOTH_FOR_MS : 0, wireSeq: 0, answerSeq: 0,
    aheadSince: null, lastMessageAt: null, realtimeOk,
});

export type MonitorInput =
    // The server says this table has no realtime (GET token): poll.
    | {type: 'off'}
    | {type: 'connection'; state: AblyState; at: number; serverNow: number}
    // The read after an attach: what it held (seq) the channel need not deliver.
    | {type: 'baseline'; seq: number}
    // A message, with its word on the publishes (the wire view's realtimeOk, as of its commit).
    | {type: 'message'; seq: number; realtimeOk: boolean; at: number; serverNow: number}
    // An answer to a request: a view's realtimeOk or an Unchanged's (read from the head); null from
    // an answer that does not carry one (an older server's Unchanged, during a rollout).
    | {type: 'answer'; seq: number; realtimeOk: boolean | null; at: number; serverNow: number}
    | {type: 'check'; at: number; serverNow: number; liveHand: boolean; nextDueAt: number | null};

const caughtUp = (m: RealtimeMonitor): RealtimeMonitor => (m.aheadSince !== null && m.wireSeq >= m.answerSeq ? {...m, aheadSince: null} : m);

export const monitorStep = (m: RealtimeMonitor, input: MonitorInput): RealtimeMonitor => {
    switch (input.type) {
        case 'off':
            return m.on ? {...m, on: false} : m;
        case 'connection': {
            if (input.state === m.ablyState) return m;
            const connected = input.state === 'connected';
            // A new connection counts afresh: what was ahead before it is the next read's to settle.
            return {...m, ablyState: input.state, since: input.at, connectedAt: connected ? input.serverNow : null, aheadSince: null};
        }
        case 'baseline':
            return caughtUp({...m, wireSeq: Math.max(m.wireSeq, input.seq)});
        case 'message': {
            // Only the newest message's word counts (a late one says what was); one saying the
            // publishes fail trips at once, as an answer does.
            const newest = input.seq >= m.wireSeq;
            const next = caughtUp({
                ...m, wireSeq: Math.max(m.wireSeq, input.seq), lastMessageAt: input.serverNow, realtimeOk: newest ? input.realtimeOk : m.realtimeOk,
            });
            return m.on && newest && !input.realtimeOk ? {...next, bothUntil: input.at + BOTH_FOR_MS} : next;
        }
        case 'answer': {
            const answerSeq = Math.max(m.answerSeq, input.seq);
            const realtimeOk = input.realtimeOk ?? m.realtimeOk;
            const ahead = m.on && m.ablyState === 'connected' && answerSeq > m.wireSeq;
            const next = {...m, answerSeq, realtimeOk, aheadSince: ahead ? (m.aheadSince ?? input.serverNow) : m.aheadSince};
            // The server says its publishes fail: both at once, without waiting for a check.
            return m.on && input.realtimeOk === false ? {...next, bothUntil: input.at + BOTH_FOR_MS} : caughtUp(next);
        }
        case 'check': {
            if (!m.on) return m;
            const raw = transportPolicy({realtime: true, ablyState: m.ablyState, msInState: input.at - m.since, watchdog: false});
            const stalled = !m.realtimeOk || (m.ablyState === 'connected' && watchdogTripped({
                now: input.serverNow, realtimeOk: m.realtimeOk, liveHand: input.liveHand, responseAheadSince: m.aheadSince,
                lastMessageAt: m.lastMessageAt, nextDueAt: input.nextDueAt, connectedAt: m.connectedAt,
            }));
            return raw === 'both' || stalled ? {...m, bothUntil: input.at + BOTH_FOR_MS} : m;
        }
    }
};

// The transport the monitor says to run now (browser time).
export const transportOf = (m: RealtimeMonitor, at: number): Transport =>
    m.on ? transportPolicy({realtime: true, ablyState: m.ablyState, msInState: at - m.since, watchdog: at < m.bothUntil}) : 'poll';

// Whether the table is live: realtime alone, over a connected channel.
export const monitorLive = (m: RealtimeMonitor, at: number): boolean => m.ablyState === 'connected' && transportOf(m, at) === 'realtime';

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
