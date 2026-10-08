// What the table's overlays offer, from the view: the drawers close when the viewer's turn comes
// round and only then; the top bar's own-seat choices follow the seat's state; the join card is
// shut to a removed visitor, at a locked table and in a full room, and asks for chips only when the
// range is open; the notes after a join say what changed; the host's people are the seats in order,
// then everyone else, the removed apart; the settings form sends only what changed and refuses what
// the engine would; the own-chips panel follows the rebuy rules; "chips in, by time" is newest first.

import {describe, expect, it} from 'vitest';
import {BANK_COPY, JOIN_COPY, OVERLAY_COPY, REFUSAL_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {nextDueAt} from '@/lib/poker-night/clock';
import {DEFAULT_CONFIG, checkConfig, mergeConfig} from '@/lib/poker-night/config';
import {reduce} from '@/lib/poker-night/engine';
import {
    bankTimeline, checkGameForm, chipsInValue, chipsRange, gameFormOf, GAME_FIELDS, holdsCards, hostPeople, hostRowStatus, inviteDeal,
    joinCardState, joinNotes, attentionKey, openSeats, profileWaits, ownChips, ownSeat, rebuyLimitChoices, REBUY_FIELDS, requestEnded, seatedCount, tableControl,
    timerChoices, waitingRequests, leaveAsks, leavePlan, leaveTapAsks, homeAsks, leftState, hostSitOut, rememberSitOut, SIT_OUT_MEMORY,
    SIT_OUT_ASK_KEY, SIT_OUT_ASK_MS, sitOutAskRecord, sitOutAsked, type SitOutMemory,
    answerNow, askEndsAt, askKey, askNews, askOffer, askToAnswer, askWaiting, hostAwayNow, leaveAfterLanded, leaveAfterOf, newRequests, NO_ASKS_SEEN, requestKind,
} from '@/lib/poker-night/overlays';
import {ASKS} from '@/lib/poker-night/config';
import type {AskView, MeView} from '@/lib/poker-night/view-types';
import type {TableState} from '@/lib/poker-night/types';
import type {JoinView, PlayerView} from '@/lib/poker-night/view-types';
import {clockLeaderOf, peopleIds, playerView} from '@/lib/poker-night/views';
import {C, F, R, cards, deal, moves, nowOf, ok, pidOf, table} from './fixtures';

const people = (s: TableState, extra: string[] = []) =>
    Object.fromEntries([...peopleIds(s), ...extra].map((pid) => [pid, {name: pid.toUpperCase(), avatar: 'v1:fox:tangerine:none:none'}]));

const pv = (s: TableState, pid: string, opts: {extra?: string[]; removed?: string[]} = {}): PlayerView => playerView(s, pid, {
    code: 'K7QXM4', seq: 1, serverNow: nowOf(s), nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, {}), presence: {}, watchers: 0,
    realtimeOk: true, peopleV: 1, people: people(s, opts.extra), removed: opts.removed ?? [], hasAccount: true, emotes: [], emoteSeq: 0, pass: null, nudge: 0,
});

const three = (config = {}) => table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0, config});

const join = (over: Partial<JoinView> = {}): JoinView => ({
    banned: false, locked: false, seats: 8, seatsFree: 5, watchersFull: false, roomFull: false, buyIn: {min: 2000, max: 2000}, hasAccount: false,
    variant: 'holdem', boards: 1, needsApproval: false, ...over,
});

describe('the drawers and the turn', () => {
    it('names the viewer\'s turn by its number, and nothing on anyone else\'s', () => {
        const s = deal(three());
        const actor = s.hand!.actor!;
        expect(attentionKey(pv(s, pidOf(actor)))).toBe(`turn:${s.turn}`);
        for (const seat of [0, 1, 2].filter((i) => i !== actor)) expect(attentionKey(pv(s, pidOf(seat)))).toBeNull();
        expect(attentionKey(null)).toBeNull();
        // A new turn for the same player is a new key.
        const next = moves(s, C, C);
        const again = next.hand!.actor!;
        expect(attentionKey(pv(next, pidOf(again)))).toBe(`turn:${next.turn}`);
        expect(next.turn).not.toBe(s.turn);
    });

    it('names Triple T\'s throw-away by its hand for every player still to throw, then the first turn after it', () => {
        let s = deal(three({variant: 'triple-t'}), {holes: {0: 'AhKd7c', 1: 'QsQd2h', 2: '9c8c3s'}});
        expect(s.hand!.phase).toBe('discard');
        for (const seat of [0, 1, 2]) expect(attentionKey(pv(s, pidOf(seat)))).toBe(`discard:${s.hand!.no}`);
        // Thrown: nothing asks for that player until the betting reaches them.
        s = ok(reduce(s, {type: 'discard', by: pidOf(0), turn: s.turn, card: cards('7c')[0], at: nowOf(s)}));
        expect(attentionKey(pv(s, pidOf(0)))).toBeNull();
        expect(attentionKey(pv(s, pidOf(1)))).toBe(`discard:${s.hand!.no}`);
        s = ok(reduce(s, {type: 'discard', by: pidOf(1), turn: s.turn, card: cards('2h')[0], at: nowOf(s)}));
        s = ok(reduce(s, {type: 'discard', by: pidOf(2), turn: s.turn, card: cards('3s')[0], at: nowOf(s)}));
        expect(s.hand!.phase).toBe('betting');
        const actor = s.hand!.actor!;
        expect(attentionKey(pv(s, pidOf(actor)))).toBe(`turn:${s.turn}`);
        expect(attentionKey(pv(s, 'w1', {extra: ['w1']}))).toBeNull();
    });

    it('holds a seated player\'s new name and look only while a hand is being played', () => {
        const s = three();
        expect(profileWaits(pv(s, pidOf(0)))).toBe(false);
        const live = deal(s);
        for (const seat of [0, 1, 2]) expect(profileWaits(pv(live, pidOf(seat)))).toBe(true);
        // A watcher never waits, nor does a player whose hand has ended.
        expect(profileWaits(pv(live, 'w1', {extra: ['w1']}))).toBe(false);
        expect(profileWaits(null)).toBe(false);
        const over = moves(live, F, F);
        expect(over.hand?.phase).toBe('complete');
        expect(profileWaits(pv(over, pidOf(0)))).toBe(false);
    });

    it('has no turn between hands or for a watcher', () => {
        const s = three();
        expect(attentionKey(pv(s, pidOf(0)))).toBeNull();
        const watcher = pv(deal(s), 'w1', {extra: ['w1']});
        expect(watcher.me.seat).toBeNull();
        expect(attentionKey(watcher)).toBeNull();
    });
});

