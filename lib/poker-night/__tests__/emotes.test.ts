// Emotes: the registries (twelve reactions, sixteen phrases, ten throwables, each glyph one plain
// emoji code point from Emoji 12.0 or earlier), a request read only with exactly its keys and ids
// from the registries (and the route's zod schema agreeing with the hand-written reader), a message
// off the channel read the same way, who may send what, the room's one conditional write (the
// cooldown in its filter, the seq from the write itself, the ring's slice, the awards' counts), and
// how the table draws them — what a viewer sees (muted, stale, their own), the on-screen caps, the
// timers' phases, a throw's path and the impacts' pieces, the same on every screen, and the impact
// colours' CSS safe inside a <style> tag.

import {describe, expect, it} from 'vitest';
import {isHex6} from '@/lib/theme/color';
import {
    admit, awardPaths, buildEmoteCss, burstJitter, checkEmote, EMOTE_COOLDOWN_MS, EMOTE_CSS, EMOTE_REFUSALS, EMOTE_SIZES, EMOTE_TIMING, emoteCeiling, emoteOut,
    emoteShows, emoteSpot, IMPACT_COLOURS, IMPACT_KINDS, impactBits, impactOf, isPhrase, isReaction, isThrowable, landed, landingSound, liveFor, MIN_ARC,
    nextChange, ON_SCREEN_CAP, parseEmote, PHRASE_IDS, REACTION_IDS, reactionPx, REACTIONS, reactionGlyph, readEmote, settle, THROW_IDS, THROWABLES,
    throwCeiling, throwGlyph, throwPath, throwPx, type EmoteMessage, type LiveEmote,
} from '@/lib/poker-night/emotes';
import {SEAT_COUNTS} from '@/lib/poker-night/layout';
import {SOUND_IDS} from '@/lib/poker-night/sounds';
import {avatarCentre, CARD_RATIO, SHOWN_CARD_PX, stageLayout} from '@/lib/poker-night/stage';
import {EmoteSchema} from '@/lib/poker-night/input';
import {LIMITS} from '@/lib/poker-night/limits';
import {emoteTableFromDoc, emoteWrite} from '@/lib/poker-night/room-doc';
import {KEEP} from '@/lib/poker-night/config';
import {errorStatus} from '@/lib/poker-night/http';

const A = 'Aaaaaaaaaa1';
const B = 'Bbbbbbbbbb2';
const C = 'Cccccccccc3';
const T0 = 1_791_000_000_000;

const msg = (over: Partial<EmoteMessage> & Pick<EmoteMessage, 'kind'>): EmoteMessage =>
    ({item: 'laugh', id: 'e1', seq: 1, from: A, at: T0, ...over} as EmoteMessage);

