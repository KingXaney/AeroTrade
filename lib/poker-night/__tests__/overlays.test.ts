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
    joinCardState, joinNotes, myTurnKey, openSeats, profileWaits, ownChips, ownSeat, rebuyLimitChoices, REBUY_FIELDS, requestEnded, seatedCount, tableControl,
    timerChoices, waitingRequests,
} from '@/lib/poker-night/overlays';
import type {TableState} from '@/lib/poker-night/types';
import type {JoinView, PlayerView} from '@/lib/poker-night/view-types';
import {clockLeaderOf, peopleIds, playerView} from '@/lib/poker-night/views';
import {C, F, R, deal, moves, nowOf, ok, pidOf, table} from './fixtures';

const people = (s: TableState, extra: string[] = []) =>
    Object.fromEntries([...peopleIds(s), ...extra].map((pid) => [pid, {name: pid.toUpperCase(), avatar: 'v1:fox:tangerine:none:none'}]));

const pv = (s: TableState, pid: string, opts: {extra?: string[]; removed?: string[]} = {}): PlayerView => playerView(s, pid, {
    code: 'K7QXM4', seq: 1, serverNow: nowOf(s), nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, {}), presence: {}, watchers: 0,
    realtimeOk: true, peopleV: 1, people: people(s, opts.extra), removed: opts.removed ?? [], hasAccount: true, emotes: [], emoteSeq: 0, pass: null,
});

const three = (config = {}) => table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0, config});

const join = (over: Partial<JoinView> = {}): JoinView => ({
    banned: false, locked: false, seats: 8, seatsFree: 5, watchersFull: false, roomFull: false, buyIn: {min: 2000, max: 2000}, hasAccount: false, ...over,
});

describe('the drawers and the turn', () => {
    it('names the viewer\'s turn by its number, and nothing on anyone else\'s', () => {
        const s = deal(three());
        const actor = s.hand!.actor!;
        expect(myTurnKey(pv(s, pidOf(actor)))).toBe(s.turn);
        for (const seat of [0, 1, 2].filter((i) => i !== actor)) expect(myTurnKey(pv(s, pidOf(seat)))).toBeNull();
        expect(myTurnKey(null)).toBeNull();
        // A new turn for the same player is a new key.
        const next = moves(s, C, C);
        const again = next.hand!.actor!;
        expect(myTurnKey(pv(next, pidOf(again)))).toBe(next.turn);
        expect(next.turn).not.toBe(s.turn);
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
        expect(myTurnKey(pv(s, pidOf(0)))).toBeNull();
        const watcher = pv(deal(s), 'w1', {extra: ['w1']});
        expect(watcher.me.seat).toBeNull();
        expect(myTurnKey(watcher)).toBeNull();
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
        live.seats[3] = {pid: 'p3', stack: 2000, sittingOut: false, sitOutNext: false, away: false, timeouts: 0, owesPost: true, leaving: false, removed: false, pendingBuy: 0};
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
        const s = table({0: 1000, 1: 0}, {config: {rebuys: 'approve', buyInMin: 1000, buyInMax: 2000}});
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
        expect(form).toMatchObject({smallBlind: '10', bigBlind: '20', ante: '0', buyInMin: '2000', buyInMax: '2000', turnSeconds: 30, rebuys: 'auto', maxRebuys: null});
        expect(checkGameForm(config, form, GAME_FIELDS)).toEqual({ok: true, patch: {}});
        expect(checkGameForm(config, form, REBUY_FIELDS)).toEqual({ok: true, patch: {}});
    });

    it('sends only what changed, read as typed', () => {
        const form = {...gameFormOf(config), smallBlind: '25', bigBlind: '50', buyInMax: '5,000', ante: ''};
        expect(checkGameForm(config, form, GAME_FIELDS)).toEqual({ok: true, patch: {smallBlind: 25, bigBlind: 50, buyInMax: 5000}});
        expect(checkGameForm(config, {...gameFormOf(config), rebuys: 'approve', maxRebuys: 3}, REBUY_FIELDS))
            .toEqual({ok: true, patch: {rebuys: 'approve', maxRebuys: 3}});
        // A section sends its own fields only.
        expect(checkGameForm(config, {...form, rebuys: 'off'}, REBUY_FIELDS)).toEqual({ok: true, patch: {rebuys: 'off'}});
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
    it('offers a rebuy at zero and a top-up to the cap above it', () => {
        const s = table({0: 1000, 1: 0}, {config: {buyInMin: 1000, buyInMax: 2000}});
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

    it('waits on the host under "host approves", but not for the host, and shows the request', () => {
        const s = table({0: 1000, 1: 0}, {config: {rebuys: 'approve', buyInMin: 1000, buyInMax: 2000}});
        expect(ownChips(pv(s, pidOf(1)))!.asksHost).toBe(true);
        expect(ownChips(pv(s, pidOf(0)))!.asksHost).toBe(false);
        const asked = ok(reduce(s, {type: 'buy', by: pidOf(1), amount: 1500, at: nowOf(s)}));
        expect(ownChips(pv(asked, pidOf(1)))).toMatchObject({requested: 1500, offer: null});
        const approved = ok(reduce(asked, {type: 'host', by: pidOf(0), op: {op: 'approve', pid: pidOf(1)}, at: nowOf(asked)}));
        const before = {bought: asked.ledger.find((r) => r.pid === pidOf(1))!.bought};
        const row = approved.ledger.find((r) => r.pid === pidOf(1))!;
        expect(requestEnded(before, {bought: row.bought, pendingBuy: 0})).toBe('approved');
        const denied = ok(reduce(asked, {type: 'host', by: pidOf(0), op: {op: 'deny', pid: pidOf(1)}, at: nowOf(asked)}));
        expect(requestEnded(before, {bought: denied.ledger.find((r) => r.pid === pidOf(1))!.bought, pendingBuy: 0})).toBe('declined');
    });

    it('offers nothing with rebuys off or used up', () => {
        const off = table({0: 1000, 1: 0}, {config: {rebuys: 'off'}});
        expect(ownChips(pv(off, pidOf(1)))!.offer).toBeNull();
        const capped = table({0: 1000, 1: 0}, {config: {maxRebuys: 1, buyInMin: 1000, buyInMax: 2000}});
        capped.ledger[1].buys = 1;
        expect(ownChips(pv(capped, pidOf(1)))).toMatchObject({offer: null, used: 1, maxRebuys: 1});
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