describe('the viewer\'s own seat', () => {
    it('offers "sit out next hand" to a seated player, and the way back once sat out or away', () => {
        let s = three();
        expect(ownSeat(pv(s, pidOf(1)))).toMatchObject({seat: 1, chips: 1000, dealtIn: false, choice: 'sit-out', canLeave: true, canTakeSeat: false});
        s = ok(reduce(s, {type: 'sit-out', by: pidOf(1), at: nowOf(s)}));
        expect(ownSeat(pv(s, pidOf(1))).choice).toBe('deal-me-in');
        s.seats[2]!.away = true;
        expect(ownSeat(pv(s, pidOf(2))).choice).toBe('back');
    });

    it('counts the chips in a live pot and knows when leaving folds the cards', () => {
        const s = moves(deal(three()), R(60));
        const raiser = s.seats.findIndex((seat, i) => seat && s.hand!.seats.find((p) => p.seat === i)!.streetBet === 60);
        const own = ownSeat(pv(s, pidOf(raiser)));
        expect(own.chips).toBe(1000);
        expect(own.dealtIn).toBe(true);
        expect(holdsCards(pv(s, pidOf(raiser)), raiser)).toBe(true);
    });

    it('offers a watcher a seat while one is open, and nothing once the table is full', () => {
        const s = three({seats: 4});
        expect(openSeats(pv(s, 'w1', {extra: ['w1']}))).toEqual([3]);
        expect(ownSeat(pv(s, 'w1', {extra: ['w1']}))).toMatchObject({seat: null, canTakeSeat: true, choice: null, canLeave: false});
        const full = table({0: 1000, 1: 1000, 2: 1000, 3: 1000}, {config: {seats: 4}});
        expect(seatedCount(pv(full, pidOf(0)))).toBe(4);
        expect(ownSeat(pv(full, 'w1', {extra: ['w1']})).canTakeSeat).toBe(false);
    });
});

describe('the join card', () => {
    it('is shut to a removed visitor, at a locked table and in a full room, in that order', () => {
        expect(joinCardState(join({banned: true, locked: true}))).toEqual({kind: 'removed'});
        expect(joinCardState(join({locked: true, roomFull: true}))).toEqual({kind: 'locked'});
        expect(joinCardState(join({roomFull: true}))).toEqual({kind: 'room-full'});
    });

    it('sits while a seat is open, watches while a place is, and asks for chips only over a range', () => {
        expect(joinCardState(join())).toEqual({kind: 'open', canSit: true, canWatch: true, chips: null});
        expect(joinCardState(join({seatsFree: 0, watchersFull: true, buyIn: {min: 1000, max: 4000}})))
            .toEqual({kind: 'open', canSit: false, canWatch: false, chips: {min: 1000, max: 4000}});
        expect(chipsRange(2000, 2000)).toBeNull();
    });

    it('reads a typed number of chips inside the range only', () => {
        const range = {min: 1000, max: 4000};
        expect(chipsInValue('2,000', range)).toBe(2000);
        expect(chipsInValue('2k', range)).toBe(2000);
        expect(chipsInValue(' 4000 ', range)).toBe(4000);
        for (const text of ['999', '4001', '', 'abc', '1.5', '-2000']) expect(chipsInValue(text, range)).toBeNull();
    });

    it('says what changed on the way to the seat', () => {
        const live = deal(three({seats: 4}));
        live.seats[3] = {pid: 'p3', stack: 2000, sittingOut: false, sitOutNext: false, away: false, timeouts: 0, owesPost: true, leaving: false, removed: false, pendingBuy: 0, leaveAfter: false};
        const view = pv(live, 'p3');
        expect(joinNotes('seated', null, view, 'player')).toEqual([JOIN_COPY.seated, JOIN_COPY.posting]);
        expect(joinNotes('moved', 'Ana 2', view, 'player')).toEqual([JOIN_COPY.renamed('Ana 2'), JOIN_COPY.seatTaken, JOIN_COPY.seated, JOIN_COPY.posting]);
        const watcher = pv(three(), 'w1', {extra: ['w1']});
        expect(joinNotes('full', null, watcher, 'player')).toEqual([JOIN_COPY.full]);
        expect(joinNotes('watching', null, watcher, 'watcher')).toEqual([JOIN_COPY.watching]);
        expect(joinNotes('returning', null, watcher, 'player')).toEqual([]);
        // Between hands a fresh seat says nothing more.
        expect(joinNotes('seated', null, pv(three(), pidOf(1)), 'player')).toEqual([]);
    });
});

describe('the invite and the host\'s game controls', () => {
    it('offers the host the first deal before it, ready once two sit', () => {
        const fresh = table({0: 2000}, {config: {seats: 8}});
        fresh.status = 'open';
        const host = pv(fresh, pidOf(0));
        expect(inviteDeal(pv(fresh, pidOf(0)), host.me)).toEqual({show: true, ready: false});
        fresh.seats[1] = {...fresh.seats[0]!, pid: 'p1'};
        expect(inviteDeal(pv(fresh, pidOf(0)), host.me)).toEqual({show: true, ready: true});
        expect(inviteDeal(pv(fresh, pidOf(0)), {isHost: false}).show).toBe(false);
        expect(inviteDeal({...pv(fresh, pidOf(0)), status: 'playing'}, host.me).show).toBe(false);
        expect(inviteDeal(pv(fresh, pidOf(0)), null).show).toBe(false);
    });

    it('moves the game with one control: deal, pause or resume, none while the night ends', () => {
        expect(tableControl({status: 'open', closing: false})).toBe('deal');
        expect(tableControl({status: 'playing', closing: false})).toBe('pause');
        expect(tableControl({status: 'paused', closing: false})).toBe('resume');
        expect(tableControl({status: 'playing', closing: true})).toBeNull();
        expect(tableControl({status: 'closed', closing: false})).toBeNull();
    });

    it('counts the requests waiting for the host, for the host only', () => {
        // Once a hand has been dealt, a buy waits for the host.
        const s = {...table({0: 1000, 1: 0}, {config: {rebuys: 'approve', buyInMin: 1000, buyInMax: 2000}}), handNo: 1};
        const asked = ok(reduce(s, {type: 'buy', by: pidOf(1), amount: 1000, at: nowOf(s)}));
        expect(waitingRequests(asked, pv(asked, pidOf(0)).me)).toBe(1);
        expect(waitingRequests(asked, pv(asked, pidOf(1)).me)).toBe(0);
        expect(waitingRequests(asked, null)).toBe(0);
    });
});