describe('the registries', () => {
    it('list 12 reactions, 16 phrases and 10 throwables, each with an impact', () => {
        expect(REACTION_IDS).toEqual(['laugh', 'wow', 'cool', 'fire', 'clap', 'cry', 'think', 'grimace', 'peek', 'party', 'huff', 'sleepy']);
        expect(PHRASE_IDS).toHaveLength(16);
        expect(new Set(PHRASE_IDS).size).toBe(16);
        expect(THROW_IDS).toEqual(['tomato', 'rose', 'soda', 'confetti', 'cake', 'egg', 'tennis-ball', 'popcorn', 'heart', 'fish']);
        for (const id of THROW_IDS) expect(IMPACT_KINDS).toContain(impactOf(id));
        expect(new Set(THROW_IDS.map(impactOf))).toEqual(new Set(IMPACT_KINDS));
        expect(impactOf('tomato')).toBe('splat');
        expect(impactOf('tennis-ball')).toBe('bounce');
        expect(impactOf('soda')).toBe('fizz');
    });

    it('pin the code points the design lists', () => {
        expect(REACTIONS).toEqual({
            laugh: 0x1f602, wow: 0x1f62e, cool: 0x1f60e, fire: 0x1f525, clap: 0x1f44f, cry: 0x1f62d,
            think: 0x1f914, grimace: 0x1f62c, peek: 0x1f648, party: 0x1f973, huff: 0x1f624, sleepy: 0x1f634,
        });
        expect(Object.fromEntries(THROW_IDS.map((id) => [id, THROWABLES[id].point]))).toEqual({
            tomato: 0x1f345, rose: 0x1f339, soda: 0x1f964, confetti: 0x1f389, cake: 0x1f370, egg: 0x1f95a,
            'tennis-ball': 0x1f3be, popcorn: 0x1f37f, heart: 0x1f496, fish: 0x1f41f,
        });
    });

    it('draw each one as a single plain emoji code point', () => {
        const points: number[] = [...Object.values(REACTIONS), ...THROW_IDS.map((id) => THROWABLES[id].point)];
        for (const point of points) {
            // Emoji 12.0 or earlier sits in these blocks; no joiner, skin tone or selector is a whole glyph.
            expect(point >= 0x1f300 && point <= 0x1f9ff, point.toString(16)).toBe(true);
            expect((point >= 0x1f3fb && point <= 0x1f3ff) || point === 0x200d || (point >= 0xfe00 && point <= 0xfe0f)).toBe(false);
            // 1F971 (yawning) is the first Emoji 12.0 face past the ones used; nothing newer than 12.0.
            expect(point === 0x1f971 || point === 0x1f97a || (point >= 0x1fa70 && point <= 0x1faff)).toBe(false);
        }
        expect(new Set(points).size).toBe(points.length);
        for (const id of REACTION_IDS) expect(Array.from(reactionGlyph(id))).toHaveLength(1);
        for (const id of THROW_IDS) expect(Array.from(throwGlyph(id))).toHaveLength(1);
    });

    it('keep every id short and lower case, and read only their own ids', () => {
        for (const id of [...REACTION_IDS, ...PHRASE_IDS, ...THROW_IDS]) expect(id).toMatch(/^[a-z][a-z-]{1,15}$/);
        expect(isReaction('laugh')).toBe(true);
        expect(isReaction('toString')).toBe(false);
        expect(isPhrase('gg')).toBe(true);
        expect(isPhrase('good call')).toBe(false);
        expect(isThrowable('egg')).toBe(true);
        expect(isThrowable('constructor')).toBe(false);
        expect(isThrowable('snowball')).toBe(false);
    });
});

describe('a request', () => {
    it('reads a reaction, a phrase and a throw at a pid', () => {
        expect(parseEmote({kind: 'react', item: 'laugh'})).toEqual({kind: 'react', item: 'laugh'});
        expect(parseEmote({kind: 'say', item: 'good-luck'})).toEqual({kind: 'say', item: 'good-luck'});
        expect(parseEmote({kind: 'throw', item: 'tomato', to: B})).toEqual({kind: 'throw', item: 'tomato', to: B});
    });

    it('refuses anything else: extra or missing keys, free text, an id of another kind, a bad pid', () => {
        const bad: unknown[] = [
            null, 'laugh', [], {kind: 'react'}, {kind: 'react', item: 'laugh', to: B}, {kind: 'react', item: 'gg'}, {kind: 'say', item: 'Free text here'},
            {kind: 'say', item: 'laugh'}, {kind: 'throw', item: 'tomato'}, {kind: 'throw', item: 'snowball', to: B}, {kind: 'throw', item: 'tomato', to: 'short'},
            {kind: 'throw', item: 'tomato', to: B, extra: 1}, {kind: 'shout', item: 'hi'}, {kind: 'react', item: 'toString'},
        ];
        for (const raw of bad) {
            expect(parseEmote(raw), JSON.stringify(raw)).toBeNull();
            expect(EmoteSchema.safeParse(raw).success, JSON.stringify(raw)).toBe(false);
        }
        // Not a plain object (a class instance, an object with a prototype of its own): no emote.
        expect(parseEmote(Object.assign(Object.create({inherited: true}), {kind: 'react', item: 'laugh'}))).toBeNull();
    });

    it('agrees with the route\'s schema on every registry id', () => {
        const all = [
            ...REACTION_IDS.flatMap((item) => [{kind: 'react', item}, {kind: 'say', item}, {kind: 'throw', item, to: B}]),
            ...PHRASE_IDS.flatMap((item) => [{kind: 'react', item}, {kind: 'say', item}, {kind: 'throw', item, to: B}]),
            ...THROW_IDS.flatMap((item) => [{kind: 'react', item}, {kind: 'say', item}, {kind: 'throw', item, to: B}, {kind: 'throw', item, to: '!'}]),
        ];
        for (const raw of all) expect(EmoteSchema.safeParse(raw).success, JSON.stringify(raw)).toBe(parseEmote(raw) !== null);
    });

    it('reads a message off the channel only when every part is one', () => {
        const ok = msg({kind: 'throw', item: 'egg', to: B, id: 'AbC_-12345x', seq: 7, from: A, at: T0} as Partial<EmoteMessage> & {kind: 'throw'});
        expect(readEmote(ok)).toEqual(ok);
        expect(readEmote(msg({kind: 'say', item: 'gg'}))).toEqual(msg({kind: 'say', item: 'gg'}));
        for (const raw of [{...ok, seq: 0}, {...ok, seq: 1.5}, {...ok, from: 'x'}, {...ok, at: 'now'}, {...ok, id: ''}, {...ok, id: 'has space'},
            {...ok, item: 'snowball'}, {...ok, extra: true}, null, 'x']) {
            expect(readEmote(raw), JSON.stringify(raw)).toBeNull();
        }
    });

    it('copies an emote out field by field', () => {
        const e = msg({kind: 'throw', item: 'rose', to: B} as Partial<EmoteMessage> & {kind: 'throw'});
        const out = emoteOut({...e, secret: 'x'} as unknown as EmoteMessage);
        expect(out).toEqual(e);
        expect(Object.keys(emoteOut(msg({kind: 'react'}))).sort()).toEqual(['at', 'from', 'id', 'item', 'kind', 'seq']);
    });
});