describe('the host\'s people', () => {
    it('lists the seats in order, then everyone else, and the removed apart', () => {
        let s = table({0: 1000, 2: 1500, 4: 500});
        s = ok(reduce(s, {type: 'leave', by: pidOf(4), at: nowOf(s)}));
        const view = pv(s, pidOf(0), {extra: ['w9', 'gone'], removed: ['gone']});
        const {players, removed} = hostPeople(view, pidOf(0));
        expect(players.map((p) => p.pid)).toEqual([pidOf(0), pidOf(2), pidOf(4), 'w9']);
        expect(players[0]).toMatchObject({seat: 0, chips: 1000, host: true, me: true, leftWith: null});
        expect(players[1]).toMatchObject({seat: 2, chips: 1500, host: false, me: false});
        expect(players[2]).toMatchObject({seat: null, chips: 0, leftWith: 500});
        expect(players[3]).toMatchObject({seat: null, leftWith: null, name: 'W9'});
        expect(removed).toEqual([{pid: 'gone', name: 'GONE', avatar: 'v1:fox:tangerine:none:none'}]);
        expect(hostRowStatus(players[1])).toBe(TABLE_COPY.seat(2) + ' · ' + TABLE_COPY.presence.offline);
        expect(hostRowStatus(players[2])).toBe(BANK_COPY.leftWith(500));
        expect(hostRowStatus(players[3])).toBe(OVERLAY_COPY.watching);
        expect(hostRowStatus({...players[1], presence: 'here'})).toBe(TABLE_COPY.seat(2));
    });

    it('lists a removed player still seated until the hand ends only among the removed', () => {
        const s = moves(deal(three()), R(60));
        const {players, removed} = hostPeople(pv(s, pidOf(0), {removed: [pidOf(1)]}), pidOf(0));
        expect(players.map((p) => p.pid)).toEqual([pidOf(0), pidOf(2)]);
        expect(removed.map((p) => p.pid)).toEqual([pidOf(1)]);
    });

    it('knows who holds cards in the hand in play', () => {
        const s = moves(deal(three()), R(60));
        const {players} = hostPeople(pv(s, pidOf(0)), pidOf(0));
        expect(players.every((p) => p.dealtIn)).toBe(true);
        const folded = moves(s, {kind: 'fold'});
        const after = hostPeople(pv(folded, pidOf(0)), pidOf(0)).players;
        expect(after.filter((p) => !p.dealtIn)).toHaveLength(1);
    });
});

describe('the settings form', () => {
    const config = {...DEFAULT_CONFIG};

    it('starts from the table\'s config and sends nothing when nothing changed', () => {
        const form = gameFormOf(config);
        expect(form).toMatchObject({smallBlind: '10', bigBlind: '20', ante: '0', buyInMin: '2000', buyInMax: '2000', turnSeconds: 30, rebuys: 'approve', maxRebuys: null, variant: 'holdem', boards: 1});
        expect(checkGameForm(config, form, GAME_FIELDS)).toEqual({ok: true, patch: {}});
        expect(checkGameForm(config, form, REBUY_FIELDS)).toEqual({ok: true, patch: {}});
    });

    it('sends only what changed, read as typed', () => {
        const form = {...gameFormOf(config), smallBlind: '25', bigBlind: '50', buyInMax: '5,000', ante: ''};
        expect(checkGameForm(config, form, GAME_FIELDS)).toEqual({ok: true, patch: {smallBlind: 25, bigBlind: 50, buyInMax: 5000}});
        expect(checkGameForm(config, {...gameFormOf(config), rebuys: 'off', maxRebuys: 3}, REBUY_FIELDS))
            .toEqual({ok: true, patch: {rebuys: 'off', maxRebuys: 3}});
        // A section sends its own fields only.
        expect(checkGameForm(config, {...form, rebuys: 'off'}, REBUY_FIELDS)).toEqual({ok: true, patch: {rebuys: 'off'}});
    });

    it('switches the game from the next hand, one board for any game but PLO', () => {
        expect(checkGameForm(config, {...gameFormOf(config), variant: 'plo'}, GAME_FIELDS)).toEqual({ok: true, patch: {variant: 'plo'}});
        const plo = {...config, variant: 'plo' as const};
        expect(checkGameForm(plo, {...gameFormOf(plo), variant: 'holdem'}, GAME_FIELDS)).toEqual({ok: true, patch: {variant: 'holdem'}});
        // A form left on two boards sends one when the game is not PLO.
        expect(checkGameForm(plo, {...gameFormOf(plo), variant: 'holdem', boards: 2}, GAME_FIELDS)).toEqual({ok: true, patch: {variant: 'holdem'}});
        expect(checkGameForm(config, {...gameFormOf(config), variant: 'triple-t'}, GAME_FIELDS)).toEqual({ok: true, patch: {variant: 'triple-t'}});
        expect(checkGameForm(plo, {...gameFormOf(plo), variant: 'triple-t', boards: 3}, GAME_FIELDS)).toEqual({ok: true, patch: {variant: 'triple-t'}});
        // Two or three boards, PLO's alone.
        expect(checkGameForm(plo, {...gameFormOf(plo), boards: 2}, GAME_FIELDS)).toEqual({ok: true, patch: {boards: 2}});
        expect(checkGameForm(plo, {...gameFormOf(plo), boards: 3}, GAME_FIELDS)).toEqual({ok: true, patch: {boards: 3}});
    });

    it('turns down what the engine would, in the drawer\'s words', () => {
        const bad = (over: Partial<ReturnType<typeof gameFormOf>>) => checkGameForm(config, {...gameFormOf(config), ...over}, GAME_FIELDS);
        expect(bad({bigBlind: '5'})).toEqual({ok: false, message: 'The big blind is at least the small blind.'});
        expect(bad({ante: '30'})).toEqual({ok: false, message: 'The ante is at most the big blind.'});
        expect(bad({buyInMax: '1000'})).toEqual({ok: false, message: 'The chip cap is at least the starting chips.'});
        expect(bad({buyInMax: '2000000'})).toEqual({ok: false, message: 'The chip cap is at most 500 big blinds.'});
        expect(bad({smallBlind: 'ten'})).toEqual({ok: false, message: REFUSAL_COPY['bad-amount']});
        expect(bad({smallBlind: '0'})).toEqual({ok: false, message: REFUSAL_COPY['bad-amount']});
    });

    it('keeps every patch it sends inside the engine\'s limits', () => {
        const forms = [
            {smallBlind: '50', bigBlind: '100', ante: '10', buyInMin: '5000', buyInMax: '20000'},
            {smallBlind: '1', bigBlind: '1', ante: '0', buyInMin: '1', buyInMax: '500'},
        ];
        for (const over of forms) {
            for (const turnSeconds of timerChoices(config.turnSeconds)) {
                const r = checkGameForm(config, {...gameFormOf(config), ...over, turnSeconds}, GAME_FIELDS);
                expect(r.ok).toBe(true);
                if (r.ok) expect(checkConfig(mergeConfig(config, r.patch)).ok).toBe(true);
            }
        }
        for (const maxRebuys of rebuyLimitChoices(7)) {
            const r = checkGameForm(config, {...gameFormOf(config), maxRebuys}, REBUY_FIELDS);
            expect(r.ok).toBe(true);
        }
    });

    it('offers the presets and the table\'s own figure', () => {
        expect(timerChoices(30)).toContain(30);
        expect(timerChoices(37)).toContain(37);
        expect(timerChoices(37)).toEqual([...timerChoices(37)].sort((a, b) => a - b));
        expect(rebuyLimitChoices(null)[0]).toBeNull();
        expect(rebuyLimitChoices(7)).toContain(7);
    });
});