describe('who may send what', () => {
    const seated = new Set([A, B]);
    const ctx = {from: A, seated, throwables: true};

    it('lets a seated player react, say and throw at another seated player', () => {
        expect(checkEmote({kind: 'react', item: 'clap'}, ctx)).toBe('ok');
        expect(checkEmote({kind: 'say', item: 'gg'}, ctx)).toBe('ok');
        expect(checkEmote({kind: 'throw', item: 'tomato', to: B}, ctx)).toBe('ok');
    });

    it('refuses a watcher, throws with throwables off, at oneself and at nobody seated', () => {
        expect(checkEmote({kind: 'react', item: 'clap'}, {...ctx, from: C})).toBe('not-seated');
        expect(checkEmote({kind: 'throw', item: 'tomato', to: B}, {...ctx, from: C})).toBe('not-seated');
        expect(checkEmote({kind: 'throw', item: 'tomato', to: B}, {...ctx, throwables: false})).toBe('throwables-off');
        expect(checkEmote({kind: 'say', item: 'hi'}, {...ctx, throwables: false})).toBe('ok');
        expect(checkEmote({kind: 'throw', item: 'egg', to: A}, ctx)).toBe('self-target');
        expect(checkEmote({kind: 'throw', item: 'egg', to: C}, ctx)).toBe('no-target');
    });

    it('answers each refusal with a code: 403 for throwables off', () => {
        expect(EMOTE_REFUSALS).toEqual({'not-seated': 'not_seated', 'throwables-off': 'forbidden', 'no-target': 'invalid_action', 'self-target': 'invalid_action'});
        expect(errorStatus(EMOTE_REFUSALS['throwables-off'])).toBe(403);
    });
});