describe('the bank\'s own chips', () => {
    it('offers a rebuy at zero and a top-up to the cap above it, and first chips to a newcomer', () => {
        const s = table({0: 1000, 1: 0}, {config: {buyInMin: 1000, buyInMax: 2000}});
        // The fixture's p1 has bought nothing: their first chips, not a rebuy.
        expect(ownChips(pv(s, pidOf(1)))).toMatchObject({stack: 0, offer: {min: 1000, max: 2000, topUp: 2000, rebuy: false}});
        s.ledger[1].bought = 1000;
        expect(ownChips(pv(s, pidOf(1)))).toMatchObject({stack: 0, requested: null, asksHost: false, offer: {min: 1000, max: 2000, topUp: 2000, rebuy: true}});
        expect(ownChips(pv(s, pidOf(0)))).toMatchObject({stack: 1000, offer: {min: 1, max: 1000, topUp: 1000, rebuy: false}});
        expect(ownChips(pv(s, 'w1', {extra: ['w1']}))).toBeNull();
    });

    it('counts a live pot in the stack, as the bank table does, and says how much of it is there', () => {
        const s = moves(deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0})), R(60));
        const view = pv(s, pidOf(2));
        const own = ownChips(view)!;
        const seat = view.seats[2]!;
        expect(seat.inPot).toBeGreaterThan(0);
        expect(own).toMatchObject({stack: seat.chips + seat.inPot, behind: seat.chips, inPot: seat.inPot});
        expect(own.stack).toBe(1000);
    });

    it('waits on the host once a hand is dealt, but not for the host, and shows the request', () => {
        const fresh = table({0: 1000, 1: 0}, {config: {rebuys: 'approve', buyInMin: 1000, buyInMax: 2000}});
        expect(ownChips(pv(fresh, pidOf(1)))!.asksHost).toBe(false);
        const s = {...fresh, handNo: 1};
        expect(ownChips(pv(s, pidOf(1)))!.asksHost).toBe(true);
        expect(ownChips(pv(s, pidOf(0)))!.asksHost).toBe(false);
        const asked = ok(reduce(s, {type: 'buy', by: pidOf(1), amount: 1500, at: nowOf(s)}));
        expect(ownChips(pv(asked, pidOf(1)))).toMatchObject({requested: 1500, offer: null});
        const approved = ok(reduce(asked, {type: 'host', by: pidOf(0), op: {op: 'approve', pid: pidOf(1)}, at: nowOf(asked)}));
        const before = {bought: asked.ledger.find((r) => r.pid === pidOf(1))!.bought};
        const row = approved.ledger.find((r) => r.pid === pidOf(1))!;
        const still = {seated: true, leaving: false, withdrawn: false};
        expect(requestEnded(before, {bought: row.bought, pendingBuy: 0, ...still})).toBe('approved');
        const denied = ok(reduce(asked, {type: 'host', by: pidOf(0), op: {op: 'deny', pid: pidOf(1)}, at: nowOf(asked)}));
        expect(requestEnded(before, {bought: denied.ledger.find((r) => r.pid === pidOf(1))!.bought, pendingBuy: 0, ...still})).toBe('declined');
    });

    it('never reads a request the viewer took back as the host\'s no: a Cancel, a leave now or after the hand', () => {
        const before = {bought: 0};
        const gone = {bought: 0, pendingBuy: 0};
        expect(requestEnded(before, {...gone, seated: true, leaving: false, withdrawn: true})).toBe('withdrawn');
        expect(requestEnded(before, {...gone, seated: false, leaving: false, withdrawn: false})).toBe('withdrawn');
        expect(requestEnded(before, {...gone, seated: true, leaving: true, withdrawn: false})).toBe('withdrawn');
        expect(requestEnded(before, {...gone, seated: true, leaving: false, withdrawn: false})).toBe('declined');
        // Chips that came are an approval whatever else happened.
        expect(requestEnded(before, {bought: 0, pendingBuy: 500, seated: true, leaving: true, withdrawn: true})).toBe('approved');
    });

    it('says when the host counts as away: a seat\'s chips then land without the host, and the bank says so', () => {
        const s = {...table({0: 1000, 1: 0}, {config: {rebuys: 'approve', buyInMin: 1000, buyInMax: 2000}}), handNo: 1};
        const view = pv(s, pidOf(1));
        const away = {...view, me: {...view.me, hostAwayAt: 5000}};
        expect(hostAwayNow(away.me, 5000)).toBe(false);
        expect(hostAwayNow(away.me, 5001)).toBe(true);
        expect(hostAwayNow(view.me, 1e12)).toBe(false);
        expect(ownChips(away, 4000)).toMatchObject({asksHost: true, hostAway: false});
        expect(ownChips(away, 6000)).toMatchObject({asksHost: false, hostAway: true});
        // A seat that never had chips here: its offer is a first buy, never a rebuy.
        expect(ownChips(away, 4000)!.offer).toMatchObject({first: true, rebuy: false, topUp: 2000});
    });

    it('offers nothing with rebuys off or used up, or while leaving after the hand', () => {
        const off = table({0: 1000, 1: 0}, {config: {rebuys: 'off'}});
        off.ledger[1].bought = 1000;
        expect(ownChips(pv(off, pidOf(1)))!.offer).toBeNull();
        const capped = table({0: 1000, 1: 0}, {config: {maxRebuys: 1, buyInMin: 1000, buyInMax: 2000}});
        capped.ledger[1].bought = 1000;
        capped.ledger[1].buys = 1;
        expect(ownChips(pv(capped, pidOf(1)))).toMatchObject({offer: null, used: 1, maxRebuys: 1});
        const going = deal(table({0: 1000, 1: 1000}, {config: {buyInMin: 1000, buyInMax: 2000}}));
        const leavingAfter = ok(reduce(going, {type: 'leave-after', by: pidOf(1), on: true, at: nowOf(going)}));
        expect(ownChips(pv(going, pidOf(1)))!.offer).not.toBeNull();
        expect(ownChips(pv(leavingAfter, pidOf(1)))!.offer).toBeNull();
    });

    it('lists the chips in, by time, newest first', () => {
        const items = bankTimeline([
            {pid: 'a', name: 'Ana', events: [{at: 0, kind: 'buy-in', amount: 2000}, {at: 9000, kind: 'rebuy', amount: 1000}]},
            {pid: 'b', name: 'Ben', events: [{at: 5000, kind: 'buy-in', amount: 2000}]},
        ]);
        expect(items.map((i) => [i.name, i.kind, i.at])).toEqual([['Ana', 'rebuy', 9000], ['Ben', 'buy-in', 5000], ['Ana', 'buy-in', 0]]);
        expect(new Set(items.map((i) => i.key)).size).toBe(3);
        expect(bankTimeline([{pid: 'a', name: 'A', events: Array.from({length: 50}, (_, i) => ({at: i, kind: 'top-up' as const, amount: 1}))}], 10)).toHaveLength(10);
    });
});

describe('leaving, and the way home', () => {
    it('says what sitting down again takes: nothing, the host\'s yes, or no way back', () => {
        // Before the first hand sitting down again simply works; after it, anyone but the host asks.
        expect(leaveAsks({rebuys: 'approve', maxRebuys: null}, 5, false, false)).toBeNull();
        expect(leaveAsks({rebuys: 'approve', maxRebuys: null}, 0, false, true)).toBe('rebuys-ask');
        expect(leaveAsks({rebuys: 'approve', maxRebuys: null}, 0, true, true)).toBeNull();
        expect(leaveAsks({rebuys: 'off', maxRebuys: null}, 0, true, false)).toBe('rebuys-off');
        expect(leaveAsks({rebuys: 'approve', maxRebuys: 2}, 1, false, false)).toBeNull();
        expect(leaveAsks({rebuys: 'approve', maxRebuys: 2}, 2, false, false)).toBe('rebuy-cap');
        // The break's one tap asks first only with no way back: the host's yes is said after, in the left panel.
        expect(leaveTapAsks(pv(three(), pidOf(1)))).toBe(false);
        expect(leaveTapAsks(pv({...three(), handNo: 1}, pidOf(1)))).toBe(false);
        expect(leaveTapAsks(pv({...three(), handNo: 1}, pidOf(0)))).toBe(false);
        expect(leaveTapAsks(pv(three({rebuys: 'off'}), pidOf(1)))).toBe(true);
        expect(leaveTapAsks(pv(three({maxRebuys: 1}), pidOf(1)))).toBe(false);
    });

    it('reads the leave dialog between hands: the chips counted, one Leave, and the way home', () => {
        const s = three({rebuys: 'off'});
        const stay = leavePlan(pv(s, pidOf(1)), 'stay')!;
        expect(stay).toMatchObject({midHand: false, title: TABLE_COPY.leaveTitle, body: TABLE_COPY.leaveBody(1000), note: TABLE_COPY.rebuysOffNote});
        // Staying on the page, the leave is "leave after this hand": at once between hands, and a deal
        // that lands first is played out, never folded.
        expect(stay.actions).toEqual([{send: 'leave-after', label: TABLE_COPY.leave, destructive: true, navigates: false}]);
        expect(stay.afterNote).toBeNull();
        const home = leavePlan(pv(three(), pidOf(1)), 'home')!;
        expect(home.note).toBeNull();
        expect(home.actions).toEqual([{send: 'leave', label: TABLE_COPY.leaveAndGo, destructive: true, navigates: true}]);
        expect(leavePlan(pv(s, 'w1', {extra: ['w1']}), 'stay')).toBeNull();
    });

    it('turns into the mid-hand dialog the moment a hand is dealt to the viewer, and back once they fold', () => {
        let s = deal(three());
        const mid = leavePlan(pv(s, pidOf(0)), 'stay')!;
        expect(mid).toMatchObject({midHand: true, title: TABLE_COPY.leaveMidHandTitle});
        expect(mid.body).toBe(TABLE_COPY.leaveBodyInHand(990));
        // Leave now, or after this hand (the primary, last); going home, the way that goes is last.
        expect(mid.actions).toEqual([
            {send: 'leave', label: TABLE_COPY.leaveNow, destructive: true, navigates: false},
            {send: 'leave-after', label: TABLE_COPY.leaveAfter, destructive: false, navigates: false},
        ]);
        expect(mid.afterNote).toBe(TABLE_COPY.leaveAfterNote);
        expect(leavePlan(pv(s, pidOf(0)), 'home')!.actions).toEqual([
            {send: 'leave-after', label: TABLE_COPY.leaveAfter, destructive: false, navigates: false},
            {send: 'leave', label: TABLE_COPY.leaveNowAndGo, destructive: true, navigates: true},
        ]);
        // Once they chose to leave after it, only leaving now is left to offer.
        const after = ok(reduce(s, {type: 'leave-after', by: pidOf(0), on: true, at: nowOf(s)}));
        expect(leavePlan(pv(after, pidOf(0)), 'stay')!.actions.map((a) => a.send)).toEqual(['leave']);
        expect(leavePlan(pv(after, pidOf(0)), 'home')!.actions.map((a) => a.label)).toEqual([TABLE_COPY.leaveNowAndGo]);
        s = moves(s, F);
        expect(leavePlan(pv(s, pidOf(2)), 'stay')!.midHand).toBe(false);
    });

    it('goes home at once for a visitor, a watcher, a player already leaving and a closed table; asks anyone seated', () => {
        const s = deal(three());
        expect(homeAsks(null)).toBe(false);
        expect(homeAsks(pv(s, 'w1', {extra: ['w1']}))).toBe(false);
        expect(homeAsks(pv(s, pidOf(0)))).toBe(true);
        expect(homeAsks(pv(three(), pidOf(0)))).toBe(true);
        const leaving = ok(reduce(s, {type: 'leave', by: pidOf(1), at: nowOf(s)}));
        expect(homeAsks(pv(leaving, pidOf(1)))).toBe(false);
        const closed = structuredClone(three());
        closed.status = 'closed';
        expect(homeAsks(pv(closed, pidOf(0)))).toBe(false);
    });

    it('knows a player who folded and then left is leaving, though the plate still reads Folded', () => {
        let s = deal(three());
        const folder = s.hand!.actor!;
        s = moves(s, F);
        s = ok(reduce(s, {type: 'leave', by: pidOf(folder), at: nowOf(s)}));
        expect(s.seats[folder]!.leaving).toBe(true);
        const view = pv(s, pidOf(folder));
        expect(view.seats[folder]!.state).toBe('folded');
        expect(view.me.next).toBe('leave');
        // Home goes straight home, the menu offers neither a seat choice nor Leave, and the dialog has nothing to ask.
        expect(homeAsks(view)).toBe(false);
        expect(ownSeat(view)).toMatchObject({choice: null, canLeave: false});
        expect(leavePlan(view, 'stay')).toBeNull();
        expect(leavePlan(view, 'home')).toBeNull();
        // Nobody else learns of it before the hand ends.
        expect(pv(s, pidOf((folder + 1) % 3)).me.next).toBeNull();
    });

    it('greets a player who left with their net, and the way back to a seat or why there is none', () => {
        const s = three();
        const left = ok(reduce(s, {type: 'leave', by: pidOf(1), at: nowOf(s)}));
        expect(leftState(pv(left, pidOf(1)))).toEqual({net: 0, sitAgain: true, note: null});
        // Still seated, a watcher who never played, removed, closed: nothing.
        expect(leftState(pv(s, pidOf(1)))).toBeNull();
        expect(leftState(pv(left, 'w1', {extra: ['w1']}))).toBeNull();
        expect(leftState(pv(left, pidOf(1), {removed: [pidOf(1)]}))).toBeNull();
        const closed = structuredClone(left);
        closed.status = 'closed';
        expect(leftState(pv(closed, pidOf(1)))).toBeNull();
        // The figure is what they left with against what they brought.
        const won = structuredClone(s);
        won.seats[1]!.stack = 1450;
        won.ledger[1].bought = 1000;
        expect(leftState(pv(ok(reduce(won, {type: 'leave', by: pidOf(1), at: nowOf(won)})), pidOf(1)))!.net).toBe(450);
        const off = ok(reduce(three({rebuys: 'off'}), {type: 'leave', by: pidOf(1), at: nowOf(s)}));
        expect(leftState(pv(off, pidOf(1)))).toMatchObject({sitAgain: false, note: REFUSAL_COPY['rebuys-off']});
        const ask = ok(reduce({...three({rebuys: 'approve'}), handNo: 1}, {type: 'leave', by: pidOf(1), at: nowOf(s)}));
        expect(leftState(pv(ask, pidOf(1)))).toMatchObject({sitAgain: true, note: TABLE_COPY.rebuysAskNote});
        const full = table({0: 1000, 1: 1000, 2: 1000}, {config: {seats: 3}});
        const gone = ok(reduce(full, {type: 'leave', by: pidOf(1), at: nowOf(full)}));
        const taken = ok(reduce(gone, {type: 'sit', by: 'p9', seat: 1, buyIn: gone.config.buyInMax, at: nowOf(gone)}));
        expect(leftState(pv(taken, pidOf(1)))).toMatchObject({sitAgain: false, note: JOIN_COPY.full});
    });
});