describe('the room\'s write', () => {
    const ref = {env: 'development' as const, id: 'room1'};

    it('is one conditional update: the sender\'s cooldown in the filter, the seq from the write', () => {
        expect(EMOTE_COOLDOWN_MS).toBe(LIMITS.emoteCooldownMs);
        expect(EMOTE_COOLDOWN_MS).toBe(1200);
        const {filter, pipeline} = emoteWrite(ref, {kind: 'react', item: 'laugh', id: 'e1', from: A, at: T0}, {now: T0, cooldownMs: 1200});
        expect(filter).toEqual({_id: 'room1', env: 'development', expiresAt: {$gt: new Date(T0)}, [`emoteAt.${A}`]: {$not: {$gt: T0 - 1200}}});
        expect(pipeline[0]).toEqual({$set: {emoteSeq: {$add: [{$ifNull: ['$emoteSeq', 0]}, 1]}}});
        const set = (pipeline[1] as {$set: Record<string, unknown>}).$set;
        expect(set[`emoteAt.${A}`]).toEqual({$literal: T0});
        expect(set.emotes).toEqual({
            $slice: [{$concatArrays: [{$ifNull: ['$emotes', []]}, [{$mergeObjects: [{$literal: {kind: 'react', item: 'laugh', id: 'e1', from: A, at: T0}}, {seq: '$emoteSeq'}]}]]}, -KEEP.EMOTES],
        });
        expect(Object.keys(set).sort()).toEqual([`emoteAt.${A}`, 'emotes'].sort());
    });

    it('counts a throw for the night summary, thrown by the sender and received by the target', () => {
        expect(awardPaths(A, B, 'tomato')).toEqual({thrown: `awards.${A}.thrown.tomato`, received: `awards.${B}.received.tomato`});
        const {pipeline} = emoteWrite(ref, {kind: 'throw', item: 'tennis-ball', to: B, id: 'e2', from: A, at: T0}, {now: T0, cooldownMs: 1200});
        const set = (pipeline[1] as {$set: Record<string, unknown>}).$set;
        expect(set[`awards.${A}.thrown.tennis-ball`]).toEqual({$add: [{$ifNull: [`$awards.${A}.thrown.tennis-ball`, 0]}, 1]});
        expect(set[`awards.${B}.received.tennis-ball`]).toEqual({$add: [{$ifNull: [`$awards.${B}.received.tennis-ball`, 0]}, 1]});
    });

    it('reads who is seated and the host\'s throwables from the projection', () => {
        const t = emoteTableFromDoc({state: {seats: [{pid: A}, null, {pid: B}, {nope: 1}], settings: {throwables: false}}, status: 'playing'});
        expect([...t.seated].sort()).toEqual([A, B]);
        expect(t.throwables).toBe(false);
        expect(t.closed).toBe(false);
        expect(emoteTableFromDoc({state: {seats: [{pid: A}]}, status: 'closed'})).toEqual({seated: new Set([A]), throwables: true, closed: true});
        expect(emoteTableFromDoc({})).toEqual({seated: new Set(), throwables: true, closed: false});
    });
});