describe('sitting out', () => {
    it('offers the host "Sit out next hand" for each other player in the game, and a note while theirs waits on the hand', () => {
        const s = deal(three());
        const host = pv(s, pidOf(0));
        expect(hostSitOut(host, pidOf(1), null)).toBe('offer');
        expect(hostSitOut(host, pidOf(1), s.hand!.no)).toBe('waiting');
        // Asked during an earlier hand: that one is long applied.
        expect(hostSitOut(host, pidOf(1), s.hand!.no - 1)).toBe('offer');
        // Never for the host themself, from anyone else, or for a stranger.
        expect(hostSitOut(host, pidOf(0), null)).toBeNull();
        expect(hostSitOut(pv(s, pidOf(1)), pidOf(2), null)).toBeNull();
        expect(hostSitOut(host, 'p9', null)).toBeNull();
        // Between hands it applies at once: nothing waits.
        expect(hostSitOut(pv(three(), pidOf(0)), pidOf(1), 1)).toBe('offer');
    });

    it('offers nothing for a player already sitting out, away, leaving or out of chips, or at a closed table', () => {
        const s = three();
        const out = ok(reduce(s, {type: 'host', by: pidOf(0), op: {op: 'sit-out', pid: pidOf(1)}, at: nowOf(s)}));
        expect(hostSitOut(pv(out, pidOf(0)), pidOf(1), null)).toBeNull();
        const away = structuredClone(s);
        away.seats[2]!.away = true;
        expect(hostSitOut(pv(away, pidOf(0)), pidOf(2), null)).toBeNull();
        const broke = structuredClone(s);
        broke.seats[2]!.stack = 0;
        expect(hostSitOut(pv(broke, pidOf(0)), pidOf(2), null)).toBeNull();
        const closed = structuredClone(s);
        closed.status = 'closed';
        expect(hostSitOut(pv(closed, pidOf(0)), pidOf(1), null)).toBeNull();
        const dealt = deal(s);
        const leaving = ok(reduce(dealt, {type: 'leave', by: pidOf(1), at: nowOf(dealt)}));
        expect(hostSitOut(pv(leaving, pidOf(0)), pidOf(1), null)).toBeNull();
    });

    it('tells the host\'s sit-out from the viewer\'s own, from the views alone', () => {
        const step = (m: SitOutMemory, ...events: Parameters<typeof rememberSitOut>[1][]) => events.reduce(rememberSitOut, m);
        // The host, between hands.
        expect(step(SIT_OUT_MEMORY, {state: 'waiting'}, {state: 'sitting-out'}).byHost).toBe(true);
        // The host, during a hand: the seat sits out once it ends.
        expect(step(SIT_OUT_MEMORY, {state: 'in-hand'}, {state: 'folded'}, {state: 'sitting-out'}).byHost).toBe(true);
        // The viewer's own, between hands and during one.
        expect(step(SIT_OUT_MEMORY, {state: 'waiting'}, {sent: 'sit-out'}, {state: 'sitting-out'}).byHost).toBe(false);
        expect(step(SIT_OUT_MEMORY, {state: 'in-hand'}, {sent: 'sit-out'}, {state: 'all-in'}, {state: 'sitting-out'}).byHost).toBe(false);
        // A page opened on a seat already sitting out says nothing of the host.
        expect(step(SIT_OUT_MEMORY, {state: 'sitting-out'}).byHost).toBe(false);
        // "I'm back" clears it, and so does the seat coming back into the game.
        const host = step(SIT_OUT_MEMORY, {state: 'waiting'}, {state: 'sitting-out'});
        expect(step(host, {sent: 'sit-in'}).byHost).toBe(false);
        expect(step(host, {state: 'waiting'}).byHost).toBe(false);
        // A sit-out the viewer asked for is spent once it lands: the next one is the host's.
        const spent = step(SIT_OUT_MEMORY, {state: 'waiting'}, {sent: 'sit-out'}, {state: 'sitting-out'}, {state: 'waiting'}, {state: 'sitting-out'});
        expect(spent.byHost).toBe(true);
        // Nothing changed, the same memory.
        expect(rememberSitOut(host, {state: 'sitting-out'})).toBe(host);
    });

    it('reads the viewer\'s own `next`: a reload or another tab never blames the host for the viewer\'s own sit-out', () => {
        const step = (m: SitOutMemory, ...events: Parameters<typeof rememberSitOut>[1][]) => events.reduce(rememberSitOut, m);
        // A page opened mid-hand on a sit-out already waiting (the viewer asked, then reloaded): nothing of the host.
        expect(step(SIT_OUT_MEMORY, {state: 'in-hand', next: 'sit-out'}, {state: 'folded', next: 'sit-out'}, {state: 'sitting-out', next: 'sit-out'}).byHost).toBe(false);
        expect(step(SIT_OUT_MEMORY, {state: 'in-hand', next: 'sit-out'}, {state: 'sitting-out', next: null}).byHost).toBe(false);
        // The viewer's other tab sent it: this tab sees it turn up, and this browser's note says whose it is.
        expect(step(SIT_OUT_MEMORY, {state: 'in-hand'}, {state: 'sitting-out', askedHere: true}).byHost).toBe(false);
        expect(step(SIT_OUT_MEMORY, {state: 'in-hand'}, {state: 'in-hand', next: 'sit-out', askedHere: true}, {state: 'sitting-out'}).byHost).toBe(false);
        // The host's, seen mid-hand through the viewer's own part: blamed, and still once the seat sits out.
        const mid = step(SIT_OUT_MEMORY, {state: 'in-hand'}, {state: 'in-hand', next: 'sit-out'});
        expect(mid.byHost).toBe(true);
        expect(step(mid, {state: 'sitting-out', next: null}).byHost).toBe(true);
        // Taken back mid-hand: nothing pending, nothing blamed.
        expect(step(mid, {sent: 'sit-in'}, {state: 'in-hand', next: null}).byHost).toBe(false);
        // A sit-out on its way is not spent by a view from before it landed.
        expect(step(SIT_OUT_MEMORY, {state: 'waiting'}, {sent: 'sit-out'}, {state: 'waiting'}, {state: 'sitting-out'}).byHost).toBe(false);
        // A refused one is no ask: a later sit-out is the host's.
        expect(step(SIT_OUT_MEMORY, {state: 'waiting'}, {sent: 'sit-out'}, {refused: 'sit-out'}, {state: 'sitting-out'}).byHost).toBe(true);
        // Unseated: forgotten.
        expect(step(mid, {state: null})).toBe(SIT_OUT_MEMORY);
    });

    it('keeps this browser\'s note of a sit-out for one table, one player and half an hour', () => {
        const at = 1_000_000;
        const raw = sitOutAskRecord('ABC123', 'p1', at);
        expect(sitOutAsked(raw, 'ABC123', 'p1', at + 60_000)).toBe(true);
        // Read against the server's clock, either side of this browser's.
        expect(sitOutAsked(raw, 'ABC123', 'p1', at - 5_000)).toBe(true);
        expect(sitOutAsked(raw, 'ABC123', 'p1', at + SIT_OUT_ASK_MS)).toBe(false);
        expect(sitOutAsked(raw, 'XYZ789', 'p1', at)).toBe(false);
        expect(sitOutAsked(raw, 'ABC123', 'p2', at)).toBe(false);
        expect(sitOutAsked(null, 'ABC123', 'p1', at)).toBe(false);
        expect(sitOutAsked('not json', 'ABC123', 'p1', at)).toBe(false);
        expect(sitOutAsked(JSON.stringify({code: 'ABC123', pid: 'p1', at: 'soon'}), 'ABC123', 'p1', at)).toBe(false);
        expect(SIT_OUT_ASK_KEY.startsWith('aero-poker-night:')).toBe(true);
    });

    it('offers "Deal me in" from the menu while a sit-out waits on the hand in play', () => {
        let s = deal(three());
        s = ok(reduce(s, {type: 'sit-out', by: pidOf(1), at: nowOf(s)}));
        const view = pv(s, pidOf(1));
        expect(view.me.next).toBe('sit-out');
        expect(ownSeat(view).choice).toBe('deal-me-in');
        // The host's, the same: the view never says whose, and the player's sit-in takes it back.
        let h = deal(three());
        h = ok(reduce(h, {type: 'host', by: pidOf(0), op: {op: 'sit-out', pid: pidOf(2)}, at: nowOf(h)}));
        expect(ownSeat(pv(h, pidOf(2))).choice).toBe('deal-me-in');
        const back = ok(reduce(h, {type: 'sit-in', by: pidOf(2), at: nowOf(h)}));
        expect(pv(back, pidOf(2)).me.next).toBeNull();
        expect(ownSeat(pv(back, pidOf(2))).choice).toBe('sit-out');
    });
});

describe('leaving after this hand', () => {
    it('is offered while the viewer holds cards in a live hand, set once chosen, gone once they leave now', () => {
        let s = deal(three());
        expect(leaveAfterOf(pv(s, pidOf(0)))).toBe('offer');
        expect(ownSeat(pv(s, pidOf(0)))).toMatchObject({leaveAfter: 'offer', canLeave: true, choice: 'sit-out'});
        expect(leaveAfterOf(pv(three(), pidOf(0)))).toBeNull();
        expect(leaveAfterOf(pv(s, 'w1', {extra: ['w1']}))).toBeNull();
        s = ok(reduce(s, {type: 'leave-after', by: pidOf(0), on: true, at: nowOf(s)}));
        const set = pv(s, pidOf(0));
        expect(ownSeat(set)).toMatchObject({leaveAfter: 'set', canLeave: true, choice: null});
        // Home still asks: the hand is still theirs to play, or to leave now.
        expect(homeAsks(set)).toBe(true);
        expect(leaveAfterLanded(set)).toBe(true);
        const now = ok(reduce(s, {type: 'leave', by: pidOf(0), at: nowOf(s)}));
        expect(ownSeat(pv(now, pidOf(0)))).toMatchObject({leaveAfter: null, canLeave: false});
        expect(leaveAfterLanded(pv(now, pidOf(0)))).toBe(false);
    });

    it('says a leave sent between hands landed after a deal only while the seat is kept', () => {
        const s = three();
        const gone = ok(reduce(s, {type: 'leave-after', by: pidOf(1), on: true, at: nowOf(s)}));
        expect(leaveAfterLanded(pv(gone, pidOf(1)))).toBe(false);
        // A deal first: the same action leaves after the hand just dealt.
        const dealt = ok(reduce(deal(s), {type: 'leave-after', by: pidOf(1), on: true, at: nowOf(deal(s))}));
        expect(leaveAfterLanded(pv(dealt, pidOf(1)))).toBe(true);
    });
});

describe('the host\'s requests for chips', () => {
    it('names what each one is for, and which are new', () => {
        let s = deal(three());
        s = moves(s, F, F);
        s = ok(reduce(s, {type: 'sit', by: pidOf(5), seat: 5, buyIn: 2000, at: nowOf(s)}));
        expect(requestKind(pv(s, pidOf(0)), pidOf(5))).toBe('seat');
        const broke = structuredClone(s);
        broke.seats[1]!.stack = 0;
        expect(requestKind(pv(broke, pidOf(0)), pidOf(1))).toBe('rebuy');
        expect(requestKind(pv(s, pidOf(0)), pidOf(2))).toBe('top-up');
        expect(newRequests([], [{pid: 'a', amount: 1}])).toEqual([{pid: 'a', amount: 1}]);
        expect(newRequests([{pid: 'a', amount: 1}], [{pid: 'a', amount: 1}, {pid: 'b', amount: 2}])).toEqual([{pid: 'b', amount: 2}]);
        // A second request from the same player for another amount is new.
        expect(newRequests([{pid: 'a', amount: 1}], [{pid: 'a', amount: 3}])).toEqual([{pid: 'a', amount: 3}]);
        // The join card's note after sitting: the chips wait.
        expect(joinNotes('seated', null, pv(s, pidOf(5)), 'player')).toEqual([TABLE_COPY.waitingApproval]);
    });
});