describe('drawing them', () => {
    const show = {me: A, muteAll: false, muted: new Set<string>(), now: T0};

    it('shows the viewer\'s own always, others\' unless muted, none older than 8 s', () => {
        expect(EMOTE_TIMING).toEqual({burstMs: 1800, phraseMs: 3200, flightMs: 750, impactMs: 2400, staleMs: 8000});
        expect(emoteShows({from: B, at: T0}, show)).toBe(true);
        expect(emoteShows({from: B, at: T0}, {...show, muteAll: true})).toBe(false);
        expect(emoteShows({from: A, at: T0}, {...show, muteAll: true})).toBe(true);
        expect(emoteShows({from: B, at: T0}, {...show, muted: new Set([B])})).toBe(false);
        expect(emoteShows({from: C, at: T0}, {...show, muted: new Set([B])})).toBe(true);
        expect(emoteShows({from: B, at: T0 - 8000}, show)).toBe(true);
        expect(emoteShows({from: B, at: T0 - 8001}, show)).toBe(false);
        expect(emoteShows({from: A, at: T0 - 8001}, show)).toBe(false);
    });

    it('puts each kind on screen for its own time, a throw in flight unless motion is reduced', () => {
        expect(liveFor(msg({kind: 'react'}), 0, false)).toMatchObject({phase: 'burst', anchor: A, until: 1800});
        expect(liveFor(msg({kind: 'say', item: 'gg'}), 0, false)).toMatchObject({phase: 'phrase', anchor: A, until: 3200});
        const thrown = msg({kind: 'throw', item: 'egg', to: B} as Partial<EmoteMessage> & {kind: 'throw'});
        expect(liveFor(thrown, 0, false)).toMatchObject({phase: 'flight', anchor: B, until: 750});
        expect(liveFor(thrown, 0, true)).toMatchObject({phase: 'impact', anchor: B, until: 2400});
        expect(landed(liveFor(thrown, 0, false), 750)).toMatchObject({phase: 'impact', until: 750 + 2400});
    });

    it('lands a flight, then lets everything go at its time', () => {
        const thrown = liveFor(msg({kind: 'throw', item: 'egg', to: B, id: 't'} as Partial<EmoteMessage> & {kind: 'throw'}), 0, false);
        const burst = liveFor(msg({kind: 'react', id: 'r'}), 0, false);
        const items = [thrown, burst];
        expect(settle(items, 100)).toBe(items);
        expect(nextChange(items)).toBe(750);
        const at750 = settle(items, 750);
        expect(at750.map((i) => [i.key, i.phase])).toEqual([['t', 'impact'], ['r', 'burst']]);
        expect(settle(at750, 1800).map((i) => i.key)).toEqual(['t']);
        expect(settle(settle(at750, 1800), 750 + 2400)).toEqual([]);
        expect(nextChange([])).toBeNull();
    });

    it('keeps at most three per player and 24 in all, the oldest going first; a new phrase replaces the bubble', () => {
        let items: LiveEmote[] = [];
        for (let i = 0; i < 5; i++) items = admit(items, liveFor(msg({kind: 'react', id: `a${i}`}), i, false));
        expect(items.map((i) => i.key)).toEqual(['a2', 'a3', 'a4']);
        items = admit(items, liveFor(msg({kind: 'say', item: 'hi', id: 's1', from: B}), 5, false));
        items = admit(items, liveFor(msg({kind: 'say', item: 'gg', id: 's2', from: B}), 6, false));
        expect(items.filter((i) => i.anchor === B).map((i) => i.key)).toEqual(['s2']);
        // The same id twice is one.
        expect(admit(items, items[0]).length).toBe(items.length);
        let many: LiveEmote[] = [];
        for (let i = 0; i < 40; i++) many = admit(many, liveFor(msg({kind: 'react', id: `m${i}`, from: `P${String(i).padStart(10, '0')}`}), i, false));
        expect(many).toHaveLength(ON_SCREEN_CAP.total);
        expect(many[0].key).toBe('m16');
    });

    it('nudges a reaction sideways from its id, within 14 px', () => {
        const nudges = Array.from({length: 200}, (_, i) => burstJitter(`id-${i}`));
        for (const n of nudges) expect(Math.abs(n)).toBeLessThanOrEqual(14);
        expect(new Set(nudges).size).toBeGreaterThan(10);
        expect(burstJitter('same')).toBe(burstJitter('same'));
    });

    it('flies a throw from the sender\'s plate to the target\'s, over an arc that grows with the distance', () => {
        expect(throwPath({x: 100, y: 400}, {x: 300, y: 100})).toEqual({dx: -200, dy: 300, arc: Math.round(Math.hypot(200, 300) * 0.35)});
        expect(throwPath({x: 0, y: 0}, {x: 10, y: 0}).arc).toBe(40);
        expect(throwPath({x: 0, y: 0}, {x: 2000, y: 0}).arc).toBe(160);
    });

    it('keeps a throw\'s arc under its ceiling, never flatter than MIN_ARC', () => {
        // From the bottom middle up to a seat along the top: the free arc (160) would peak far above it.
        expect(throwPath({x: 700, y: 640}, {x: 700, y: 36}, -10)).toEqual({dx: 0, dy: 604, arc: 46});
        expect(throwPath({x: 700, y: 640}, {x: 700, y: 36})).toMatchObject({arc: 160});
        // Between two seats along the top, it still lifts.
        expect(throwPath({x: 200, y: 20}, {x: 900, y: 20}, 10).arc).toBe(MIN_ARC);
        // Far under the ceiling, the arc is the free one.
        expect(throwPath({x: 100, y: 500}, {x: 300, y: 500}, 0).arc).toBe(70);
    });

    it('sounds each landing by its impact: a splat only for a splat', () => {
        expect(THROW_IDS.filter((id) => landingSound(id) === 'splat').sort()).toEqual(['cake', 'egg', 'tomato']);
        expect(landingSound('rose')).toBe('pop');
        expect(landingSound('heart')).toBe('pop');
        expect(landingSound('confetti')).toBe('pop');
        expect(landingSound('soda')).toBe('fizz');
        expect(landingSound('tennis-ball')).toBe('bounce');
        expect(landingSound('fish')).toBe('bounce');
        for (const id of THROW_IDS) expect(SOUND_IDS).toContain(landingSound(id));
    });

    it('keeps one impact on a plate: a new landing takes the old one\'s place', () => {
        const at = (id: string, to: string) => msg({kind: 'throw', item: 'tomato', to, id} as Partial<EmoteMessage> & {kind: 'throw'});
        // Reduced motion: impacts go straight on screen.
        let items: LiveEmote[] = [];
        items = admit(items, liveFor(at('t1', B), 0, true));
        items = admit(items, liveFor(at('t2', C), 100, true));
        items = admit(items, liveFor(at('t3', B), 1200, true));
        expect(items.map((i) => i.key)).toEqual(['t2', 't3']);
        // In flight: each lands at its time, the latest landing on a plate the only impact there —
        // one player throwing at another every 1.2 s keeps one splat on that plate, never a pile.
        let flying: LiveEmote[] = [];
        flying = admit(flying, liveFor(at('f1', B), 0, false));
        flying = settle(flying, 750);
        flying = admit(flying, liveFor(at('f2', B), 1200, false));
        expect(flying.map((i) => [i.key, i.phase])).toEqual([['f1', 'impact'], ['f2', 'flight']]);
        flying = settle(flying, 1950);
        expect(flying.map((i) => [i.key, i.phase])).toEqual([['f2', 'impact']]);
        // Two landing in the same beat on one plate: the later one stays.
        let both = [liveFor(at('g1', B), 0, false), liveFor(at('g2', B), 10, false), liveFor(at('g3', C), 10, false)];
        both = settle(both, 800);
        expect(both.map((i) => i.key)).toEqual(['g2', 'g3']);
    });

    // Where a reaction and a phrase sit, for every table from a phone to a desktop: never past the
    // table's top room (behind the top bar), never over the seat's turned-up cards, and under every
    // plate along the top. A throw's peak stays under the top bar too.
    describe('by the plates', () => {
        const BOXES = [{w: 320, h: 384}, {w: 378, h: 600}, {w: 390, h: 630}, {w: 414, h: 700}, {w: 592, h: 327}, {w: 768, h: 800}, {w: 1024, h: 560}, {w: 1428, h: 698}, {w: 1920, h: 900}];
        const layouts = BOXES.flatMap((box) => SEAT_COUNTS.flatMap((n) => [0, Math.floor(n / 2)].map((me) => stageLayout(box, n, me))));
        const BUBBLE = EMOTE_SIZES.bubble;

        it('sits over a plate where it fits, under one along the top, and stays below the top bar', () => {
            let over = 0;
            let under = 0;
            for (const stage of layouts) {
                const half = stage.plateSize.h / 2;
                for (const place of stage.seats) {
                    for (const shown of [false, true]) {
                        const spot = emoteSpot(place, stage, shown);
                        expect(spot.x).toBe(place.plate.x);
                        if (place.spot.side === 'top') expect(spot.below).toBe(true);
                        if (spot.below) {
                            under++;
                            expect(spot.y).toBeGreaterThanOrEqual(place.plate.y + half + EMOTE_SIZES.flag);
                        } else {
                            over++;
                            expect(spot.y).toBeLessThanOrEqual(place.plate.y - half);
                            // The reaction's whole rise, its glyph on top, stays under the top bar.
                            expect(spot.y - EMOTE_SIZES.rise - reactionPx(stage.fit)).toBeGreaterThanOrEqual(emoteCeiling(stage.fit));
                        }
                        // The turned-up cards: over a bottom or side plate, under a top one — never under the bubble.
                        if (shown) {
                            const cardH = SHOWN_CARD_PX[stage.fit] * CARD_RATIO;
                            const cards = place.spot.side === 'top'
                                ? {top: place.plate.y + half + 10, bottom: place.plate.y + half + 10 + cardH}
                                : {top: place.plate.y - half - 3 - cardH, bottom: place.plate.y - half - 3};
                            const bubble = spot.below ? {top: spot.y - 5, bottom: spot.y + BUBBLE} : {top: spot.y - BUBBLE, bottom: spot.y + 5};
                            expect(bubble.bottom <= cards.top || bubble.top >= cards.bottom, JSON.stringify({box: stage.box, seat: place.seat, spot, cards})).toBe(true);
                        }
                    }
                }
            }
            expect(over).toBeGreaterThan(0);
            expect(under).toBeGreaterThan(0);
        });

        it('clears the action tag over a plate, and under one whose bet line sits over it', () => {
            const stage = stageLayout({w: 1428, h: 698}, 6, 0);
            const bottom = stage.seats.find((p) => p.spot.side === 'bottom')!;
            const side = stage.seats.find((p) => p.spot.side === 'left')!;
            const half = stage.plateSize.h / 2;
            expect(emoteSpot(side, stage, false).y).toBeLessThanOrEqual(side.plate.y - half - EMOTE_SIZES.tag);
            // A bottom seat's tag hangs under its plate (data-over), so its bubble sits close over it.
            expect(bottom.bet.y < bottom.plate.y - half).toBe(true);
            expect(emoteSpot(bottom, stage, false).y).toBe(Math.round(bottom.plate.y - half - EMOTE_SIZES.gap));
            const top = stage.seats.find((p) => p.spot.side === 'top')!;
            expect(emoteSpot(top, stage, true).y).toBe(Math.round(top.plate.y + half + 10 + SHOWN_CARD_PX[stage.fit] * CARD_RATIO + EMOTE_SIZES.gap));
        });

        it('peaks every throw under the top bar, between any two seats', () => {
            for (const stage of layouts) {
                for (const a of stage.seats) {
                    for (const b of stage.seats) {
                        if (a === b) continue;
                        const from = avatarCentre(a, stage);
                        const to = avatarCentre(b, stage);
                        const path = throwPath(from, to, throwCeiling(stage.fit));
                        expect(path.arc).toBeGreaterThanOrEqual(MIN_ARC);
                        const peak = Math.min(from.y, to.y) - path.arc;
                        expect(peak - throwPx(stage.fit) / 2, JSON.stringify({box: stage.box, a: a.seat, b: b.seat, path})).toBeGreaterThanOrEqual(emoteCeiling(stage.fit));
                    }
                }
            }
        });
    });

    it('scatters the same pieces on every screen for the same emote', () => {
        for (const impact of IMPACT_KINDS) {
            const bits = impactBits('e1', impact);
            expect(impactBits('e1', impact)).toEqual(bits);
            for (const b of bits) {
                expect(Math.abs(b.x)).toBeLessThanOrEqual(80);
                expect(Math.abs(b.y)).toBeLessThanOrEqual(80);
                expect(b.delay).toBeGreaterThanOrEqual(0);
            }
            if (impact === 'fizz') for (const b of bits) expect(b.y).toBeLessThan(0);
            if (impact === 'petals') for (const b of bits) expect(b.y).toBeGreaterThan(0);
        }
        expect(impactBits('e1', 'bounce')).toEqual([]);
        expect(impactBits('e1', 'burst')).not.toEqual(impactBits('e2', 'burst'));
    });
});

describe('the impacts\' CSS', () => {
    it('has a colour pair for every throwable, as six-digit hex', () => {
        expect(Object.keys(IMPACT_COLOURS).sort()).toEqual([...THROW_IDS].sort());
        for (const id of THROW_IDS) {
            expect(isHex6(IMPACT_COLOURS[id].main), id).toBe(true);
            expect(isHex6(IMPACT_COLOURS[id].light), id).toBe(true);
        }
    });

    it('is data-attribute blocks of literals only, safe inside a <style> tag', () => {
        expect(EMOTE_CSS).toBe(buildEmoteCss());
        expect(EMOTE_CSS).not.toMatch(/<|url\(|expression|@import|\\/i);
        const blocks = EMOTE_CSS.split('\n');
        expect(blocks).toHaveLength(THROW_IDS.length);
        for (const [i, id] of THROW_IDS.entries()) {
            expect(blocks[i]).toBe(`[data-splat="${id}"]{--pn-splat:${IMPACT_COLOURS[id].main};--pn-splat-light:${IMPACT_COLOURS[id].light}}`);
        }
    });
});