describe('asks to see a hand, as the page reads them', () => {
    const ask = (over: Partial<AskView>): AskView => ({from: 'me', to: 'ana', fromSeat: 0, toSeat: 1, at: 1000, until: 1000 + ASKS.WAIT_MS, answer: 'waiting', ...over});
    const me = (over: Partial<MeView> = {}): Pick<MeView, 'pid' | 'asks' | 'canAsk' | 'askBlocked'> => ({pid: 'me', asks: [], canAsk: [], askBlocked: [], ...over});

    it('reads an unanswered ask as expired once its seconds are up', () => {
        expect(answerNow(ask({}), 1000 + ASKS.WAIT_MS - 1)).toBe('waiting');
        expect(answerNow(ask({}), 1000 + ASKS.WAIT_MS)).toBe('expired');
        expect(answerNow(ask({answer: 'shown'}), 1e12)).toBe('shown');
    });

    it('offers an ask, greys it with why not, or says how the viewer\'s ask stands', () => {
        expect(askOffer(me({canAsk: ['ana']}), 'ana', 0)).toEqual({kind: 'ask'});
        expect(askOffer(me({askBlocked: [['ana', 'asks-off']]}), 'ana', 0)).toEqual({kind: 'blocked', block: 'asks-off'});
        expect(askOffer(me({askBlocked: [['ana', 'cooldown']]}), 'ana', 0)).toEqual({kind: 'blocked', block: 'cooldown'});
        expect(askOffer(me(), 'ana', 0)).toBeNull();
        const asked = me({asks: [ask({})], askBlocked: [['ben', 'waiting']]});
        expect(askOffer(asked, 'ana', 2000)).toEqual({kind: 'asked', answer: 'waiting'});
        expect(askOffer(asked, 'ben', 2000)).toEqual({kind: 'blocked', block: 'waiting'});
        // Its seconds up: a no for Ana, and Ben may be asked — no write between.
        expect(askOffer(asked, 'ana', 1000 + ASKS.WAIT_MS)).toEqual({kind: 'asked', answer: 'expired'});
        expect(askOffer(asked, 'ben', 1000 + ASKS.WAIT_MS)).toEqual({kind: 'ask'});
        // Unless that was every ask a hand allows.
        const spent = me({asks: [ask({answer: 'no'}), ask({to: 'cy', toSeat: 2})], askBlocked: [['ben', 'waiting']]});
        expect(askOffer(spent, 'ben', 1000 + ASKS.WAIT_MS)).toEqual({kind: 'blocked', block: 'limit'});
    });

    it('finds the ask the viewer is to answer, and what of theirs got its answer', () => {
        const toMe = ask({from: 'ana', to: 'me', fromSeat: 1, toSeat: 0});
        expect(askToAnswer({pid: 'me', asks: [toMe]}, 2000)).toEqual(toMe);
        expect(askToAnswer({pid: 'me', asks: [toMe]}, 1000 + ASKS.WAIT_MS)).toBeNull();
        // The next deal ends every ask: the prompt runs to it when it comes first, and goes then.
        const dealing = {status: 'playing' as const, nextHandAt: 6000};
        expect(askEndsAt(toMe, dealing)).toBe(6000);
        expect(askEndsAt(toMe, {status: 'paused', nextHandAt: 6000})).toBe(toMe.until);
        expect(askEndsAt(toMe, {status: 'playing', nextHandAt: null})).toBe(toMe.until);
        expect(askEndsAt(toMe, {status: 'playing', nextHandAt: 1e12})).toBe(toMe.until);
        expect(askToAnswer({pid: 'me', asks: [toMe]}, 5999, dealing)).toEqual(toMe);
        expect(askToAnswer({pid: 'me', asks: [toMe]}, 6000, dealing)).toBeNull();
        expect(askToAnswer({pid: 'me', asks: [ask({})]}, 2000)).toBeNull();
        expect(askWaiting({pid: 'me', asks: [toMe]}, 2000)).toBe(true);
        expect(askWaiting({pid: 'me', asks: [toMe]}, 1000 + ASKS.WAIT_MS)).toBe(false);
        const first = askNews(NO_ASKS_SEEN, {pid: 'me', asks: [ask({})]}, 2000, 4);
        expect(first.news).toEqual([]);
        expect(first.seen).toEqual({hand: 4, asks: {[askKey(ask({}))]: {ask: ask({}), answer: 'waiting'}}});
        const answered = askNews(first.seen, {pid: 'me', asks: [ask({answer: 'shown'})]}, 3000, 4);
        expect(answered.news.map((n) => n.answer)).toEqual(['shown']);
        expect(askNews(answered.seen, {pid: 'me', asks: [ask({answer: 'shown'})]}, 4000, 4).news).toEqual([]);
        // Unanswered past its time: said once, as expired.
        const expired = askNews(first.seen, {pid: 'me', asks: [ask({})]}, 1000 + ASKS.WAIT_MS, 4);
        expect(expired.news.map((n) => n.answer)).toEqual(['expired']);
        expect(askNews(expired.seen, {pid: 'me', asks: [ask({})]}, 1000 + ASKS.WAIT_MS + 1000, 4).news).toEqual([]);
        // Unchanged, the record is the same object (no re-render).
        expect(askNews(first.seen, {pid: 'me', asks: [ask({})]}, 2500, 4).seen).toBe(first.seen);
    });

    it('says an ask of the viewer\'s that the next deal ended while it waited, once; one already over says nothing more', () => {
        const first = askNews(NO_ASKS_SEEN, {pid: 'me', asks: [ask({}), ask({from: 'ana', to: 'me', fromSeat: 1, toSeat: 0})]}, 2000, 4);
        // Hand 5 is dealt: the asks leave the view with hand 4.
        const dealt = askNews(first.seen, {pid: 'me', asks: []}, 3000, 5);
        expect(dealt.news).toEqual([{ask: ask({}), answer: 'dealt'}]);
        expect(askNews(dealt.seen, {pid: 'me', asks: []}, 4000, 5).news).toEqual([]);
        // Answered before the deal: said as answered, and not again at the deal.
        const answered = askNews(first.seen, {pid: 'me', asks: [ask({answer: 'no'})]}, 2500, 4);
        expect(askNews(answered.seen, {pid: 'me', asks: []}, 3000, 5).news).toEqual([]);
        // Nothing seen yet when the page opens on a hand: nothing to say.
        expect(askNews(NO_ASKS_SEEN, {pid: 'me', asks: []}, 3000, 5).news).toEqual([]);
    });
});
